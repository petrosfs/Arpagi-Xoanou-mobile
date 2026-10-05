import { t } from '../i18n';
import { esc, go } from '../app';
import { botLabel, type Session } from '../game/session';
import type { GameScreenOptions } from './game';
import { homeScreen } from './home';

export function summaryScreen(root: HTMLElement, session: Session, opts: GameScreenOptions = {}) {
  const v = session.view;
  const rows = v.ranking.map((id, i) => {
    const p = v.players.find((x) => x.id === id)!;
    const rt = v.reactions[id] ?? [];
    const avg = rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : null;
    const best = rt.length ? Math.min(...rt) : null;
    const lv = session.level(id);
    return `<tr class="${id === session.me ? 'is-me' : ''}">
      <th scope="row"><span class="rank">${i + 1}</span><span class="who">${esc(session.name(id))}${
        lv ? `<small>${botLabel(lv)}</small>` : ''
      }</span></th>
      <td>${avg ?? '–'}</td><td>${best ?? '–'}</td>
      <td>${p.stats.duelsWon}</td><td>${p.stats.wrongGrabs}</td><td>${p.stats.drops}</td></tr>`;
  });
  const winner = v.ranking[0];
  root.className = 'screen summary';
  root.innerHTML = `
    <h2>${winner === session.me ? t('sum.youWon') : esc(t('sum.winner', { name: session.name(winner) }))}</h2>
    <div class="stats-wrap"><table class="stats">
      <thead><tr><th scope="col">${t('sum.player')}</th><th scope="col">${t('sum.avg')}</th><th scope="col">${t('sum.best')}</th>
        <th scope="col">${t('sum.wins')}</th><th scope="col">${t('sum.wrong')}</th><th scope="col">${t('sum.drops')}</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
    <p class="note">${t('sum.note')}</p>
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
