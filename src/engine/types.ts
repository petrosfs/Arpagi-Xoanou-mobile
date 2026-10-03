// Τύποι της μηχανής κανόνων. Η μηχανή είναι καθαρή (χωρίς DOM/δίκτυο) και ντετερμινιστική:
// ίδια κατάσταση + ίδια ενέργεια => ίδιο αποτέλεσμα. Έτσι ο host μπορεί να τη μοιράζεται με όλους.

export type Color = 0 | 1 | 2 | 3; // ώχρα, τερακότα, πράσινο, μπλε

export interface SymbolCard {
  id: number;
  kind: 'symbol';
  symbol: number; // δείκτης στο επιλεγμένο σετ συμβόλων (0..symbolCount-1)
  color: Color;
}

export type SpecialKind = 'inward' | 'outward' | 'colors';

export interface SpecialCard {
  id: number;
  kind: SpecialKind;
}

export type Card = SymbolCard | SpecialCard;

/** 'equal': ίσο μοίρασμα, τα υπόλοιπα κατ' επιλογή νικητή. 'winnerChooses': όλα σε έναν χαμένο της επιλογής του. */
export type DistributionMode = 'equal' | 'winnerChooses';
export type EndMode = 'firstWinner' | 'fullRanking';
export type LeaverCards = 'pot' | 'remove';

export interface GameConfig {
  symbolCount: number; // 12..21
  distribution: DistributionMode;
  threePlayerRule: boolean;
  endMode: EndMode;
  leaverCards: LeaverCards;
  seed: number;
}

export const DEFAULT_CONFIG: Omit<GameConfig, 'seed'> = {
  symbolCount: 12,
  distribution: 'equal',
  threePlayerRule: true,
  endMode: 'firstWinner',
  leaverCards: 'pot',
};

export const MIN_SYMBOLS = 12;
export const MAX_SYMBOLS = 21;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
/** Χρόνοι αντίδρασης με διαφορά ως και τόσα ms θεωρούνται ισοπαλία (αρχική τιμή, ρυθμίζεται με δοκιμές). */
export const TIE_MS = 30;

export type PlayerStatus = 'active' | 'disconnected' | 'left' | 'finished';

export interface PlayerStats {
  duelsWon: number;
  duelsLost: number;
  wrongGrabs: number;
  drops: number;
}

export interface PlayerState {
  id: string;
  /** Κλειστή στοίβα. Η πάνω κάρτα είναι το deck[0]. */
  deck: Card[];
  /** Ανοιχτή στοίβα απόρριψης. Η πάνω (ορατή) κάρτα είναι η τελευταία. */
  discard: Card[];
  status: PlayerStatus;
  stats: PlayerStats;
}

/** Ένα άρπαγμα όπως το μέτρησε το κινητό του παίκτη. */
export interface GrabAttempt {
  playerId: string;
  /** ms από την εμφάνιση της κρίσιμης κάρτας στην οθόνη του ως το πρώτο άγγιγμα. */
  reactionMs: number;
  /** Δάχτυλα πάνω στο ξόανο. */
  fingers: number;
  /** 0..1, όσο μεγαλύτερο τόσο πιο κοντά στη βάση. */
  baseScore: number;
  /** false = το άγγιγμα έπεσε έξω από το ξόανο (ρίψη). */
  onTarget: boolean;
}

export type PendingDecision =
  | { type: 'inwardOrDuel'; by: string }
  | { type: 'remainder'; by: string; losers: string[]; cards: Card[]; count: number }
  | { type: 'chooseLoser'; by: string; losers: string[]; cards: Card[] };

export type DecisionChoice =
  | { type: 'inwardOrDuel'; pick: 'inward' | 'duel' }
  | { type: 'remainder'; losers: string[] }
  | { type: 'chooseLoser'; loser: string };

export type GameEvent =
  | { type: 'flip'; playerId: string; card: Card }
  | { type: 'allFlip'; flips: { playerId: string; card: Card }[] }
  | { type: 'duel'; winner: string; losers: string[] }
  | { type: 'inward'; winner: string }
  | { type: 'penalty'; playerId: string; reason: 'wrong' | 'drop' | 'lastColors' | 'lastInward' }
  | { type: 'finished'; playerId: string }
  | { type: 'left'; playerId: string }
  | { type: 'ended'; ranking: string[] };

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  /** Κάρτες κάτω από το ξόανο. */
  pot: Card[];
  /** Δείκτης του παίκτη που γυρίζει κάρτα. */
  turn: number;
  matchMode: 'symbol' | 'color';
  inwardActive: boolean;
  /** Παίκτης που γύρισε βέλη μέσα ως τελευταία του κάρτα. */
  lastCardInward: string | null;
  /** Εκκρεμεί ταυτόχρονο γύρισμα (βέλη έξω). */
  pendingAllFlip: boolean;
  outwardFlipper: string | null;
  /** Ισχύει ο κανόνας 3 παικτών σε αυτή την παρτίδα. */
  threeRuleActive: boolean;
  decision: PendingDecision | null;
  phase: 'playing' | 'decision' | 'ended';
  /** Σειρά τερματισμού (όποιος ξεφορτώθηκε τις κάρτες του). */
  finishOrder: string[];
  leftOrder: string[];
  ranking: string[];
  rng: number;
  /** Αυξάνει σε κάθε αλλαγή που μπορεί να προκαλέσει άρπαγμα. Τα αρπάγματα αναφέρονται σε αυτό. */
  seq: number;
  events: GameEvent[];
}
