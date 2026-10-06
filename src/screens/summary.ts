import { t } from '../i18n';
import { esc, go } from '../app';
import { botLabel, type Session } from '../game/session';
import { accuracy, awards, type MatchStats } from '../game/stats';
import type { GameScreenOptions } from './game';
import { homeScreen } from './home';

/** Χρώματα γραμμών για έως 10 παίκτες, ευανάγνωστα πάνω στο πράσινο. */
const LINE_COLORS = ['#F2C14E', '#E07A5F', '#81D4FA', '#B8E986', '#F4F1DE', '#C9A0FF', '#FF8FA3', '#FFB347', '#7FD8BE', '#A0AEC0'];

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function chart(stats: MatchStats, name: (id: string) => string, me: string): string {
  const pts = stats.timeline;
  if (pts.length < 2) return '';
  const W = 340;
  const H = 170;
  const L = 30;
  const B = 22;
  const T = 8;
  const R = 8;
  const tMax = Math.max(1, pts[pts.length - 1].t);
  const cMax = Math.max(1, ...pts.flatMap((p) => p.c));
  const x = (v: number) => L + ((W - L - R) * v) / tMax;
  const y = (v: number) => T + (H - T - B) * (1 - v / cMax);
  // Ο δικός μου παίκτης ζωγραφίζεται τελευταίος (από πάνω) και πιο έντονα.
  const order = stats.ids.map((id, i) => ({ id, i })).sort((a, b) => Number(a.id === me) - Number(b.id === me));
  const lines = order
    .map(({ id, i }) => {
      // Βηματική γραμμή: οι κάρτες αλλάζουν απότομα, όχι σταδιακά.
      let d = `M${x(pts[0].t).toFixed(1)} ${y(pts[0].c[i]).toFixed(1)}`;
      for (let k = 1; k < pts.length; k++) d += `H${x(pts[k].t).toFixed(1)}V${y(pts[k].c[i]).toFixed(1)}`;
      const mine = id === me;
      return `<path d="${d}" fill="none" stroke="${LINE_COLORS[i % LINE_COLORS.length]}" stroke-width="${mine ? 3 : 1.6}" stroke-linejoin="round" ${mine ? '' : 'opacity="0.85"'}/>`;
    })
    .join('');
  const grid = [0, 0.5, 1]
    .map((f) => {
      const v = Math.round(cMax * f);
      return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(245,238,220,0.15)"/>
        <text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="rgba(245,238,220,0.7)">${v}</text>`;
    })
    .join('');
  const axis = `<text x="${L}" y="${H - 6}" font-size="10" fill="rgba(245,238,220,0.7)">0:00</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="10" fill="rgba(245,238,220,0.7)">${mmss(stats.durationMs)}</text>`;
  const legend = stats.ids
    .map(
      (id, i) =>
        `<li class="${id === me ? 'is-me' : ''}"><span class="sw" style="background:${LINE_COLORS[i % LINE_COLORS.length]}"></span>${esc(name(id))}</li>`,
    )
    .join('');
  return `<section class="sum-block">
      <h3>${t('sum.chart')}</h3>
      <svg class="sum-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('sum.chartAria', { d: mmss(stats.durationMs) }))}">${grid}${lines}${axis}</svg>
      <ul class="legend">${legend}</ul>
    </section>`;
}

export function summaryScreen(root: HTMLElement, session: Session, opts: GameScreenOptions = {}) {
  const v = session.view;
  const st = v.stats;
  const nm = (id: string) => session.name(id);

  const rows = v.ranking.map((id) => {
    const p = v.players.find((x) => x.id === id)!;
    const rt = v.reactions[id] ?? [];
    const inward = st?.inwardWins[id] ?? 0;
    const graded = p.stats.duelsWon + inward + p.stats.wrongGrabs + p.stats.drops;
    return {
      id,
      p,
      avg: rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : null,
      best: rt.length ? Math.min(...rt) : null,
      acc: accuracy(p.stats.duelsWon, inward, p.stats.wrongGrabs, p.stats.drops),
      graded,
      inward,
      flips: st?.flips[id] ?? 0,
      left: p.deckCount + p.discardCount,
    };
  });

  const who = (id: string, i: number) => {
    const lv = session.level(id);
    return `<th scope="row"><span class="rank">${i + 1}</span><span class="who">${esc(nm(id))}${lv ? `<small>${botLabel(lv)}</small>` : ''}</span></th>`;
  };
  const cell = (x: number | null, suffix = '') => `<td>${x === null ? '–' : `${x}${suffix}`}</td>`;
  const tr = (id: string, cells: string, i: number) => `<tr class="${id === session.me ? 'is-me' : ''}">${who(id, i)}${cells}</tr>`;

  const speed = rows
    .map((r, i) => tr(r.id, cell(r.avg) + cell(r.best) + cell(r.p.stats.duelsWon) + cell(r.p.stats.duelsLost) + cell(r.acc, '%'), i))
    .join('');
  const cards = rows
    .map((r, i) => tr(r.id, cell(r.flips) + cell(r.inward) + cell(r.p.stats.wrongGrabs) + cell(r.p.stats.drops) + cell(r.left), i))
    .join('');

  const prizes = awards(
    rows.map((r) => ({
      id: r.id,
      best: r.best,
      acc: r.acc,
      graded: r.graded,
      won: r.p.stats.duelsWon,
      lost: r.p.stats.duelsLost,
      mistakes: r.p.stats.wrongGrabs + r.p.stats.drops,
    })),
  );
  const awardsHtml = prizes.length
    ? `<section class="sum-block"><h3>${t('sum.awards')}</h3><ul class="awards">${prizes
        .map(
          (a) => `<li class="${a.id === session.me ? 'is-me' : ''}"><span class="aw-title">${t(`award.${a.key}`)}</span>
            <span class="aw-who">${esc(nm(a.id))}</span><span class="aw-val">${esc(t(`award.val.${a.key}`, { v: a.value }))}</span></li>`,
        )
        .join('')}</ul></section>`
    : '';

  const facts = st
    ? `<section class="sum-block"><h3>${t('sum.game')}</h3><dl class="facts">
        <div><dt>${t('sum.duration')}</dt><dd>${mmss(st.durationMs)}</dd></div>
        <div><dt>${t('sum.duels')}</dt><dd>${st.duels}</dd></div>
        <div><dt>${t('sum.flipped')}</dt><dd>${Object.values(st.flips).reduce((a, b) => a + b, 0)}</dd></div>
        <div><dt>${t('sum.specials')}</dt><dd>${t('sum.specialsVal', { i: st.specials.inward, o: st.specials.outward, c: st.specials.colors })}</dd></div>
        ${
          st.biggestDuel
            ? `<div class="wide"><dt>${t('sum.biggest')}</dt><dd>${esc(
                t('sum.biggestVal', { n: st.biggestDuel.cards, w: nm(st.biggestDuel.winner), l: st.biggestDuel.losers.map(nm).join(', ') }),
              )}</dd></div>`
            : ''
        }
      </dl></section>`
    : '';

  const head = (cols: string[]) =>
    `<thead><tr><th scope="col">${t('sum.player')}</th>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>`;

  const winner = v.ranking[0];
  root.className = 'screen summary';
  root.innerHTML = `
    <h2>${winner === session.me ? t('sum.youWon') : esc(t('sum.winner', { name: nm(winner) }))}</h2>
    ${awardsHtml}
    ${facts}
    <section class="sum-block"><h3>${t('sum.speed')}</h3>
      <div class="stats-wrap"><table class="stats">${head([t('sum.avg'), t('sum.best'), t('sum.wins'), t('sum.losses'), t('sum.acc')])}
        <tbody>${speed}</tbody></table></div>
      <p class="note">${t('sum.note1')}</p></section>
    <section class="sum-block"><h3>${t('sum.cards')}</h3>
      <div class="stats-wrap"><table class="stats">${head([t('sum.flips'), t('sum.inward'), t('sum.wrong'), t('sum.drops'), t('sum.left')])}
        <tbody>${cards}</tbody></table></div>
      <p class="note">${t('sum.note2')}</p></section>
    ${st ? chart(st, nm, session.me) : ''}
    <nav class="menu">
      ${opts.replay ? `<button class="primary again">${t('sum.again')}</button>` : ''}
      ${opts.exit ? `<button class="primary back-room">${t('sum.room')}</button>` : ''}
      <button class="to-home">${t('sum.home')}</button>
    </nav>`;
  root.querySelector('.again')?.addEventListener('click', () => opts.replay!());
  root.querySelector('.back-room')?.addEventListener('click', () => opts.exit!());
  root.querySelector('.to-home')!.addEventListener('click', () => {
    session.quit();
    go(homeScreen);
  });
}
