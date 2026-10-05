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
    <h2>${winner === session.me ? 'Κέρδισες!' : `Νίκησε: ${esc(session.name(winner))}`}</h2>
    <div class="stats-wrap"><table class="stats">
      <thead><tr><th scope="col">Παίκτης</th><th scope="col">Μέσος</th><th scope="col">Καλύτ.</th>
        <th scope="col">Νίκες</th><th scope="col">Λάθη</th><th scope="col">Ρίψεις</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
    <p class="note">Μέσος / Καλύτ.: χρόνος αντίδρασης σε ms (χιλιοστά του δευτερολέπτου).
      Νίκες: μονομαχίες που κέρδισε. Λάθη: λάθος αρπάγματα. Ρίψεις: φορές που έριξε το ξόανο.</p>
    <nav class="menu">
      ${opts.replay ? '<button class="primary again">Νέα παρτίδα</button>' : ''}
      ${opts.exit ? '<button class="primary back-room">Πίσω στο δωμάτιο</button>' : ''}
      <button class="to-home">Αρχική</button>
    </nav>`;
  root.querySelector('.again')?.addEventListener('click', () => opts.replay!());
  root.querySelector('.back-room')?.addEventListener('click', () => opts.exit!());
  root.querySelector('.to-home')!.addEventListener('click', () => {
    session.quit();
    go(homeScreen);
  });
}
