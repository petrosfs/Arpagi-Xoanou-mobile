import { esc, go } from '../app';
import type { SoloGame, SoloOptions } from '../solo/controller';
import { BOT_LEVELS } from '../solo/bots';
import { gameScreen, playerName, shortName } from './game';
import { homeScreen } from './home';

export function summaryScreen(root: HTMLElement, game: SoloGame, opts: SoloOptions) {
  const s = game.state;
  const rows = s.ranking.map((id, i) => {
    const p = s.players.find((x) => x.id === id)!;
    const rt = game.reactions[id] ?? [];
    const avg = rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : null;
    const best = rt.length ? Math.min(...rt) : null;
    return `<tr class="${id === 'you' ? 'is-me' : ''}">
      <th scope="row"><span class="rank">${i + 1}</span><span class="who">${esc(shortName(id))}${
        game.levels[id] ? `<small>${BOT_LEVELS[game.levels[id]].label}</small>` : ''
      }</span></th>
      <td>${avg ?? '–'}</td><td>${best ?? '–'}</td>
      <td>${p.stats.duelsWon}</td><td>${p.stats.wrongGrabs}</td><td>${p.stats.drops}</td></tr>`;
  });
  root.className = 'screen summary';
  root.innerHTML = `
    <h2>${s.ranking[0] === 'you' ? 'Κέρδισες!' : `Νίκησε: ${esc(playerName(game, s.ranking[0]))}`}</h2>
    <div class="stats-wrap"><table class="stats">
      <thead><tr><th scope="col">Παίκτης</th><th scope="col">Μέσος</th><th scope="col">Καλύτ.</th>
        <th scope="col">Νίκες</th><th scope="col">Λάθη</th><th scope="col">Ρίψεις</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
    <p class="note">Μέσος / Καλύτ.: χρόνος αντίδρασης σε ms (χιλιοστά του δευτερολέπτου).
      Νίκες: μονομαχίες που κέρδισε. Λάθη: λάθος αρπάγματα. Ρίψεις: φορές που έριξε το ξόανο.</p>
    <nav class="menu">
      <button class="primary again">Νέα παρτίδα</button>
      <button class="to-home">Αρχική</button>
    </nav>`;
  root.querySelector('.again')!.addEventListener('click', () => go((r) => gameScreen(r, opts)));
  root.querySelector('.to-home')!.addEventListener('click', () => go(homeScreen));
}
