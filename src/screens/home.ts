import { t } from '../i18n';
import { openRules } from './rules';
import { go } from '../app';
import { APP_VERSION } from '../version';
import { XOANO_SVG } from '../ui/xoano';
import { soloSetupScreen } from './soloSetup';
import { settingsScreen } from './settings';

export function homeScreen(root: HTMLElement) {
  root.className = 'screen home';
  root.innerHTML = `
    <div class="home-totem">${XOANO_SVG}</div>
    <h1>${t('title')}</h1>
    <nav class="menu">
      <button class="primary" data-go="solo">${t('home.solo')}</button>
      <button data-go="online">${t('home.online')}</button>
      <button data-go="rules">${t('home.rules')}</button>
      <button data-go="settings">${t('home.settings')}</button>
    </nav>
    <p class="version">v${APP_VERSION}</p>`;
  root.querySelector('[data-go="solo"]')!.addEventListener('click', () => go(soloSetupScreen));
  root.querySelector('[data-go="settings"]')!.addEventListener('click', () => go(settingsScreen));
  root.querySelector('[data-go="rules"]')!.addEventListener('click', () => openRules());
  // Το online (και το Firebase) φορτώνεται μόνο όταν χρειαστεί.
  root.querySelector('[data-go="online"]')!.addEventListener('click', async () => {
    const m = await import('./online');
    go((r) => m.onlineScreen(r));
  });
}
