import { go } from '../app';
import { APP_VERSION } from '../version';
import { XOANO_SVG } from '../ui/xoano';
import { soloSetupScreen } from './soloSetup';
import { settingsScreen } from './settings';

export function homeScreen(root: HTMLElement) {
  root.className = 'screen home';
  root.innerHTML = `
    <div class="home-totem">${XOANO_SVG}</div>
    <h1>Η Αρπαγή του Ξόανου</h1>
    <nav class="menu">
      <button class="primary" data-go="solo">Παίξε με bots</button>
      <button data-go="online">Online με φίλους</button>
      <button data-go="settings">Ρυθμίσεις</button>
    </nav>
    <p class="version">v${APP_VERSION}</p>`;
  root.querySelector('[data-go="solo"]')!.addEventListener('click', () => go(soloSetupScreen));
  root.querySelector('[data-go="settings"]')!.addEventListener('click', () => go(settingsScreen));
  // Το online (και το Firebase) φορτώνεται μόνο όταν χρειαστεί.
  root.querySelector('[data-go="online"]')!.addEventListener('click', async () => {
    const m = await import('./online');
    go((r) => m.onlineScreen(r));
  });
}
