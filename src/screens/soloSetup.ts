import { go } from '../app';
import { MAX_SYMBOLS, MIN_SYMBOLS } from '../engine';
import { BOT_LEVELS, type BotLevel } from '../solo/bots';
import type { SoloOptions } from '../solo/controller';
import { DEFAULT_SYMBOLS, SYMBOLS, symbolSvg } from '../ui/symbols';
import { gameScreen } from './game';
import { homeScreen } from './home';

let last: SoloOptions | null = null;

export function soloSetupScreen(root: HTMLElement) {
  const bots: BotLevel[] = last ? [...last.bots] : ['medium', 'medium', 'medium'];
  const chosen = new Set<number>(last ? last.symbols : DEFAULT_SYMBOLS);
  const cfg = last?.config ?? {};

  root.className = 'screen form';
  root.innerHTML = `
    <header><button class="back" aria-label="Πίσω">‹</button><h2>Παιχνίδι με bots</h2></header>
    <section>
      <h3>Αντίπαλοι</h3>
      <div class="stepper"><button data-bots="-1" aria-label="Λιγότερα bots">−</button>
        <span class="bot-count"></span><button data-bots="1" aria-label="Περισσότερα bots">+</button></div>
      <div class="bot-list"></div>
    </section>
    <section>
      <h3>Σύμβολα <span class="sym-count"></span></h3>
      <p class="hint">Διάλεξε ${MIN_SYMBOLS}–${MAX_SYMBOLS}. Λιγότερα σύμβολα σημαίνει συχνότερες μονομαχίες.</p>
      <div class="sym-grid"></div>
    </section>
    <section>
      <h3>Κανόνες</h3>
      <label class="field"><span>Χρόνος για να γυρίσεις κάρτα (δευτ.)</span>
        <input type="number" name="timer" min="5" max="180" step="1" value="${last?.turnTimerS ?? 120}"></label>
      <label class="field"><span>Πολλοί χαμένοι</span>
        <select name="dist">
          <option value="equal">Ίσο μοίρασμα, τα υπόλοιπα τα διαλέγει ο νικητής</option>
          <option value="winnerChooses">Όλα σε έναν χαμένο, τον διαλέγει ο νικητής</option>
        </select></label>
      <label class="field"><span>Τέλος παρτίδας</span>
        <select name="end">
          <option value="firstWinner">Με τον πρώτο νικητή</option>
          <option value="fullRanking">Πλήρης κατάταξη</option>
        </select></label>
      <label class="check"><input type="checkbox" name="three" ${cfg.threePlayerRule === false ? '' : 'checked'}>
        <span>Κανόνας 3 παικτών (χωρίς χρωματιστά βέλη, τρία ίδια χρώματα = βέλη μέσα)</span></label>
    </section>
    <p class="error" role="alert"></p>
    <button class="primary start">Ξεκίνα</button>`;

  const sel = (n: string) => root.querySelector<HTMLSelectElement>(`select[name="${n}"]`)!;
  if (cfg.distribution) sel('dist').value = cfg.distribution;
  if (cfg.endMode) sel('end').value = cfg.endMode;

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

  const grid = root.querySelector<HTMLElement>('.sym-grid')!;
  const renderSyms = () => {
    root.querySelector('.sym-count')!.textContent = `(${chosen.size})`;
    grid.innerHTML = SYMBOLS.map(
      (s, i) =>
        `<button class="sym ${chosen.has(i) ? 'on' : ''}" data-sym="${i}" aria-pressed="${chosen.has(i)}" aria-label="Σύμβολο ${s.no}">
          ${symbolSvg(s, 'currentColor', 32)}</button>`,
    ).join('');
  };
  grid.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sym]');
    if (!b) return;
    const i = +b.dataset.sym!;
    if (chosen.has(i)) chosen.delete(i);
    else chosen.add(i);
    renderSyms();
  });

  renderBots();
  renderSyms();

  root.querySelector('.back')!.addEventListener('click', () => go(homeScreen));
  root.querySelector('.start')!.addEventListener('click', () => {
    const err = root.querySelector('.error')!;
    if (chosen.size < MIN_SYMBOLS || chosen.size > MAX_SYMBOLS) {
      err.textContent = `Διάλεξε από ${MIN_SYMBOLS} ως ${MAX_SYMBOLS} σύμβολα (τώρα: ${chosen.size}).`;
      return;
    }
    const timer = Math.round(+root.querySelector<HTMLInputElement>('input[name="timer"]')!.value);
    if (!(timer >= 5 && timer <= 180)) {
      err.textContent = 'Ο χρόνος για να γυρίσεις κάρτα πρέπει να είναι από 5 ως 180 δευτερόλεπτα.';
      return;
    }
    last = {
      bots: [...bots],
      symbols: [...chosen].sort((a, b) => a - b),
      turnTimerS: timer,
      config: {
        distribution: sel('dist').value as 'equal' | 'winnerChooses',
        endMode: sel('end').value as 'firstWinner' | 'fullRanking',
        threePlayerRule: root.querySelector<HTMLInputElement>('input[name="three"]')!.checked,
      },
    };
    const opts = last;
    go((r) => gameScreen(r, opts));
  });
}
