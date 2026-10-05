import type { DecisionChoice, GrabAttempt } from '../engine';
import type { BotLevel } from '../solo/bots';
import { BOT_LEVELS } from '../solo/bots';
import type { HostGame } from './host';
import type { TableView } from './view';

/**
 * Ό,τι χρειάζεται η οθόνη παιχνιδιού, ανεξάρτητα αν η παρτίδα τρέχει τοπικά (solo, ή online ως host)
 * ή σε άλλο κινητό (online ως απλός παίκτης).
 */
export interface Session {
  readonly me: string;
  readonly symbolMap: number[];
  readonly view: TableView;
  /** Πότε ήρθε η τρέχουσα εικόνα (για τις αντίστροφες μετρήσεις). */
  readonly receivedAt: number;
  /** Πότε ζωγραφίστηκε η τελευταία νέα κατάσταση στην οθόνη (για τον χρόνο αντίδρασης). */
  readonly displayedAt: number;
  name(id: string): string;
  level(id: string): BotLevel | undefined;
  flip(): void;
  grab(a: Omit<GrabAttempt, 'playerId'>): void;
  decide(choice: DecisionChoice): void;
  markDisplayed(seq: number, t: number): void;
  subscribe(cb: (v: TableView) => void): () => void;
  /** Κείμενο κατάστασης σύνδεσης (online), αλλιώς κενό. */
  connection(): string;
  quit(): void;
}

/** Κοινά: παρακολούθηση εμφάνισης και συνδρομητές. */
export abstract class BaseSession implements Session {
  abstract readonly me: string;
  abstract readonly symbolMap: number[];
  abstract view: TableView;
  receivedAt = performance.now();
  displayedAt = performance.now();
  protected displayedSeq = -1;
  private subs = new Set<(v: TableView) => void>();

  abstract name(id: string): string;
  level(_id: string): BotLevel | undefined {
    return undefined;
  }
  abstract flip(): void;
  abstract grab(a: Omit<GrabAttempt, 'playerId'>): void;
  abstract decide(choice: DecisionChoice): void;
  abstract quit(): void;
  connection() {
    return '';
  }

  markDisplayed(seq: number, t: number) {
    if (seq !== this.displayedSeq) {
      this.displayedSeq = seq;
      this.displayedAt = t;
    }
  }

  subscribe(cb: (v: TableView) => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  protected publish(v: TableView) {
    this.view = v;
    this.receivedAt = performance.now();
    this.subs.forEach((cb) => cb(v));
  }
}

/** Παρτίδα που τρέχει σε αυτό το κινητό (solo ή online ως host). */
export class LocalSession extends BaseSession {
  view: TableView;

  constructor(
    readonly host: HostGame,
    readonly me: string,
    private names: (id: string) => string,
    private onQuit: () => void = () => host.stop(),
  ) {
    super();
    this.view = host.view();
  }

  get symbolMap() {
    return this.host.symbolMap;
  }

  name(id: string) {
    return this.names(id);
  }

  level(id: string) {
    return this.host.levels[id];
  }

  /** Ο host καλεί αυτό σε κάθε αλλαγή. */
  update() {
    this.publish(this.host.view());
  }

  flip() {
    this.host.flipBy(this.me);
  }

  grab(a: Omit<GrabAttempt, 'playerId'>) {
    this.host.grabBy(this.me, a);
  }

  decide(choice: DecisionChoice) {
    this.host.decideBy(this.me, choice);
  }

  quit() {
    this.onQuit();
  }
}

export const botLabel = (lv: BotLevel) => BOT_LEVELS[lv].label;
