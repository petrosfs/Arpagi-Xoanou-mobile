import { t } from '../i18n';
import { MAX_SYMBOLS, MIN_SYMBOLS, type GameConfig } from '../engine';
import { DEFAULT_SYMBOLS, SYMBOLS, symbolSvg } from './symbols';

/** Οι ρυθμίσεις παρτίδας που ορίζει ο host (ή ο παίκτης στο solo). */
export interface MatchSetup {
  symbols: number[];
  turnTimerS: number;
  config: Pick<GameConfig, 'distribution' | 'endMode' | 'threePlayerRule' | 'leaverCards'>;
}

export const DEFAULT_SETUP: MatchSetup = {
  symbols: [...DEFAULT_SYMBOLS],
  turnTimerS: 120,
  config: { distribution: 'equal', endMode: 'firstWinner', threePlayerRule: true, leaverCards: 'pot' },
};

export interface SetupForm {
  read(): { ok: true; setup: MatchSetup } | { ok: false; error: string };
}

/** Φόρμα συμβόλων και κανόνων. showLeaver: η επιλογή για τις κάρτες όποιου αποχωρεί (μόνο online). */
export function mountSetupForm(
  root: HTMLElement,
  initial: MatchSetup,
  opts: { showLeaver: boolean; onChange?: () => void },
): SetupForm {
  const chosen = new Set<number>(initial.symbols);
  root.innerHTML = `
    <section>
      <h3>${t('setup.symbols')} <span class="sym-count"></span></h3>
      <p class="hint">${t('setup.symbolsHint', { min: MIN_SYMBOLS, max: MAX_SYMBOLS })}</p>
      <div class="sym-grid"></div>
    </section>
    <section>
      <h3>${t('setup.rules')}</h3>
      <label class="field"><span>${t('setup.timer')}</span>
        <input type="number" name="timer" min="5" max="180" step="1" value="${initial.turnTimerS}"></label>
      <label class="field"><span>${t('setup.dist')}</span>
        <select name="dist">
          <option value="equal">${t('setup.dist.equal')}</option>
          <option value="winnerChooses">${t('setup.dist.winner')}</option>
        </select></label>
      <label class="field"><span>${t('setup.end')}</span>
        <select name="end">
          <option value="firstWinner">${t('setup.end.first')}</option>
          <option value="fullRanking">${t('setup.end.full')}</option>
        </select></label>
      ${opts.showLeaver ? `<label class="field"><span>${t('setup.leaver')}</span>
        <select name="leaver">
          <option value="pot">${t('setup.leaver.pot')}</option>
          <option value="remove">${t('setup.leaver.remove')}</option>
        </select></label>` : ''}
      <label class="check"><input type="checkbox" name="three" ${initial.config.threePlayerRule ? 'checked' : ''}>
        <span>${t('setup.three')}</span></label>
    </section>`;

  const sel = (n: string) => root.querySelector<HTMLSelectElement>(`select[name="${n}"]`);
  sel('dist')!.value = initial.config.distribution;
  sel('end')!.value = initial.config.endMode;
  if (sel('leaver')) sel('leaver')!.value = initial.config.leaverCards;

  const grid = root.querySelector<HTMLElement>('.sym-grid')!;
  const renderSyms = () => {
    root.querySelector('.sym-count')!.textContent = `(${chosen.size})`;
    grid.innerHTML = SYMBOLS.map(
      (s, i) =>
        `<button type="button" class="sym ${chosen.has(i) ? 'on' : ''}" data-sym="${i}" aria-pressed="${chosen.has(i)}" aria-label="${t('card.symbol', { no: s.no })}">
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
    opts.onChange?.();
  });
  root.addEventListener('change', () => opts.onChange?.());
  renderSyms();

  return {
    read() {
      if (chosen.size < MIN_SYMBOLS || chosen.size > MAX_SYMBOLS)
        return { ok: false, error: t('setup.err.symbols', { min: MIN_SYMBOLS, max: MAX_SYMBOLS, n: chosen.size }) };
      const timer = Math.round(+root.querySelector<HTMLInputElement>('input[name="timer"]')!.value);
      if (!(timer >= 5 && timer <= 180))
        return { ok: false, error: t('setup.err.timer') };
      return {
        ok: true,
        setup: {
          symbols: [...chosen].sort((a, b) => a - b),
          turnTimerS: timer,
          config: {
            distribution: sel('dist')!.value as 'equal' | 'winnerChooses',
            endMode: sel('end')!.value as 'firstWinner' | 'fullRanking',
            threePlayerRule: root.querySelector<HTMLInputElement>('input[name="three"]')!.checked,
            leaverCards: (sel('leaver')?.value ?? 'pot') as 'pot' | 'remove',
          },
        },
      };
    },
  };
}

/** Σύντομη περιγραφή των ρυθμίσεων για όσους δεν είναι host. */
export function describeSetup(s: MatchSetup): string[] {
  return [
    t('setup.sum.symbols', { n: s.symbols.length }),
    t('setup.sum.timer', { n: s.turnTimerS }),
    t(s.config.distribution === 'equal' ? 'setup.sum.dist.equal' : 'setup.sum.dist.winner'),
    t(s.config.endMode === 'firstWinner' ? 'setup.sum.end.first' : 'setup.sum.end.full'),
    t(s.config.leaverCards === 'pot' ? 'setup.sum.leaver.pot' : 'setup.sum.leaver.remove'),
    t(s.config.threePlayerRule ? 'setup.sum.three.on' : 'setup.sum.three.off'),
  ];
}
