import { go } from '../app';
import { BOT_LEVELS, type BotLevel } from '../solo/bots';
import { HUMAN, SoloGame, type SoloOptions } from '../solo/controller';
import { LocalSession } from '../game/session';
import { DEFAULT_SETUP, mountSetupForm } from '../ui/setupForm';
import { gameScreen } from './game';
import { homeScreen } from './home';

let last: SoloOptions | null = null;

export function soloSetupScreen(root: HTMLElement) {
  const bots: BotLevel[] = last ? [...last.bots] : ['medium', 'medium', 'medium'];
  root.className = 'screen form';
  root.innerHTML = `
    <header><button class="back" aria-label="Πίσω">‹</button><h2>Παιχνίδι με bots</h2></header>
    <section>
      <h3>Αντίπαλοι</h3>
      <div class="stepper"><button data-bots="-1" aria-label="Λιγότερα bots">−</button>
        <span class="bot-count"></span><button data-bots="1" aria-label="Περισσότερα bots">+</button></div>
      <div class="bot-list"></div>
    </section>
    <div class="setup"></div>
    <p class="error" role="alert"></p>
    <button class="primary start">Ξεκίνα</button>`;

  const form = mountSetupForm(
    root.querySelector('.setup')!,
    last ? { symbols: last.symbols, turnTimerS: last.turnTimerS, config: { ...DEFAULT_SETUP.config, ...last.config } } : DEFAULT_SETUP,
    { showLeaver: false },
  );

  const botList = root.querySelector<HTMLElement>('.bot-list')!;
  const renderBots = () => {
    root.querySelector('.bot-count')!.textContent = `${bots.length} bot${bots.length > 1 ? 's' : ''}`;
    botList.innerHTML = bots
      .map(
        (lv, i) => `<label class="field"><span>Bot ${i + 1}</span><select data-bot="${i}">${Object.entries(BOT_LEVELS)
          .map(([k, v]) => `<option value="${k}" ${k === lv ? 'selected' : ''}>${v.label}</option>`)
          .join('')}</select></label>`,
      )
      .join('');
  };
  botList.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    bots[+t.dataset.bot!] = t.value as BotLevel;
  });
  root.querySelectorAll<HTMLButtonElement>('[data-bots]').forEach((b) =>
    b.addEventListener('click', () => {
      const d = +b.dataset.bots!;
      if (d > 0 && bots.length < 9) bots.push(bots[bots.length - 1] ?? 'medium');
      if (d < 0 && bots.length > 1) bots.pop();
      renderBots();
    }),
  );
  renderBots();

  root.querySelector('.back')!.addEventListener('click', () => go(homeScreen));
  root.querySelector('.start')!.addEventListener('click', () => {
    const r = form.read();
    if (!r.ok) {
      root.querySelector('.error')!.textContent = r.error;
      return;
    }
    last = { bots: [...bots], symbols: r.setup.symbols, turnTimerS: r.setup.turnTimerS, config: r.setup.config };
    startSolo(last);
  });
}

const soloName = (id: string) => (id === HUMAN ? 'Εσύ' : id.replace('bot', 'Bot '));

/** Ξεκινά παρτίδα solo: ο host τρέχει τοπικά και η οθόνη τον βλέπει μέσω LocalSession. */
export function startSolo(opts: SoloOptions) {
  let session: LocalSession | null = null;
  const host = new SoloGame(opts, () => session?.update());
  session = new LocalSession(host, HUMAN, soloName);
  const s = session;
  try {
    if (localStorage.getItem('arpagi.debug') === '1') (window as unknown as { __session: unknown }).__session = s;
  } catch {
    /* χωρίς debug */
  }
  go((el) => gameScreen(el, s, { replay: () => startSolo(opts) }));
  host.start();
}
