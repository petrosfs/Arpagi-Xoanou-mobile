import { describe, expect, it } from 'vitest';
import { createGame, flip, resolveGrabs, type Card, type GameState } from '../engine';
import { StatsRecorder, accuracy, awards } from './stats';

let nid = 50000;
const S = (symbol: number): Card => ({ id: nid++, kind: 'symbol', symbol, color: 0 });

function setup(decks: Card[][], discards: Card[][]): GameState {
  const s = createGame(decks.map((_, i) => 'p' + i), { seed: 1, threePlayerRule: false });
  s.players.forEach((p, i) => ((p.deck = decks[i]), (p.discard = discards[i])));
  s.pot = [S(30)];
  return s;
}

describe('στατιστικά παρτίδας', () => {
  it('γυρίσματα, μονομαχίες, μεγαλύτερη μονομαχία, διάρκεια, εξέλιξη καρτών', () => {
    let s = setup([[S(1), S(2)], [S(7), S(8)]], [[S(4), S(5)], [S(1)]]);
    const rec = new StatsRecorder(s, undefined, 1000);
    let next = flip(s, 'p0');
    rec.record(s, next, 2000);
    s = next;
    next = resolveGrabs(s, [{ playerId: 'p1', reactionMs: 300, fingers: 1, baseScore: 0.5, onTarget: true }]);
    rec.record(s, next, 3500);
    const d = rec.data;
    expect(d.flips).toEqual({ p0: 1, p1: 0 });
    expect(d.duels).toBe(1);
    // στοίβα νικητή (1) + pot (1) + στοίβα χαμένου (3) = 5
    expect(d.biggestDuel).toEqual({ cards: 5, winner: 'p1', losers: ['p0'] });
    expect(d.durationMs).toBe(2500);
    expect(d.timeline[0]).toEqual({ t: 0, c: [4, 3] });
    expect(d.timeline[d.timeline.length - 1].c).toEqual([6, 2]);
  });
  it('συνέχιση μετά από αλλαγή host', () => {
    const s = setup([[S(1)], [S(2)]], [[], []]);
    const a = new StatsRecorder(s, undefined, 0);
    a.record(s, flip(s, 'p0'), 5000);
    const b = new StatsRecorder(s, JSON.parse(JSON.stringify(a.data)));
    expect(b.data.flips.p0).toBe(1);
    expect(b.data.startedAt).toBe(0);
  });
  it('το γράφημα μένει ελαφρύ', () => {
    const s = setup([[S(1)], [S(2)]], [[], []]);
    const rec = new StatsRecorder(s, undefined, 0);
    for (let i = 0; i < 2000; i++) {
      const t = structuredClone(s);
      t.players[0].deck = Array.from({ length: i % 7 }, () => S(1));
      t.events = [];
      rec.record(s, t, i * 100);
    }
    expect(rec.data.timeline.length).toBeLessThanOrEqual(240);
    expect(rec.data.timeline[0].t).toBe(0);
  });
});

describe('ακρίβεια και διακρίσεις', () => {
  it('ακρίβεια', () => {
    expect(accuracy(3, 1, 1, 0)).toBe(80);
    expect(accuracy(0, 0, 0, 0)).toBeNull();
  });
  it('διακρίσεις μόνο όταν υπάρχουν δεδομένα, ισοπαλία υπέρ του ψηλότερου στην κατάταξη', () => {
    const list = awards([
      { id: 'a', best: 600, acc: 100, graded: 4, won: 3, lost: 0, mistakes: 0 },
      { id: 'b', best: 450, acc: 50, graded: 2, won: 3, lost: 2, mistakes: 1 },
      { id: 'c', best: null, acc: null, graded: 0, won: 0, lost: 2, mistakes: 0 },
    ]);
    const by = Object.fromEntries(list.map((x) => [x.key, x]));
    expect(by.fastest).toMatchObject({ id: 'b', value: '450 ms' });
    expect(by.accurate).toMatchObject({ id: 'a', value: '100%' });
    expect(by.duelist.id).toBe('a');
    expect(by.unlucky.id).toBe('b');
    expect(by.hasty.id).toBe('b');
    expect(awards([{ id: 'x', best: null, acc: null, graded: 0, won: 0, lost: 0, mistakes: 0 }])).toEqual([]);
  });
});
