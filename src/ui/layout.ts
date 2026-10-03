// Θέσεις αντιπάλων σε έλλειψη γύρω από το ξόανο. Ο παίκτης είναι κάτω (εκτός αυτού του χώρου).
export interface Seat {
  x: number;
  y: number;
}

/** Χώρος για το όνομα πάνω από την κάρτα. */
export const LABEL_PX = 16;
const ARC = Math.PI * 1.44; // τόξο που καλύπτουν οι θέσεις

/** Πλάτος κάρτας ώστε οι n θέσεις να χωράνε στο τόξο χωρίς να επικαλύπτονται. */
export function cardWidthFor(opponents: number, w: number, h: number): number {
  const a = Math.max(40, w / 2 - 40);
  const b = Math.max(40, h / 2 - 50);
  const perimeter = 2 * Math.PI * Math.sqrt((a * a + b * b) / 2);
  const spacing = (perimeter * ARC) / (2 * Math.PI) / Math.max(1, opponents);
  const size = (spacing - 2 * LABEL_PX) / 1.4;
  if (isWide(w, h)) return Math.max(40, Math.min(100, (w - 16) / Math.max(1, opponents) - 10, h * 0.24));
  return Math.max(40, Math.min(110, w * 0.26, h * 0.22, size));
}

const isWide = (w: number, h: number) => w > h * 1.4;

/** Κέντρο του ξόανου. Σε οριζόντια οθόνη πιο χαμηλά, κάτω από το τόξο των αντιπάλων. */
export const tableCenter = (w: number, h: number) => ({ cx: w / 2, cy: h * (isWide(w, h) ? 0.66 : 0.5) });

/** Το μεγαλύτερο ύψος ξόανου (70–220 px) που δεν ακουμπά καμία θέση. */
export function totemHeightFor(w: number, h: number, cardW: number, ps: Seat[]): number {
  const cardH = cardW * 1.4;
  const { cx, cy } = tableCenter(w, h);
  const max = Math.min(h * (isWide(w, h) ? 0.6 : 0.36), w * 0.5, 220);
  for (let th = max; th > 70; th -= 2) {
    const tw = (th * 80) / 150;
    const clash = ps.some(
      (p) =>
        Math.abs(p.x - cx) < cardW / 2 + tw / 2 + 4 &&
        p.y + cardH / 2 + LABEL_PX > cy - th / 2 - 4 &&
        p.y - cardH / 2 - LABEL_PX < cy + th / 2 + 4,
    );
    if (!clash) return th;
  }
  return 70;
}

/** Κέντρα θέσεων για n αντιπάλους, σε συντεταγμένες του χώρου w x h. */
export function seats(n: number, w: number, h: number, cardW: number): Seat[] {
  const cardH = cardW * 1.4;
  const { cx, cy } = tableCenter(w, h);
  const rx = w / 2 - cardW * 0.6 - 4;
  const ry = Math.max(0, Math.min(cy, h - cy) - cardH / 2 - LABEL_PX - 2);
  const out: Seat[] = [];
  if (isWide(w, h)) {
    // Οριζόντια οθόνη: ρηχό τόξο σε όλο το πλάτος, οι άκρες πιο χαμηλά, το ξόανο από κάτω.
    const top = cardH / 2 + LABEL_PX + 2;
    const amp = Math.max(0, h * 0.55 - top);
    const margin = cardW / 2 + 4;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? cx : margin + ((w - 2 * margin) * i) / (n - 1);
      const u = (x - cx) / (w / 2 - margin || 1);
      out.push({ x, y: top + amp * u * u });
    }
    return out;
  }
  // Κάθετη οθόνη: τόξο από κάτω-αριστερά, πάνω, ως κάτω-δεξιά.
  const from = Math.PI / 2 + ARC / 2;
  const to = Math.PI / 2 - ARC / 2;
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? Math.PI / 2 : from + ((to - from) * i) / (n - 1);
    out.push({ x: cx + rx * Math.cos(a), y: cy - ry * Math.sin(a) });
  }
  return out;
}

export interface TableLayout {
  cardW: number;
  seats: Seat[];
  totemH: number;
}

const overlaps = (ps: Seat[], cw: number) => {
  const ch = cw * 1.4;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++)
      if (Math.abs(ps[i].x - ps[j].x) < cw + 4 && Math.abs(ps[i].y - ps[j].y) < ch + LABEL_PX + 4) return true;
  return false;
};

/** Μεγαλύτερες κάρτες που χωράνε χωρίς επικαλύψεις, και ξόανο στο μέγιστο δυνατό ύψος. */
export function fitTable(n: number, w: number, h: number): TableLayout {
  let cw = cardWidthFor(n, w, h);
  let ps = seats(n, w, h, cw);
  while (cw > 36 && overlaps(ps, cw)) {
    cw -= 2;
    ps = seats(n, w, h, cw);
  }
  return { cardW: cw, seats: ps, totemH: totemHeightFor(w, h, cw, ps) };
}
