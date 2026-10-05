import type { Card, GameEvent, GameState, PlayerStats, PlayerStatus } from '../engine';

/**
 * Ό,τι χρειάζεται μια οθόνη για να ζωγραφίσει το τραπέζι. Ο host το φτιάχνει από την πλήρη
 * κατάσταση και το στέλνει στους παίκτες: μικρό (χωρίς τις κλειστές κάρτες) και χωρίς μυστικά.
 */
export interface PlayerView {
  id: string;
  status: PlayerStatus;
  deckCount: number;
  discardCount: number;
  top: Card | null;
  stats: PlayerStats;
}

export interface TableView {
  seq: number;
  phase: GameState['phase'];
  turnId: string;
  matchMode: GameState['matchMode'];
  inwardActive: boolean;
  pendingAllFlip: boolean;
  potCount: number;
  players: PlayerView[];
  decision: { type: 'inwardOrDuel' | 'remainder' | 'chooseLoser'; by: string; losers: string[]; count: number } | null;
  events: GameEvent[];
  ranking: string[];
  held: boolean;
  heldBy: string | null;
  /** Χρόνοι που απομένουν τη στιγμή που φτιάχτηκε η εικόνα (ms, 0 = κανένας). */
  turnLeftMs: number;
  decisionLeftMs: number;
  allFlipLeftMs: number;
  /** Χρόνοι αντίδρασης ανά παίκτη (για τη σύνοψη). */
  reactions: Record<string, number[]>;
}

export interface ViewExtras {
  held: boolean;
  heldBy: string | null;
  turnLeftMs: number;
  decisionLeftMs: number;
  allFlipLeftMs: number;
  reactions: Record<string, number[]>;
}

export function toView(s: GameState, x: ViewExtras): TableView {
  const d = s.decision;
  return {
    seq: s.seq,
    phase: s.phase,
    turnId: s.players[s.turn].id,
    matchMode: s.matchMode,
    inwardActive: s.inwardActive,
    pendingAllFlip: s.pendingAllFlip,
    potCount: s.pot.length,
    players: s.players.map((p) => ({
      id: p.id,
      status: p.status,
      deckCount: p.deck.length,
      discardCount: p.discard.length,
      top: p.discard[p.discard.length - 1] ?? null,
      stats: { ...p.stats },
    })),
    decision: d
      ? { type: d.type, by: d.by, losers: 'losers' in d ? [...d.losers] : [], count: d.type === 'remainder' ? d.count : 0 }
      : null,
    events: s.events,
    ranking: [...s.ranking],
    held: x.held,
    heldBy: x.heldBy,
    turnLeftMs: Math.max(0, Math.round(x.turnLeftMs)),
    decisionLeftMs: Math.max(0, Math.round(x.decisionLeftMs)),
    allFlipLeftMs: Math.max(0, Math.round(x.allFlipLeftMs)),
    reactions: s.phase === 'ended' ? x.reactions : {},
  };
}
