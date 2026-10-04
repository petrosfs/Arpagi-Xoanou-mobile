import {
  DECISION_TIMEOUT_MS, allFlip, applyDecision, autoDecide, canGrab, createGame, flip, resolveGrabs,
  type DecisionChoice, type GameConfig, type GameState, type GrabAttempt,
} from '../engine';
import { BOT_FLIP_MS, BOT_LEVELS, SEARCH_MS_PER_PLAYER, between, intBetween, type BotLevel } from './bots';

/** Πόσο περιμένει ο host μετά το πρώτο άρπαγμα για να μαζέψει και τα υπόλοιπα. */
export const GRAB_WINDOW_MS = 120;
/** Αντίστροφη μέτρηση πριν το ταυτόχρονο γύρισμα (βέλη έξω). */
export const ALL_FLIP_DELAY_MS = 1500;
export const BOT_DECISION_MS = 700;
/** Μετά από άρπαγμα ή ρίψη το ξόανο δεν είναι διαθέσιμο (κρατιέται ή ξαναστήνεται). */
export const TOTEM_HOLD_MS = 1200;
/** Μετά από απόφαση νικητή, μικρή παύση πριν ξαναμπεί το ξόανο στο τραπέζι. */
export const TOTEM_RETURN_MS = 500;

export const HUMAN = 'you';

export interface SoloOptions {
  bots: BotLevel[];
  config: Partial<GameConfig>;
  turnTimerS: number;
  /** Δείκτες στον κατάλογο συμβόλων, με τη σειρά που τα χρησιμοποιεί η μηχανή. */
  symbols: number[];
  seed?: number;
}

export interface ReactionStats {
  [playerId: string]: number[];
}

/**
 * Ο «host» του solo παιχνιδιού: κρατά την κατάσταση, κινεί τα bots και μαζεύει τα αρπάγματα.
 * Ο ίδιος σχεδιασμός θα χρησιμοποιηθεί online, με τον host σε ένα κινητό.
 */
export class SoloGame {
  state: GameState;
  readonly levels: Record<string, BotLevel> = {};
  readonly reactions: ReactionStats = {};
  /** Πότε εμφανίστηκε στην οθόνη η τελευταία κατάσταση (για τον χρόνο αντίδρασης του παίκτη). */
  displayedAt = 0;
  displayedSeq = -1;
  turnDeadline = 0;
  decisionDeadline = 0;
  allFlipAt = 0;
  /** Ως πότε το ξόανο δεν είναι διαθέσιμο και ποιος το κρατάει (null = έπεσε). */
  holdUntil = 0;
  heldBy: string | null = null;

  private timers: number[] = [];
  /** Σχέδια αρπάγματος των bots: μένουν όσο ισχύει το ταίρι, δεν ξαναξεκινούν σε κάθε κάρτα. */
  private botPlans = new Map<string, { timer: number; valid: boolean }>();
  private turnTimer = 0;
  private turnToken = '';
  private flips = 0;
  private pending: GrabAttempt[] = [];
  private windowTimer = 0;
  private rnd: () => number;

  constructor(private opts: SoloOptions, private onChange: (s: GameState) => void) {
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    let r = seed;
    this.rnd = () => ((r = (Math.imul(r ^ (r >>> 15), 1 | r) + 0x6d2b79f5) | 0), ((r >>> 0) % 1e6) / 1e6);
    const ids = [HUMAN, ...opts.bots.map((_, i) => `bot${i + 1}`)];
    opts.bots.forEach((lv, i) => (this.levels[`bot${i + 1}`] = lv));
    ids.forEach((id) => (this.reactions[id] = []));
    this.state = createGame(ids, { ...opts.config, symbolCount: opts.symbols.length, seed });
  }

  get symbolMap() {
    return this.opts.symbols;
  }

  start() {
    this.emit();
  }

  stop() {
    this.clearTimers();
    this.botPlans.forEach((p) => clearTimeout(p.timer));
    this.botPlans.clear();
    clearTimeout(this.turnTimer);
    clearTimeout(this.windowTimer);
  }

  /** Η οθόνη ενημερώνει πότε ζωγράφισε την τρέχουσα κατάσταση. */
  markDisplayed(seq: number, t: number) {
    if (seq !== this.displayedSeq) {
      this.displayedSeq = seq;
      this.displayedAt = t;
    }
  }

  humanFlip() {
    this.apply(flip(this.state, HUMAN));
  }

  get totemHeld() {
    return this.state.phase === 'decision' || performance.now() < this.holdUntil;
  }

  humanGrab(a: Omit<GrabAttempt, 'playerId'>) {
    if (this.state.phase !== 'playing' || this.totemHeld) return;
    this.submit({ ...a, playerId: HUMAN });
  }

  humanDecide(choice: DecisionChoice) {
    this.decide(applyDecision(this.state, HUMAN, choice));
  }

  private decide(next: GameState) {
    if (next === this.state) return;
    this.holdUntil = performance.now() + TOTEM_RETURN_MS;
    this.apply(next);
  }

  // ---------- εσωτερικά ----------

  private apply(next: GameState) {
    if (next === this.state) return;
    this.state = next;
    this.emit();
  }

  private emit() {
    for (const e of this.state.events) if (e.type === 'flip' || e.type === 'allFlip') this.flips++;
    this.onChange(this.state);
    this.schedule();
  }

  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private submit(a: GrabAttempt) {
    const s = this.state;
    if (this.totemHeld) return;
    if (canGrab(s, a.playerId) && a.onTarget) this.reactions[a.playerId]?.push(Math.round(a.reactionMs));
    this.pending.push(a);
    if (this.windowTimer) return;
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
    }, GRAB_WINDOW_MS);
  }

  private schedule() {
    this.clearTimers();
    const s = this.state;
    const now = performance.now();
    this.decisionDeadline = 0;
    this.allFlipAt = 0;
    this.updateBotPlans();
    if (s.phase === 'ended') {
      this.stop();
      return;
    }

    if (s.phase === 'decision' && s.decision) {
      this.cancelTurnTimer();
      if (s.decision.by === HUMAN) {
        this.decisionDeadline = now + DECISION_TIMEOUT_MS;
        this.later(DECISION_TIMEOUT_MS, () => this.decide(autoDecide(this.state)));
      } else this.later(BOT_DECISION_MS, () => this.decide(autoDecide(this.state)));
      return;
    }

    // Όσο το ξόανο κρατιέται: κανένα γύρισμα, κανένα άρπαγμα. Μετά συνεχίζουμε.
    const holdLeft = this.holdUntil - now;
    if (holdLeft > 0) {
      this.cancelTurnTimer();
      this.later(holdLeft, () => {
        this.holdUntil = 0;
        this.heldBy = null;
        this.onChange(this.state);
        this.schedule();
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
    if (cur.id === HUMAN) {
      const ms = this.opts.turnTimerS * 1000;
      this.turnDeadline = now + ms;
      this.turnTimer = window.setTimeout(() => {
        this.turnTimer = 0;
        this.humanFlip();
      }, ms);
    } else {
      this.turnTimer = window.setTimeout(() => {
        this.turnTimer = 0;
        this.apply(flip(this.state, cur.id));
      }, between(this.rnd, BOT_FLIP_MS));
    }
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
    const revealed = s.events.some((e) => e.type === 'flip' || e.type === 'allFlip');
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
