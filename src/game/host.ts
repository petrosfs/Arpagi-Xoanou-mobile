import { StatsRecorder, type MatchStats } from './stats';
import {
  DECISION_TIMEOUT_MS, allFlip, applyDecision, autoDecide, canGrab, createGame, flip, leave, resolveGrabs,
  setConnected, type DecisionChoice, type GameConfig, type GameState, type GrabAttempt,
} from '../engine';
import { BOT_FLIP_MS, BOT_LEVELS, SEARCH_MS_PER_PLAYER, between, intBetween, type BotLevel } from '../solo/bots';
import { toView, type TableView } from './view';

/** Πόσο περιμένει ο host μετά το πρώτο άρπαγμα για να μαζέψει και τα υπόλοιπα (solo). */
export const GRAB_WINDOW_MS = 120;
/** Αντίστροφη μέτρηση πριν το ταυτόχρονο γύρισμα (βέλη έξω). */
export const ALL_FLIP_DELAY_MS = 1500;
export const BOT_DECISION_MS = 700;
/** Μετά από άρπαγμα ή ρίψη το ξόανο δεν είναι διαθέσιμο (κρατιέται ή ξαναστήνεται). */
export const TOTEM_HOLD_MS = 1200;
/** Μετά από απόφαση νικητή, μικρή παύση πριν ξαναμπεί το ξόανο στο τραπέζι. */
export const TOTEM_RETURN_MS = 500;
/** Πόσες παλιές καταστάσεις κρατά ο host για να κρίνει αρπάγματα που άργησαν να φτάσουν. */
const HISTORY = 24;

export interface HostOptions {
  ids: string[];
  bots: Record<string, BotLevel>;
  turnTimerS: number;
  symbols: number[];
  config: Partial<GameConfig>;
  seed?: number;
  /** Παράθυρο αρπάγματος (online μεγαλώνει με την καθυστέρηση του δικτύου). */
  grabWindowMs?: () => number;
  /** Συνέχιση από αποθηκευμένη κατάσταση (αλλαγή host). */
  resume?: { state: GameState; reactions: Record<string, number[]>; stats?: MatchStats };
}

/**
 * Ο «host»: κρατά την πλήρη κατάσταση, τα χρονόμετρα και τα bots, και κρίνει τα αρπάγματα.
 * Χρησιμοποιείται τόσο στο solo (όλα τοπικά) όσο και online (στο κινητό του host).
 */
export class HostGame {
  state: GameState;
  readonly levels: Record<string, BotLevel>;
  readonly reactions: Record<string, number[]> = {};
  readonly stats: StatsRecorder;
  turnDeadline = 0;
  decisionDeadline = 0;
  allFlipAt = 0;
  holdUntil = 0;
  heldBy: string | null = null;

  private timers: number[] = [];
  private botPlans = new Map<string, { timer: number; valid: boolean }>();
  private turnTimer = 0;
  private turnToken = '';
  private flips = 0;
  private pending: GrabAttempt[] = [];
  private windowTimer = 0;
  private history = new Map<number, GameState>();
  private recheckBots = false;
  private rnd: () => number;
  private stopped = false;

  constructor(protected opts: HostOptions, private onChange: (s: GameState) => void) {
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    let r = seed;
    this.rnd = () => ((r = (Math.imul(r ^ (r >>> 15), 1 | r) + 0x6d2b79f5) | 0), ((r >>> 0) % 1e6) / 1e6);
    this.levels = { ...opts.bots };
    opts.ids.forEach((id) => (this.reactions[id] = opts.resume?.reactions[id] ? [...opts.resume.reactions[id]] : []));
    this.state = opts.resume
      ? { ...opts.resume.state, events: [] }
      : createGame(opts.ids, { ...opts.config, symbolCount: opts.symbols.length, seed });
    this.stats = new StatsRecorder(this.state, opts.resume?.stats);
  }

  get symbolMap() {
    return this.opts.symbols;
  }

  get totemHeld() {
    return this.state.phase === 'decision' || performance.now() < this.holdUntil;
  }

  start() {
    this.emit();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    this.botPlans.forEach((p) => clearTimeout(p.timer));
    this.botPlans.clear();
    clearTimeout(this.turnTimer);
    clearTimeout(this.windowTimer);
  }

