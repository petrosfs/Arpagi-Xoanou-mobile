import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { totalCards, type GameState } from '../engine';
import type { BotLevel } from './bots';
import { HUMAN, SoloGame, TOTEM_HOLD_MS } from './controller';
import { BOT_LEVELS, SEARCH_MS_PER_PLAYER } from './bots';

beforeAll(() => {
  // Ο host χρησιμοποιεί window.setTimeout· στο Node το window είναι το globalThis.
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
});
afterEach(() => vi.useRealTimers());

function play(bots: BotLevel[], seed: number, human: 'idle' | 'active', endMode: 'firstWinner' | 'fullRanking' = 'firstWinner') {
  vi.useFakeTimers();
  let last: GameState | null = null;
  let updates = 0;
  const g = new SoloGame(
    { bots, seed, turnTimerS: 5, symbols: Array.from({ length: 12 }, (_, i) => i), config: { endMode } },
    (s) => {
      last = s;
      updates++;
    },
  );
  g.start();
  const total = totalCards(g.state);
  let t = 0;
  while (g.state.phase !== 'ended' && t < 4 * 3600_000) {
    vi.advanceTimersByTime(100);
    t += 100;
    if (human === 'active') {
      const s = g.state;
      if (s.phase === 'decision' && s.decision?.by === HUMAN) {
        if (s.decision.type === 'inwardOrDuel') g.humanDecide({ type: 'inwardOrDuel', pick: 'inward' });
      } else if (s.phase === 'playing' && s.players[s.turn].id === HUMAN) g.humanFlip();
    }
    expect(totalCards(g.state)).toBe(total);
  }
  g.stop();
  return { g, last: last as GameState | null, updates, minutes: t / 60000 };
}

describe('host του solo', () => {
  it('ολοκληρώνει παρτίδες σε όλα τα επίπεδα, χωρίς απώλεια καρτών', () => {
    const levels: BotLevel[] = ['easy', 'medium', 'hard', 'impossible'];
    for (let seed = 1; seed <= 24; seed++) {
      const bots = Array.from({ length: 1 + (seed % 9) }, (_, i) => levels[(seed + i) % 4]);
      const { g } = play(bots, seed, seed % 2 ? 'idle' : 'active', seed % 3 ? 'firstWinner' : 'fullRanking');
      expect(g.state.phase).toBe('ended');
      expect(g.state.ranking).toHaveLength(bots.length + 1);
    }
  }, 120_000);

  it('τα bots αρπάζουν και στο Εύκολο (καταγράφονται χρόνοι αντίδρασης)', () => {
    const { g } = play(['easy', 'easy', 'easy'], 11, 'idle');
    const rts = ['bot1', 'bot2', 'bot3'].flatMap((id) => g.reactions[id]);
    expect(rts.length).toBeGreaterThan(5);
    const extra = SEARCH_MS_PER_PLAYER * 2; // 4 παίκτες
    expect(Math.min(...rts)).toBeGreaterThanOrEqual(BOT_LEVELS.easy.reaction[0] + extra);
    expect(Math.max(...rts)).toBeLessThanOrEqual(BOT_LEVELS.easy.reaction[1] + extra);
  }, 60_000);

  it('το Αδύνατο κερδίζει το Εύκολο στις περισσότερες παρτίδες', () => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { g } = play(['impossible', 'easy'], seed, 'idle');
      if (g.state.ranking[0] === 'bot1') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
  }, 120_000);

  it('το χρονόμετρο σειράς δεν ξαναξεκινά από μονομαχίες άλλων', () => {
    vi.useFakeTimers();
    const g = new SoloGame(
      { bots: ['impossible', 'impossible'], seed: 3, turnTimerS: 5, symbols: Array.from({ length: 12 }, (_, i) => i), config: {} },
      () => {},
    );
    g.start();
    // Περιμένουμε να έρθει η σειρά του παίκτη και σημειώνουμε την προθεσμία.
    let guard = 0;
    while (g.state.players[g.state.turn].id !== HUMAN && guard++ < 1000) vi.advanceTimersByTime(50);
    const deadline = g.turnDeadline;
    expect(deadline).toBeGreaterThan(0);
    vi.advanceTimersByTime(2000);
    if (g.state.players[g.state.turn].id === HUMAN) expect(g.turnDeadline).toBe(deadline);
    g.stop();
  });
});

describe('το ξόανο κρατιέται μετά από άρπαγμα', () => {
  it('κανένα άρπαγμα και κανένα γύρισμα ώσπου να επιστρέψει', () => {
    vi.useFakeTimers();
    const g = new SoloGame(
      { bots: ['impossible', 'impossible', 'impossible'], seed: 5, turnTimerS: 1, symbols: Array.from({ length: 12 }, (_, i) => i), config: {} },
      () => {},
    );
    g.start();
    let checked = 0;
    for (let t = 0; t < 600_000 && checked < 5 && g.state.phase !== 'ended'; t += 10) {
      const before = g.state;
      vi.advanceTimersByTime(10);
      const resolved = g.state !== before && g.state.events.some((e) => e.type === 'duel' || e.type === 'inward' || e.type === 'penalty');
      if (!resolved || g.state.phase !== 'playing') continue;
      checked++;
      expect(g.totemHeld).toBe(true);
      const held = g.state;
      g.humanGrab({ reactionMs: 1, fingers: 5, baseScore: 1, onTarget: true });
      vi.advanceTimersByTime(TOTEM_HOLD_MS - 50);
      expect(g.state).toBe(held); // τίποτα δεν άλλαξε όσο κρατιόταν
      vi.advanceTimersByTime(100);
      expect(g.totemHeld).toBe(false);
    }
    expect(checked).toBeGreaterThan(0);
    g.stop();
  }, 60_000);
});
