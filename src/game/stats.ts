import type { GameState } from '../engine';

/** Στατιστικά μιας παρτίδας, πέρα από όσα κρατά η μηχανή (μονομαχίες, λάθη, ρίψεις ανά παίκτη). */
export interface MatchStats {
  /** Ώρα έναρξης (Date.now), ώστε να συνεχίζει σωστά και μετά από αλλαγή host. */
  startedAt: number;
  durationMs: number;
  flips: Record<string, number>;
  inwardWins: Record<string, number>;
  duels: number;
  specials: { inward: number; outward: number; colors: number };
  biggestDuel: { cards: number; winner: string; losers: string[] } | null;
  /** Κάρτες κάθε παίκτη στη διάρκεια της παρτίδας: t = δευτερόλεπτα από την έναρξη. */
  timeline: { t: number; c: number[] }[];
  ids: string[];
}

const MAX_POINTS = 240;

const cardsOf = (s: GameState) => s.players.map((p) => p.deck.length + p.discard.length);

export class StatsRecorder {
  readonly data: MatchStats;

  constructor(first: GameState, resume?: MatchStats, now = Date.now()) {
    const ids = first.players.map((p) => p.id);
    this.data = resume
      ? structuredClone(resume)
      : {
          startedAt: now,
          durationMs: 0,
          flips: Object.fromEntries(ids.map((id) => [id, 0])),
          inwardWins: Object.fromEntries(ids.map((id) => [id, 0])),
          duels: 0,
          specials: { inward: 0, outward: 0, colors: 0 },
          biggestDuel: null,
          timeline: [{ t: 0, c: cardsOf(first) }],
          ids,
        };
  }

  /** Καταγράφει τη μετάβαση prev -> next (τα γεγονότα της next). */
  record(prev: GameState, next: GameState, now = Date.now()) {
    const d = this.data;
    const flipped: { playerId: string; kind: string }[] = [];
    for (const e of next.events) {
      if (e.type === 'flip') flipped.push({ playerId: e.playerId, kind: e.card.kind });
      else if (e.type === 'allFlip') e.flips.forEach((f) => flipped.push({ playerId: f.playerId, kind: f.card.kind }));
      else if (e.type === 'inward') d.inwardWins[e.winner] = (d.inwardWins[e.winner] ?? 0) + 1;
      else if (e.type === 'duel') {
        d.duels++;
        // Κάρτες που άλλαξαν χέρια: η στοίβα του νικητή, το pot και οι στοίβες των χαμένων (πριν τη μονομαχία).
        const pile = (id: string) => prev.players.find((p) => p.id === id)?.discard.length ?? 0;
        const cards = pile(e.winner) + prev.pot.length + e.losers.reduce((n, id) => n + pile(id), 0);
        if (!d.biggestDuel || cards > d.biggestDuel.cards) d.biggestDuel = { cards, winner: e.winner, losers: [...e.losers] };
      }
    }
    for (const f of flipped) {
      d.flips[f.playerId] = (d.flips[f.playerId] ?? 0) + 1;
      if (f.kind === 'inward' || f.kind === 'outward' || f.kind === 'colors') d.specials[f.kind]++;
    }
    d.durationMs = Math.max(0, now - d.startedAt);
    const c = cardsOf(next);
    const last = d.timeline[d.timeline.length - 1];
    if (!last || c.some((n, i) => n !== last.c[i])) {
      d.timeline.push({ t: Math.round(d.durationMs / 100) / 10, c });
      if (d.timeline.length > MAX_POINTS) d.timeline = thin(d.timeline);
    }
  }
}

/** Κρατά κάθε δεύτερο σημείο (πάντα το πρώτο και το τελευταίο), ώστε το γράφημα να μένει ελαφρύ. */
function thin<T>(pts: T[]): T[] {
  return pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);
}

/** Ακρίβεια αρπαγμάτων: σωστά (μονομαχίες + βέλη μέσα) προς όλα τα αρπάγματα που κρίθηκαν. */
export function accuracy(won: number, inward: number, wrong: number, drops: number): number | null {
  const total = won + inward + wrong + drops;
  return total ? Math.round(((won + inward) / total) * 100) : null;
}

export interface Award {
  key: 'fastest' | 'accurate' | 'duelist' | 'unlucky' | 'hasty';
  id: string;
  value: string;
}

export interface AwardInput {
  id: string;
  best: number | null;
  acc: number | null;
  graded: number;
  won: number;
  lost: number;
  mistakes: number;
}

/** Διακρίσεις. Σε ισοπαλία κερδίζει όποιος είναι ψηλότερα στην κατάταξη (σειρά της λίστας). */
export function awards(players: AwardInput[]): Award[] {
  const pick = (score: (p: AwardInput) => number | null, better: (a: number, b: number) => boolean) => {
    let best: AwardInput | null = null;
    let bestScore = 0;
    for (const p of players) {
      const v = score(p);
      if (v === null) continue;
      if (!best || better(v, bestScore)) {
        best = p;
        bestScore = v;
      }
    }
    return best ? { p: best, v: bestScore } : null;
  };
  const out: Award[] = [];
  const fast = pick((p) => p.best, (a, b) => a < b);
  if (fast) out.push({ key: 'fastest', id: fast.p.id, value: `${fast.v} ms` });
  const acc = pick((p) => (p.graded >= 3 ? p.acc : null), (a, b) => a > b);
  if (acc) out.push({ key: 'accurate', id: acc.p.id, value: `${acc.v}%` });
  const duel = pick((p) => (p.won > 0 ? p.won : null), (a, b) => a > b);
  if (duel) out.push({ key: 'duelist', id: duel.p.id, value: String(duel.v) });
  const unlucky = pick((p) => (p.lost > 0 ? p.lost : null), (a, b) => a > b);
  if (unlucky) out.push({ key: 'unlucky', id: unlucky.p.id, value: String(unlucky.v) });
  const hasty = pick((p) => (p.mistakes > 0 ? p.mistakes : null), (a, b) => a > b);
  if (hasty) out.push({ key: 'hasty', id: hasty.p.id, value: String(hasty.v) });
  return out;
}