  /** Τι βλέπουν οι παίκτες αυτή τη στιγμή. */
  view(): TableView {
    const now = performance.now();
    return toView(this.state, {
      held: this.totemHeld && this.state.phase !== 'ended',
      heldBy: this.heldBy,
      turnLeftMs: this.turnDeadline ? this.turnDeadline - now : 0,
      decisionLeftMs: this.decisionDeadline ? this.decisionDeadline - now : 0,
      allFlipLeftMs: this.allFlipAt ? this.allFlipAt - now : 0,
      reactions: this.reactions,
      stats: this.stats.data,
    });
  }

  // ---------- κινήσεις παικτών ----------

  flipBy(id: string) {
    if (this.totemHeld || this.windowTimer) return;
    this.apply(flip(this.state, id));
  }

  /** Άρπαγμα. seq: η κατάσταση που έβλεπε ο παίκτης όταν άρπαξε. */
  grabBy(id: string, a: Omit<GrabAttempt, 'playerId'>, seq?: number) {
    if (this.state.phase !== 'playing' || this.totemHeld) return;
    if (seq !== undefined && seq !== this.state.seq && !canGrab(this.state, id)) {
      // Το άρπαγμα έφτασε αφού άλλαξε το τραπέζι. Αν ήταν σωστό σε αυτό που έβλεπε, δεν τιμωρείται.
      const seen = this.history.get(seq);
      if (seen && canGrab(seen, id)) return;
    }
    this.submit({ ...a, playerId: id });
  }

  decideBy(id: string, choice: DecisionChoice) {
    this.decide(applyDecision(this.state, id, choice));
  }

  setConnected(id: string, connected: boolean) {
    this.apply(setConnected(this.state, id, connected));
  }

  leave(id: string) {
    this.apply(leave(this.state, id));
  }

  // ---------- εσωτερικά ----------

  private decide(next: GameState) {
    if (next === this.state) return;
    this.holdUntil = performance.now() + TOTEM_RETURN_MS;
    this.apply(next);
  }

  private apply(next: GameState) {
    if (next === this.state || this.stopped) return;
    this.stats.record(this.state, next);
    this.state = next;
    this.emit();
  }

  private emit() {
    for (const e of this.state.events) if (e.type === 'flip' || e.type === 'allFlip') this.flips++;
    this.history.set(this.state.seq, this.state);
    if (this.history.size > HISTORY) this.history.delete(this.history.keys().next().value!);
    this.schedule();
    this.onChange(this.state);
  }

  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private submit(a: GrabAttempt) {
    if (this.totemHeld) return;
    if (canGrab(this.state, a.playerId) && a.onTarget) this.reactions[a.playerId]?.push(Math.round(a.reactionMs));
    this.pending.push(a);
    if (this.windowTimer) return;
    const windowMs = this.opts.grabWindowMs?.() ?? GRAB_WINDOW_MS;
    this.windowTimer = window.setTimeout(() => {
      const attempts = this.pending;
      this.pending = [];
      this.windowTimer = 0;
      const next = resolveGrabs(this.state, attempts);
      if (next === this.state) return;
      // Ποιος κρατάει το ξόανο: ο νικητής ή όποιος το άρπαξε λάθος. Αν έπεσε, κανείς.
      this.heldBy = null;
      for (const e of next.events) {
        if (e.type === 'duel' || e.type === 'inward') this.heldBy = e.winner;
        if (e.type === 'penalty' && e.reason === 'wrong') this.heldBy = e.playerId;
      }
      if (next.phase === 'decision' && next.decision) this.heldBy = next.decision.by;
      this.holdUntil = performance.now() + TOTEM_HOLD_MS;
      this.apply(next);
    }, windowMs);
  }

  private isBot(id: string) {
    return id in this.levels;
  }

