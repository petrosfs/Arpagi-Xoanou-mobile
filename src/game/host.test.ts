import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { canGrab, createGame, flip, resolveGrabs, type Card, type GameState } from '../engine';
import { HostGame } from './host';

beforeAll(() => {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
});
afterEach(() => vi.useRealTimers());

let nid = 70000;
const S = (symbol: number, color: 0 | 1 | 2 | 3 = 0): Card => ({ id: nid++, kind: 'symbol', symbol, color });
const grab = (playerId: string, reactionMs: number) => ({ playerId, reactionMs, fingers: 1, baseScore: 0.5, onTarget: true });

/** Τραπέζι με δύο ταίρια: me–b3 (σύμβολο 5, μόλις γυρίζει ο me) και b1–b2 (σύμβολο 2, ήδη ορατό). */
function twoDuels(): GameState {
  const s = createGame(['me', 'b1', 'b2', 'b3'], { seed: 3, threePlayerRule: false });
  const set = (i: number, deck: Card[], discard: Card[]) => ((s.players[i].deck = deck), (s.players[i].discard = discard));
  set(0, [S(5), S(9), S(9)], [S(7)]);
  set(1, [S(8), S(8)], [S(2, 1)]);
  set(2, [S(10), S(10)], [S(2, 3)]);
  set(3, [S(11), S(11)], [S(5, 2)]);
  s.pot = [];
  s.turn = 0;
  return s;
}

describe('πολλές μονομαχίες', () => {
  it('μηχανή: μετά την πρώτη, η δεύτερη υπάρχει ακόμα και παίζεται', () => {
    let s = flip(twoDuels(), 'me');
    expect(canGrab(s, 'b1') && canGrab(s, 'b3')).toBe(true);
    s = resolveGrabs(s, [grab('b3', 300), grab('b1', 400)]); // κερδίζει η μονομαχία me–b3
    expect(s.players[3].stats.duelsWon).toBe(1);
    expect(canGrab(s, 'b1')).toBe(true); // η b1–b2 δεν ακυρώθηκε
    s = resolveGrabs(s, [grab('b2', 350)]);
    expect(s.players[2].stats.duelsWon).toBe(1);
  });

  it('host: τα bots παίζουν και τη δεύτερη μονομαχία όταν επιστρέψει το ξόανο', () => {
    vi.useFakeTimers();
    const host = new HostGame(
      {
        ids: ['me', 'b1', 'b2', 'b3'],
        bots: { b1: 'impossible', b2: 'impossible', b3: 'impossible' },
        turnTimerS: 180,
        symbols: Array.from({ length: 12 }, (_, i) => i),
        config: { threePlayerRule: false },
        seed: 9,
        resume: { state: twoDuels(), reactions: {} },
      },
      () => {},
    );
    // Τα bots δεν χάνουν ποτέ ταίρι σε αυτό το τεστ.
    (host as unknown as { rnd: () => number }).rnd = () => 0.5;
    host.start();
    host.flipBy('me'); // γυρίζει το 5: ταίρι με το b3, ενώ το b1–b2 υπάρχει ήδη
    // Ο άνθρωπος κερδίζει την πρώτη μονομαχία και ξεκινά τον γύρο, αλλά δεν γυρίζει κάρτα.
    // Έτσι η δεύτερη μονομαχία μπορεί να παιχτεί μόνο αν τα bots ξανακοιτάξουν το τραπέζι.
    host.grabBy('me', { reactionMs: 150, fingers: 1, baseScore: 0.5, onTarget: true }, host.state.seq);
    vi.advanceTimersByTime(8000);
    expect(host.state.players[0].stats.duelsWon).toBe(1);
    const won = host.state.players.reduce((n, p) => n + p.stats.duelsWon, 0);
    expect(won).toBe(2);
    expect(host.state.players.slice(1, 3).some((p) => p.stats.duelsWon === 1)).toBe(true);
    host.stop();
  });
});
