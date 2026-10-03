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
      <button disabled title="Έρχεται σε επόμενη φάση">Online με φίλους · σύντομα</button>
      <button data-go="settings">Ρυθμίσεις</button>
    </nav>
    <p class="version">v${APP_VERSION}</p>`;
  root.querySelector('[data-go="solo"]')!.addEventListener('click', () => go(soloSetupScreen));
  root.querySelector('[data-go="settings"]')!.addEventListener('click', () => go(settingsScreen));
}