  private schedule() {
    this.clearTimers();
    const s = this.state;
    const now = performance.now();
    this.decisionDeadline = 0;
    this.allFlipAt = 0;
    this.updateBotPlans();
    if (s.phase === 'ended') {
      this.cancelTurnTimer();
      this.botPlans.forEach((p) => clearTimeout(p.timer));
      this.botPlans.clear();
      return;
    }

    if (s.phase === 'decision' && s.decision) {
      this.cancelTurnTimer();
      const by = s.players.find((p) => p.id === s.decision!.by);
      const away = !by || by.status !== 'active';
      if (this.isBot(s.decision.by) || away) {
        this.later(away ? 300 : BOT_DECISION_MS, () => this.decide(autoDecide(this.state)));
      } else {
        this.decisionDeadline = now + DECISION_TIMEOUT_MS;
        this.later(DECISION_TIMEOUT_MS, () => this.decide(autoDecide(this.state)));
      }
      return;
    }

    // Όσο το ξόανο κρατιέται: κανένα γύρισμα, κανένα άρπαγμα. Μετά συνεχίζουμε.
    const holdLeft = this.holdUntil - now;
    if (holdLeft > 0) {
      this.cancelTurnTimer();
      this.later(holdLeft, () => {
        this.holdUntil = 0;
        this.heldBy = null;
        this.recheckBots = true;
        this.schedule();
        this.onChange(this.state);
      });
      return;
    }

    if (s.pendingAllFlip) {
      this.cancelTurnTimer();
      this.allFlipAt = now + ALL_FLIP_DELAY_MS;
      this.later(ALL_FLIP_DELAY_MS, () => this.apply(allFlip(this.state)));
      return;
    }

    const cur = s.players[s.turn];
    if (cur.status !== 'active' || cur.deck.length === 0) return this.cancelTurnTimer();
    // Η «σειρά» αλλάζει μόνο όταν γυρίσει κάρτα ή αλλάξει παίκτης, όχι σε κάθε μονομαχία.
    const token = `${cur.id}:${this.flips}`;
    if (token === this.turnToken && this.turnTimer) return;
    this.cancelTurnTimer();
    this.turnToken = token;
    const ms = this.isBot(cur.id) ? between(this.rnd, BOT_FLIP_MS) : this.opts.turnTimerS * 1000;
    if (!this.isBot(cur.id)) this.turnDeadline = now + ms;
    const fire = () => {
      // Όσο κάποιος αρπάζει το ξόανο, κανείς δεν γυρίζει κάρτα: αλλιώς ένα ταίρι θα καλυπτόταν
      // ανάμεσα στο άρπαγμα και την κρίση του, και ο σωστός παίκτης θα τιμωρούνταν άδικα.
      if (this.windowTimer) {
        this.turnTimer = window.setTimeout(fire, 40);
        return;
      }
      this.turnTimer = 0;
      this.turnDeadline = 0;
      this.apply(flip(this.state, cur.id));
    };
    this.turnTimer = window.setTimeout(fire, ms);
  }

  private cancelTurnTimer() {
    clearTimeout(this.turnTimer);
    this.turnTimer = 0;
    this.turnDeadline = 0;
    this.turnToken = '';
  }

  /** Κρατά τα σχέδια που ισχύουν ακόμα, ακυρώνει όσα δεν ισχύουν, φτιάχνει νέα σε νέα κάρτα. */
  private updateBotPlans() {
    const s = this.state;
    // Νέα κάρτα, ή επιστροφή του ξόανου: αν μένει μονομαχία στο τραπέζι, συνεχίζει να υφίσταται.
    const revealed = s.events.some((e) => e.type === 'flip' || e.type === 'allFlip') || this.recheckBots;
    if (this.totemHeld) {
      this.botPlans.forEach((p) => clearTimeout(p.timer));
      this.botPlans.clear();
      return;
    }
    for (const id of Object.keys(this.levels)) {
      const plan = this.botPlans.get(id);
      const entitled = s.phase === 'playing' && canGrab(s, id);
      if (plan && (!plan.valid || !entitled)) {
        clearTimeout(plan.timer);
        this.botPlans.delete(id);
      }
      if (!this.botPlans.has(id) && revealed && s.phase === 'playing') this.planBotGrab(id, entitled);
    }
    this.recheckBots = false;
  }

  private planBotGrab(id: string, entitled: boolean) {
    const p = BOT_LEVELS[this.levels[id]];
    if (entitled && this.rnd() < p.miss) return;
    if (!entitled && this.rnd() >= p.wrong) return;
    const extra = SEARCH_MS_PER_PLAYER * Math.max(0, this.state.players.length - 2);
    const reactionMs = between(this.rnd, p.reaction) + extra;
    const attempt: GrabAttempt = {
      playerId: id,
      reactionMs,
      fingers: intBetween(this.rnd, p.fingers),
      baseScore: between(this.rnd, p.base),
      onTarget: true,
    };
    const timer = window.setTimeout(() => {
      this.botPlans.delete(id);
      if (this.state.phase === 'playing') this.submit(attempt);
    }, reactionMs);
    this.botPlans.set(id, { timer, valid: entitled });
  }
}
