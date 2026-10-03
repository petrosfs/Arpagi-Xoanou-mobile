import { describe, expect, it } from 'vitest';
import {
  allFlip, applyDecision, autoDecide, buildDeck, canGrab, createGame, flip, leave, matchesOf,
  resolveGrabs, setConnected, totalCards, type Card, type Color, type GameState, type GrabAttempt,
} from './index';

let nextId = 10000;
const S = (symbol: number, color: Color = 0): Card => ({ id: nextId++, kind: 'symbol', symbol, color });
const IN = (): Card => ({ id: nextId++, kind: 'inward' });
const OUT = (): Card => ({ id: nextId++, kind: 'outward' });
const COL = (): Card => ({ id: nextId++, kind: 'colors' });
const grab = (playerId: string, reactionMs: number, extra: Partial<GrabAttempt> = {}): GrabAttempt => ({
  playerId, reactionMs, fingers: 1, baseScore: 0.5, onTarget: true, ...extra,
});

/** Παρτίδα με ελεγχόμενες στοίβες. decks[i] = κλειστή στοίβα, discards[i] = ανοιχτή. */
function setup(decks: Card[][], discards: Card[][] = [], cfg: Record<string, unknown> = {}): GameState {
  const ids = decks.map((_, i) => 'p' + i);
  const s = createGame(ids, { seed: 1, threePlayerRule: false, ...cfg });
  s.players.forEach((p, i) => {
    p.deck = decks[i];
    p.discard = discards[i] ?? [];
  });
  s.pot = [];
  return s;
}

