import { esc, go } from '../app';
import type { SoloGame, SoloOptions } from '../solo/controller';
import { gameScreen, playerName } from './game';
import { homeScreen } from './home';

export function summaryScreen(root: HTMLElement, game: SoloGame, opts: SoloOptions) {
  const s = game.state;
  const rows = s.ranking.map((id, i) => {
    const p = s.players.find((x) => x.id === id)!;
    const rt = game.reactions[id] ?? [];
    const avg = rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : null;
    const best = rt.length ? Math.min(...rt) : null;
    return `<tr class="${id === 'you' ? 'me' : ''}">
      <td>${i + 1}</td><td>${esc(playerName(game, id))}</td>
      <td>${avg ?? '–'}</td><td>${best ?? '–'}</td>
      <td>${p.stats.duelsWon}</td><td>${p.stats.wrongGrabs}</td><td>${p.stats.drops}</td></tr>`;
  });
  root.className = 'screen summary';
  root.innerHTML = `
    <h2>${s.ranking[0] === 'you' ? 'Κέρδισες!' : `Νίκησε: ${esc(playerName(game, s.ranking[0]))}`}</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Παίκτης</th><th>Μέσος χρόνος (ms)</th><th>Καλύτερος (ms)</th>
        <th>Μονομαχίες</th><th>Λάθη</th><th>Ρίψεις</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
    <nav class="menu">
      <button class="primary again">Νέα παρτίδα</button>
      <button class="home">Αρχική</button>
    </nav>`;
  root.querySelector('.again')!.addEventListener('click', () => go((r) => gameScreen(r, opts)));
  root.querySelector('.home')!.addEventListener('click', () => go(homeScreen));
}
