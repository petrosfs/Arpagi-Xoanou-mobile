import {
  DECISION_TIMEOUT_MS, allFlip, applyDecision, autoDecide, canGrab, createGame, flip, resolveGrabs,
  type DecisionChoice, type GameConfig, type GameState, type GrabAttempt,
} from '../engine';
import { BOT_FLIP_MS, BOT_LEVELS, between, intBetween, type BotLevel } from './bots';

/** Πόσο περιμένει ο host μετά το πρώτο άρπαγμα για να μαζέψει και τα υπόλοιπα. */
export const GRAB_WINDOW_MS = 120;
/** Αντίστροφη μέτρηση πριν το ταυτόχρονο γύρισμα (βέλη έξω). */
export const ALL_FLIP_DELAY_MS = 1500;
export const BOT_DECISION_MS = 700;

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

  private timers: number[] = [];
  private pending: GrabAttempt[] = [];
  private windowTimer = 0;
  private lastRevealSeq = -1;
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

  humanGrab(a: Omit<GrabAttempt, 'playerId'>) {
    if (this.state.phase !== 'playing') return;
    this.submit({ ...a, playerId: HUMAN });
  }

  humanDecide(choice: DecisionChoice) {
    this.apply(applyDecision(this.state, HUMAN, choice));
  }

  // ---------- εσωτερικά ----------

  private apply(next: GameState) {
    if (next === this.state) return;
    this.state = next;
    this.emit();
  }

  private emit() {
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
    if (canGrab(s, a.playerId) && a.onTarget) this.reactions[a.playerId]?.push(Math.round(a.reactionMs));
    this.pending.push(a);
    if (this.windowTimer) return;
    this.windowTimer = window.setTimeout(() => {
      const attempts = this.pending;
      this.pending = [];
      this.windowTimer = 0;
      this.apply(resolveGrabs(this.state, attempts));
    }, GRAB_WINDOW_MS);
  }

  private schedule() {
    this.clearTimers();
    const s = this.state;
    const now = performance.now();
    this.turnDeadline = 0;
    this.decisionDeadline = 0;
    this.allFlipAt = 0;
    if (s.phase === 'ended') return;

    if (s.phase === 'decision' && s.decision) {
      if (s.decision.by === HUMAN) {
        this.decisionDeadline = now + DECISION_TIMEOUT_MS;
        this.later(DECISION_TIMEOUT_MS, () => this.apply(autoDecide(this.state)));
      } else this.later(BOT_DECISION_MS, () => this.apply(autoDecide(this.state)));
      return;
    }

    // Νέα αποκάλυψη κάρτας => τα bots αποφασίζουν αν θα αρπάξουν.
    const revealed = s.events.some((e) => e.type === 'flip' || e.type === 'allFlip');
    if (revealed && s.seq !== this.lastRevealSeq) {
      this.lastRevealSeq = s.seq;
      for (const id of Object.keys(this.levels)) this.planBotGrab(id);
    }

    if (s.pendingAllFlip) {
      this.allFlipAt = now + ALL_FLIP_DELAY_MS;
      this.later(ALL_FLIP_DELAY_MS, () => this.apply(allFlip(this.state)));
      return;
    }

    const cur = s.players[s.turn];
    if (cur.status !== 'active' || cur.deck.length === 0) return;
    if (cur.id === HUMAN) {
      const ms = this.opts.turnTimerS * 1000;
      this.turnDeadline = now + ms;
      this.later(ms, () => this.humanFlip());
    } else {
      this.later(between(this.rnd, BOT_FLIP_MS), () => this.apply(flip(this.state, cur.id)));
    }
  }

  private planBotGrab(id: string) {
    const p = BOT_LEVELS[this.levels[id]];
    const s = this.state;
    const entitled = canGrab(s, id);
    if (entitled && this.rnd() < p.miss) return;
    if (!entitled && this.rnd() >= p.wrong) return;
    const reactionMs = between(this.rnd, p.reaction);
    const attempt: GrabAttempt = {
      playerId: id,
      reactionMs,
      fingers: intBetween(this.rnd, p.fingers),
      baseScore: between(this.rnd, p.base),
      onTarget: true,
    };
    const seq = s.seq;
    this.later(reactionMs, () => {
      if (this.state.seq === seq && this.state.phase === 'playing') this.submit(attempt);
    });
  }
}
