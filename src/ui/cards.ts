import { t } from '../i18n';
import type { Card } from '../engine';
import { SYMBOLS, symbolSvg } from './symbols';

export const CARD_COLORS = ['#C8902A', '#B5562E', '#2F6B3A', '#1F5FA0'] as const;
const GREY = '#444441';

function arrows(out: boolean, colors?: readonly string[]): string {
  let g = '';
  for (let i = 0; i < 4; i++) {
    const k = colors ? colors[i] : GREY;
    const d = out ? 'M30 20V6M24 12L30 5L36 12' : 'M30 5V19M24 13L30 20L36 13';
    g += `<g transform="rotate(${i * 90} 30 30)"><path d="${d}" fill="none" stroke="${k}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  return `<svg viewBox="0 0 60 60" width="70%" aria-hidden="true">${g}</svg>`;
}

/**
 * HTML μιας ανοιχτής κάρτας. symbolMap: δείκτης συμβόλου της μηχανής -> δείκτης στον κατάλογο.
 */
export function cardHtml(card: Card | undefined, symbolMap: number[], colorblind: boolean): string {
  if (!card) return `<div class="card empty"></div>`;
  if (card.kind !== 'symbol') {
    if (card.kind === 'inward') return `<div class="card special" aria-label="${t('card.inward')}">${arrows(false)}</div>`;
    if (card.kind === 'outward') return `<div class="card special" aria-label="${t('card.outward')}">${arrows(true)}</div>`;
    return `<div class="card special" aria-label="${t('card.colors')}">${arrows(false, CARD_COLORS)}</div>`;
  }
  const color = CARD_COLORS[card.color];
  const def = SYMBOLS[symbolMap[card.symbol]];
  const marks = colorblind
    ? `<div class="marks">${'<i></i>'.repeat(card.color + 1)}</div>`
    : '';
  return `<div class="card" style="--c:${color}">${marks}${symbolSvg(def, color, "78%")}</div>`;
}

export function backHtml(count: number): string {
  return `<div class="card back"><span>${count}</span></div>`;
}