describe('τράπουλα', () => {
  it('80 κάρτες για ως 8 παίκτες, 160 για 9–10', () => {
    expect(buildDeck(4, 12, true)).toHaveLength(80);
    expect(buildDeck(10, 12, true)).toHaveLength(160);
  });
  it('χωρίς χρωματιστά βέλη στον κανόνα 3 παικτών', () => {
    expect(buildDeck(3, 12, false).filter((c) => c.kind === 'colors')).toHaveLength(0);
  });
  it('κάθε σύμβολο εμφανίζεται ισόποσα (±1) και σε πολλά χρώματα', () => {
    for (const n of [12, 15, 21]) {
      const sym = buildDeck(4, n, true).filter((c) => c.kind === 'symbol') as Extract<Card, { kind: 'symbol' }>[];
      const counts = Array.from({ length: n }, (_, k) => sym.filter((c) => c.symbol === k).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      const colorsOf0 = new Set(sym.filter((c) => c.symbol === 0).map((c) => c.color));
      expect(colorsOf0.size).toBeGreaterThan(1);
    }
  });
});

describe('δημιουργία', () => {
  it('μοιράζει ισόποσα, τα υπόλοιπα στο pot', () => {
    const s = createGame(['a', 'b', 'c'], { seed: 7, threePlayerRule: false });
    expect(s.players.map((p) => p.deck.length)).toEqual([26, 26, 26]);
    expect(s.pot).toHaveLength(2);
    expect(totalCards(s)).toBe(80);
  });
  it('ίδιο seed => ίδιο μοίρασμα', () => {
    const a = createGame(['a', 'b'], { seed: 42 });
    const b = createGame(['a', 'b'], { seed: 42 });
    expect(a.players[0].deck).toEqual(b.players[0].deck);
  });
  it('ελέγχει όρια παικτών και συμβόλων', () => {
    expect(() => createGame(['a'], { seed: 1 })).toThrow();
    expect(() => createGame(['a', 'b'], { seed: 1, symbolCount: 11 })).toThrow();
    expect(() => createGame(['a', 'b'], { seed: 1, symbolCount: 22 })).toThrow();
  });
});

describe('γύρισμα και σειρά', () => {
  it('μόνο ο παίκτης στη σειρά γυρίζει, μετά πάει δεξιόστροφα', () => {
    let s = setup([[S(1)], [S(2)], [S(3)]]);
    expect(flip(s, 'p1')).toBe(s);
    s = flip(s, 'p0');
    expect(s.players[0].discard).toHaveLength(1);
    expect(s.turn).toBe(1);
  });
  it('παραλείπει αποσυνδεδεμένους και όσους δεν έχουν κλειστή στοίβα', () => {
    let s = setup([[S(1), S(4)], [S(2)], [], [S(5)]], [[], [], [S(9)], []]);
    s = setConnected(s, 'p1', false);
    s = flip(s, 'p0');
    expect(s.players[s.turn].id).toBe('p3');
  });
});

describe('μονομαχία', () => {
  it('ο χαμένος παίρνει τις δύο στοίβες και το pot, και ξεκινά', () => {
    let s = setup([[S(1)], [S(7), S(3)], [S(5)]], [[S(2)], [], [S(1)]]);
    s.pot = [S(9)];
    s = flip(s, 'p0'); // p0: 1, p2: 1 => ταίρι
    expect(matchesOf(s, 'p0')).toEqual(['p2']);
    const before = totalCards(s);
    s = resolveGrabs(s, [grab('p2', 300), grab('p0', 400)]);
    expect(s.players[0].deck.length).toBe(2 + 1 + 1); // η στοίβα του (2) + του p2 (1) + pot (1)
    expect(s.players[2].discard).toHaveLength(0);
    expect(s.pot).toHaveLength(0);
    expect(totalCards(s)).toBe(before);
    expect(s.players[s.turn].id).toBe('p0');
    expect(s.players[2].stats.duelsWon).toBe(1);
  });
  it('το χρώμα δεν μετράει στη λειτουργία συμβόλων', () => {
    const s = flip(setup([[S(1, 0)], [S(8)]], [[], [S(1, 3)]]), 'p0');
    expect(matchesOf(s, 'p0')).toEqual(['p1']);
  });
  it('λάθος άρπαγμα: παίρνει όλες τις ανοιχτές και το pot', () => {
    let s = setup([[S(1)], [S(2)], [S(3)]], [[S(4)], [S(5)], [S(6)]]);
    s.pot = [S(9)];
    s = resolveGrabs(s, [grab('p1', 200)]);
    expect(s.players[1].deck).toHaveLength(1 + 3 + 1);
    expect(s.players.every((p) => p.discard.length === 0)).toBe(true);
    expect(s.players[1].stats.wrongGrabs).toBe(1);
  });
  it('ρίψη (εκτός στόχου) = ποινή, ακόμα κι αν δικαιούταν', () => {
    let s = setup([[S(1)], [S(2)]], [[], [S(1)]]);
    s = flip(s, 'p0');
    s = resolveGrabs(s, [grab('p0', 100, { onTarget: false })]);
    expect(s.players[0].stats.drops).toBe(1);
    expect(s.players[0].deck).toHaveLength(2);
  });
  it('ισοπαλία: δάχτυλα, μετά βάση', () => {
    const base = setup([[S(1)], [S(2)]], [[], [S(1)]]);
    const s0 = flip(base, 'p0');
    const a = resolveGrabs(s0, [grab('p0', 300, { fingers: 2 }), grab('p1', 290, { fingers: 4 })]);
    expect(a.players[1].stats.duelsWon).toBe(1);
    const b = resolveGrabs(s0, [grab('p0', 300, { fingers: 3, baseScore: 0.9 }), grab('p1', 290, { fingers: 3, baseScore: 0.2 })]);
    expect(b.players[0].stats.duelsWon).toBe(1);
    const c = resolveGrabs(s0, [grab('p0', 300, { fingers: 1 }), grab('p1', 200, { fingers: 5 })]);
    expect(c.players[1].stats.duelsWon).toBe(1); // 100ms διαφορά: κερδίζει ο ταχύτερος
  });
  it('αποσυνδεδεμένος: η κάρτα του μετράει, χάνει αν ο άλλος αρπάξει', () => {
    let s = setup([[S(1)], [S(2)], [S(3)]], [[], [S(1)], []]);
    s = setConnected(s, 'p1', false);
    s = flip(s, 'p0');
    expect(canGrab(s, 'p1')).toBe(false);
    s = resolveGrabs(s, [grab('p1', 100), grab('p0', 400)]); // το άρπαγμα του p1 αγνοείται
    expect(s.players[0].stats.duelsWon).toBe(1);
    expect(s.players[1].deck.length).toBeGreaterThan(0);
  });
});

describe('πολλοί χαμένοι', () => {
  it('ίσο μοίρασμα, τα υπόλοιπα τα διαλέγει ο νικητής', () => {
    let s = setup([[S(1), S(20)], [S(8)], [S(8)]], [[S(5), S(6), S(7), S(9), S(10)], [S(1)], [S(1)]]);
    s.pot = [];
    // ο p0 γυρίζει 1 => ταιριάζει με p1 και p2. Ο p0 κερδίζει: η στοίβα του (6 κάρτες) => 3/3
    s = flip(s, 'p0');
    s = resolveGrabs(s, [grab('p0', 200)]);
    expect(s.phase).toBe('playing');
    expect(s.players[1].deck.length).toBe(1 + 1 + 3);
    // 7 κάρτες => 3+3 και 1 υπόλοιπο
    let t = setup([[S(1), S(20)], [S(8)], [S(8)]], [[S(5), S(6), S(7), S(9), S(10), S(11)], [S(1)], [S(1)]]);
    t = flip(t, 'p0');
    t = resolveGrabs(t, [grab('p0', 200)]);
    expect(t.phase).toBe('decision');
    expect(t.decision?.type).toBe('remainder');
    const before = totalCards(t);
    expect(applyDecision(t, 'p1', { type: 'remainder', losers: ['p2'] })).toBe(t); // όχι ο νικητής
    t = applyDecision(t, 'p0', { type: 'remainder', losers: ['p2'] });
    expect(t.phase).toBe('playing');
    expect(t.players[2].deck.length).toBe(t.players[1].deck.length + 1);
    expect(totalCards(t)).toBe(before);
  });
  it('winnerChooses: όλα σε έναν χαμένο', () => {
    let s = setup([[S(1), S(20)], [S(8)], [S(8)]], [[S(5)], [S(1)], [S(1)]], { distribution: 'winnerChooses' });
    s = flip(s, 'p0');
    s = resolveGrabs(s, [grab('p0', 200)]);
    expect(s.decision?.type).toBe('chooseLoser');
    s = applyDecision(s, 'p0', { type: 'chooseLoser', loser: 'p1' });
    expect(s.players[1].deck.length).toBe(1 + 1 + 2);
  });
  it('autoDecide δίνει έγκυρη απόφαση', () => {
    let s = setup([[S(1), S(20)], [S(8)], [S(8)]], [[S(5)], [S(1)], [S(1)]], { distribution: 'winnerChooses' });
    s = resolveGrabs(flip(s, 'p0'), [grab('p0', 200)]);
    const before = totalCards(s);
    s = autoDecide(s);
    expect(s.phase).toBe('playing');
    expect(totalCards(s)).toBe(before);
  });
});

describe('ειδικές κάρτες', () => {
  it('βέλη μέσα: ο πρώτος βάζει τη στοίβα του στο pot και ξεκινά', () => {
    let s = setup([[IN(), S(9)], [S(2)], [S(3)]], [[S(4)], [S(5), S(6)], [S(7)]]);
    s = flip(s, 'p0');
    expect(canGrab(s, 'p2')).toBe(true);
    s = resolveGrabs(s, [grab('p1', 250), grab('p2', 400)]);
    expect(s.pot).toHaveLength(2);
    expect(s.players[1].discard).toHaveLength(0);
    expect(s.players[s.turn].id).toBe('p1');
  });
  it('βέλη μέσα + μονομαχία: ο νικητής διαλέγει', () => {
    let s = setup([[IN(), S(20)], [S(2)], [S(3)]], [[], [S(1)], [S(1)]]);
    s = flip(s, 'p0');
    s = resolveGrabs(s, [grab('p1', 200)]);
    expect(s.decision?.type).toBe('inwardOrDuel');
    const duel = applyDecision(s, 'p1', { type: 'inwardOrDuel', pick: 'duel' });
    expect(duel.players[2].deck.length).toBe(1 + 2);
    const inward = applyDecision(s, 'p1', { type: 'inwardOrDuel', pick: 'inward' });
    expect(inward.pot).toHaveLength(1);
  });
  it('χρωματιστά βέλη: ταίρι με χρώμα ως την επόμενη μονομαχία', () => {
    let s = setup([[COL(), S(1, 2)], [S(5, 1)], [S(6, 2)]], [[], [S(3, 1)], [S(4, 0)]]);
    s = flip(s, 'p0');
    expect(s.matchMode).toBe('color');
    s = flip(s, 'p1'); // p1 top: 5/χρώμα 1
    s = flip(s, 'p2'); // p2 top: 6/χρώμα 2
    s = flip(s, 'p0'); // p0 top: 1/χρώμα 2 => ταίρι χρώματος με p2
    expect(matchesOf(s, 'p0')).toEqual(['p2']);
    s = resolveGrabs(s, [grab('p0', 200)]);
    expect(s.matchMode).toBe('symbol');
  });
  it('βέλη έξω: όλοι γυρίζουν μαζί, συνεχίζει όποιος τα γύρισε', () => {
    let s = setup([[OUT(), S(1), S(10)], [S(2), S(9)], [S(3), S(9)]]);
    s = flip(s, 'p0');
    expect(s.pendingAllFlip).toBe(true);
    expect(flip(s, 'p1')).toBe(s); // κανείς δεν γυρίζει κανονικά
    s = allFlip(s);
    expect(s.players.map((p) => p.discard.length)).toEqual([2, 1, 1]);
    expect(s.pendingAllFlip).toBe(false);
    expect(s.players[s.turn].id).toBe('p0');
  });
  it('βέλη έξω χωρίς ταίρι και νέο βέλη έξω: ξανά ταυτόχρονο', () => {
    let s = setup([[OUT(), S(1), S(9)], [OUT(), S(8)], [S(3), S(9)]]);
    s = flip(s, 'p0');
    s = allFlip(s);
    expect(s.pendingAllFlip).toBe(true);
  });
  it('κανόνας 3 παικτών: τρία ίδια χρώματα = βέλη μέσα', () => {
    let s = setup([[S(1, 2)], [S(5)], [S(6)]], [[], [S(2, 2)], [S(3, 2)]], { threePlayerRule: true });
    s.threeRuleActive = true;
    s = flip(s, 'p0');
    expect(s.inwardActive).toBe(true);
  });
});

describe('τελευταία κάρτα και τέλος', () => {
  it('ξεφορτώνεται τα πάντα => νικά (firstWinner τερματίζει)', () => {
    let s = setup([[S(1)], [S(5), S(6)]], [[], [S(1)]]);
    s = flip(s, 'p0');
    s = resolveGrabs(s, [grab('p0', 200)]);
    expect(s.phase).toBe('ended');
    expect(s.ranking[0]).toBe('p0');
  });
  it('βέλη έξω ως τελευταία κάρτα => νικά αμέσως', () => {
    let s = setup([[OUT()], [S(5)]], [[S(2)], []]);
    s = flip(s, 'p0');
    expect(s.ranking[0]).toBe('p0');
  });
  it('χρωματιστά βέλη ως τελευταία κάρτα => μαζεύει τις ανοιχτές', () => {
    let s = setup([[COL()], [S(5)]], [[S(2)], [S(3)]]);
    s = flip(s, 'p0');
    expect(s.players[0].deck).toHaveLength(3);
    expect(s.matchMode).toBe('symbol');
  });
  it('βέλη μέσα ως τελευταία κάρτα και δεν τα αρπάζει => μαζεύει τις ανοιχτές', () => {
    let s = setup([[IN()], [S(5)], [S(6)]], [[S(2)], [S(3)], [S(4)]]);
    s = flip(s, 'p0');
    s = resolveGrabs(s, [grab('p1', 200)]);
    expect(s.players[0].deck.length).toBe(4); // η στοίβα του (2) + p1 (1) + p2 (1)
  });
  it('αν μείνει ένας: νικητής, οι άλλοι αντίστροφα με τη σειρά αποχώρησης', () => {
    let s = setup([[S(1)], [S(2)], [S(3)]]);
    s = leave(s, 'p1');
    s = leave(s, 'p2');
    expect(s.phase).toBe('ended');
    expect(s.ranking).toEqual(['p0', 'p2', 'p1']);
  });
  it('οι κάρτες όποιου φεύγει πάνε στο pot ή βγαίνουν', () => {
    const a = leave(setup([[S(1)], [S(2), S(3)], [S(4)]]), 'p1');
    expect(a.pot).toHaveLength(2);
    const b = leave(setup([[S(1)], [S(2), S(3)], [S(4)]], [], { leaverCards: 'remove' }), 'p1');
    expect(b.pot).toHaveLength(0);
  });
});

describe('προσομοίωση', () => {
  it('τυχαίες παρτίδες: δεν χάνονται κάρτες και τελειώνουν', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const n = 2 + (seed % 9);
      const ids = Array.from({ length: n }, (_, i) => 'p' + i);
      let s = createGame(ids, { seed, endMode: seed % 2 ? 'firstWinner' : 'fullRanking' });
      const total = totalCards(s);
      let rnd = seed;
      const r = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let step = 0; step < 20000 && s.phase !== 'ended'; step++) {
        if (s.phase === 'decision') s = autoDecide(s);
        else if (s.pendingAllFlip) s = allFlip(s);
        else {
          const grabbers = ids.filter((id) => canGrab(s, id));
          if (grabbers.length && r() < 0.9) s = resolveGrabs(s, grabbers.map((id) => grab(id, 200 + r() * 400)));
          else if (r() < 0.02) s = resolveGrabs(s, [grab(ids[Math.floor(r() * n)], 300)]);
          else s = flip(s, s.players[s.turn].id);
        }
        expect(totalCards(s)).toBe(total);
      }
      expect(s.phase).toBe('ended');
    }
  });
});
