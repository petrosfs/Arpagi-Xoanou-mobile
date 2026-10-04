// Κατάλογος συμβόλων (πρωτότυπα σχέδια). Η σειρά μετράει: τα πρώτα 12 είναι η προεπιλογή.
// Κάθε σύμβολο σε viewBox 40x40: s = διαδρομή με γραμμή, f = διαδρομή γεμάτη.

export interface SymbolDef {
  /** Αριθμός από τον κατάλογο σχεδιασμού. */
  no: number;
  s?: string;
  f?: string;
}

const n = (v: number) => +v.toFixed(1);

function star(points: number, R: number, r: number, rot = 0): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const a = ((rot - 90 + (i * 180) / points) * Math.PI) / 180;
    const q = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + n(20 + q * Math.cos(a)) + ' ' + n(20 + q * Math.sin(a));
  }
  return d + 'Z';
}

function poly(sides: number, R: number, rot = 0): string {
  let d = '';
  for (let i = 0; i < sides; i++) {
    const a = ((rot - 90 + (i * 360) / sides) * Math.PI) / 180;
    d += (i ? 'L' : 'M') + n(20 + R * Math.cos(a)) + ' ' + n(20 + R * Math.sin(a));
  }
  return d + 'Z';
}

const c = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

function ring(count: number, rr: number, r: number): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = ((-90 + (i * 360) / count) * Math.PI) / 180;
    d += c(n(20 + rr * Math.cos(a)), n(20 + rr * Math.sin(a)), r);
  }
  return d;
}

const sq = (x: number, y: number, h: number) => `M${x - h} ${y - h}h${2 * h}v${2 * h}h${-2 * h}Z`;

const PLUS = 'M20 6V34M6 20H34';
const EX = 'M8 8L32 32M32 8L8 32';
const AST6 = 'M20 6V34M8 13L32 27M32 13L8 27';
const POTENT = 'M20 6V34M6 20H34M15 6H25M15 34H25M6 15V25M34 15V25';

export const SYMBOLS: SymbolDef[] = [
  // Προεπιλογή (πρώτα 12)
  { no: 1, s: PLUS },
  { no: 2, s: EX },
  { no: 3, s: star(4, 16, 4) },
  { no: 4, s: 'M20 4L24 16L36 20L24 24L20 36L16 24L4 20L16 16ZM9 9L17 17M31 9L23 17M9 31L17 23M31 31L23 23' },
  { no: 5, s: AST6 },
  { no: 7, s: POTENT },
  { no: 10, s: c(20, 20, 15) + 'M12 12L28 28M28 12L12 28' },
  { no: 12, s: PLUS + EX },
  { no: 14, s: 'M20 4Q22 18 36 20Q22 22 20 36Q18 22 4 20Q18 18 20 4Z' },
  { no: 16, s: star(6, 16, 5.5) },
  { no: 17, s: star(8, 16, 8) },
  { no: 18, s: star(12, 16, 10) },
  // Υπόλοιπα
  { no: 38, s: poly(5, 15) },
  { no: 39, s: poly(6, 15) },
  { no: 40, s: poly(8, 15, 22.5) },
  { no: 55, f: c(20, 10, 5) + c(10, 28, 5) + c(30, 28, 5) },
  { no: 56, f: c(12, 12, 5) + c(28, 12, 5) + c(12, 28, 5) + c(28, 28, 5) },
  { no: 57, f: c(11, 11, 4.5) + c(29, 11, 4.5) + c(11, 29, 4.5) + c(29, 29, 4.5) + c(20, 20, 4.5) },
  { no: 58, s: 'M6 6H34V34H6ZM13 13H27V27H13Z' },
  { no: 59, s: 'M6 6H34V34H6Z', f: c(20, 20, 4) },
  { no: 61, s: c(20, 20, 14), f: c(20, 20, 4) },
  { no: 63, s: PLUS, f: c(10, 10, 3.5) + c(30, 10, 3.5) + c(10, 30, 3.5) + c(30, 30, 3.5) },
  { no: 67, s: poly(6, 15) + 'M20 11V29M12.2 15.5L27.8 24.5M27.8 15.5L12.2 24.5' },
  { no: 74, s: star(6, 16, 5.5), f: c(20, 20, 3) },
  { no: 75, s: 'M20 10V30M10 20H30M13 13L27 27M27 13L13 27', f: ring(8, 14, 2.8) },
  { no: 82, s: sq(20, 20, 15) + c(20, 20, 10), f: sq(20, 20, 4.5) },
];

export const DEFAULT_SYMBOLS = SYMBOLS.slice(0, 12).map((_, i) => i);

export function symbolSvg(def: SymbolDef, color: string, size: number | string = 40): string {
  const parts: string[] = [];
  if (def.s)
    parts.push(`<path d="${def.s}" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (def.f) parts.push(`<path d="${def.f}" fill="${color}"/>`);
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${parts.join('')}</svg>`;
}
