import { describe, expect, it } from 'vitest';
import { FlipGesture, SWIPE_PX } from './gesture';
import { LABEL_PX, fitTable, tableCenter } from './layout';
import { DEFAULT_SYMBOLS, SYMBOLS } from './symbols';

describe('κίνηση γυρίσματος', () => {
  it('πάνω και μετά κάτω, χωρίς να σηκωθεί το δάχτυλο', () => {
    const g = new FlipGesture('swipe');
    g.down(100, 500, 0);
    expect(g.move(100, 500 - SWIPE_PX - 5)).toBe(false);
    expect(g.move(100, 500 - 5)).toBe(true);
    expect(g.move(100, 520)).toBe(false); // μία φορά ανά κίνηση
  });
  it('μόνο κάτω ή μόνο πάνω δεν γυρίζει', () => {
    const g = new FlipGesture('swipe');
    g.down(0, 500, 0);
    expect(g.move(0, 600)).toBe(false);
    g.down(0, 500, 0);
    expect(g.move(0, 400)).toBe(false);
    expect(g.up(0, 400, 100)).toBe(false);
  });
  it('πάτημα στη λειτουργία tap, όχι σε σύρσιμο', () => {
    const g = new FlipGesture('tap');
    g.down(0, 0, 0);
    expect(g.up(3, 3, 120)).toBe(true);
    g.down(0, 0, 0);
    expect(g.up(0, 60, 120)).toBe(false);
    g.down(0, 0, 0);
    expect(g.up(0, 0, 900)).toBe(false);
  });
});

describe('διάταξη', () => {
  it('οι θέσεις μένουν μέσα στο τραπέζι και η πάνω δεν πέφτει στο ξόανο', () => {
    for (const [w, h] of [[360, 520], [412, 640], [700, 300]]) {
      for (let n = 1; n <= 9; n++) {
        const { cardW: cw, seats: ps, totemH: th } = fitTable(n, w, h);
        const ch = cw * 1.4;
        expect(cw).toBeGreaterThanOrEqual(40);
        for (const p of ps) {
          expect(p.x - cw / 2).toBeGreaterThanOrEqual(-1);
          expect(p.x + cw / 2).toBeLessThanOrEqual(w + 1);
          expect(p.y - ch / 2 - LABEL_PX).toBeGreaterThanOrEqual(-1);
          expect(p.y + ch / 2 + LABEL_PX).toBeLessThanOrEqual(h + 1);
        }
        // Οι θέσεις δεν επικαλύπτονται μεταξύ τους.
        for (let i = 0; i < ps.length; i++)
          for (let j = i + 1; j < ps.length; j++) {
            const ox = Math.abs(ps[i].x - ps[j].x) < cw;
            const oy = Math.abs(ps[i].y - ps[j].y) < ch + LABEL_PX;
            expect(ox && oy).toBe(false);
          }
        const { cx, cy } = tableCenter(w, h);
        const tw = (th * 80) / 150;
        // Όσες θέσεις πέφτουν οριζόντια πάνω στο ξόανο δεν πρέπει να το ακουμπούν κάθετα.
        for (const p of ps.filter((q) => Math.abs(q.x - cx) < cw / 2 + tw / 2)) {
          const overlapsY = p.y + ch / 2 + LABEL_PX > cy - th / 2 && p.y - ch / 2 - LABEL_PX < cy + th / 2;
          if (th > 70) expect(overlapsY).toBe(false);
        }
      }
    }
  });
});

describe('σύμβολα', () => {
  it('26 σύμβολα, προεπιλογή τα πρώτα 12', () => {
    expect(SYMBOLS).toHaveLength(26);
    expect(DEFAULT_SYMBOLS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(SYMBOLS.map((s) => s.no)).size).toBe(26);
  });
});
