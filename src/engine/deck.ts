import type { Card, Color } from './types';

const SYMBOL_CARDS = 72;
const SPECIALS = { inward: 3, outward: 3, colors: 2 } as const;

/**
 * Φτιάχνει την τράπουλα. 2–8 παίκτες: 80 κάρτες. 9–10 παίκτες: διπλή (160).
 * Τα σύμβολα μοιράζονται όσο πιο ισόποσα γίνεται και κάθε αντίγραφο ενός συμβόλου
 * έχει διαφορετικό χρώμα από το προηγούμενο.
 */
export function buildDeck(playerCount: number, symbolCount: number, withColors: boolean): Card[] {
  const copies = playerCount > 8 ? 2 : 1;
  const cards: Card[] = [];
  let id = 0;
  for (let c = 0; c < copies; c++) {
    for (let i = 0; i < SYMBOL_CARDS; i++) {
      const symbol = i % symbolCount;
      // Το k-οστό αντίγραφο ενός συμβόλου παίρνει το επόμενο χρώμα.
      const color = ((symbol + Math.floor(i / symbolCount)) % 4) as Color;
      cards.push({ id: id++, kind: 'symbol', symbol, color });
    }
    for (let i = 0; i < SPECIALS.inward; i++) cards.push({ id: id++, kind: 'inward' });
    for (let i = 0; i < SPECIALS.outward; i++) cards.push({ id: id++, kind: 'outward' });
    if (withColors) for (let i = 0; i < SPECIALS.colors; i++) cards.push({ id: id++, kind: 'colors' });
  }
  return cards;
}
