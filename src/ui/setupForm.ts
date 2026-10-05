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
      <h3>Σύμβολα <span class="sym-count"></span></h3>
      <p class="hint">Διάλεξε ${MIN_SYMBOLS}–${MAX_SYMBOLS}. Λιγότερα σύμβολα σημαίνει συχνότερες μονομαχίες.</p>
      <div class="sym-grid"></div>
    </section>
    <section>
      <h3>Κανόνες</h3>
      <label class="field"><span>Χρόνος για να γυρίσεις κάρτα (δευτ.)</span>
        <input type="number" name="timer" min="5" max="180" step="1" value="${initial.turnTimerS}"></label>
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
      ${opts.showLeaver ? `<label class="field"><span>Κάρτες όποιου αποχωρεί</span>
        <select name="leaver">
          <option value="pot">Πάνε κάτω από το ξόανο</option>
          <option value="remove">Βγαίνουν από το παιχνίδι</option>
        </select></label>` : ''}
      <label class="check"><input type="checkbox" name="three" ${initial.config.threePlayerRule ? 'checked' : ''}>
        <span>Κανόνας 3 παικτών (χωρίς χρωματιστά βέλη, τρία ίδια χρώματα = βέλη μέσα)</span></label>
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
        `<button type="button" class="sym ${chosen.has(i) ? 'on' : ''}" data-sym="${i}" aria-pressed="${chosen.has(i)}" aria-label="Σύμβολο ${s.no}">
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
        return { ok: false, error: `Διάλεξε από ${MIN_SYMBOLS} ως ${MAX_SYMBOLS} σύμβολα (τώρα: ${chosen.size}).` };
      const timer = Math.round(+root.querySelector<HTMLInputElement>('input[name="timer"]')!.value);
      if (!(timer >= 5 && timer <= 180))
        return { ok: false, error: 'Ο χρόνος για να γυρίσεις κάρτα πρέπει να είναι από 5 ως 180 δευτερόλεπτα.' };
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
    `${s.symbols.length} σύμβολα`,
    `${s.turnTimerS} δευτ. για να γυρίσεις κάρτα`,
    s.config.distribution === 'equal' ? 'Πολλοί χαμένοι: ίσο μοίρασμα' : 'Πολλοί χαμένοι: όλα σε έναν',
    s.config.endMode === 'firstWinner' ? 'Τέλος με τον πρώτο νικητή' : 'Πλήρης κατάταξη',
    s.config.leaverCards === 'pot' ? 'Όποιος φεύγει: κάρτες στο ξόανο' : 'Όποιος φεύγει: κάρτες εκτός',
    s.config.threePlayerRule ? 'Κανόνας 3 παικτών: ναι' : 'Κανόνας 3 παικτών: όχι',
  ];
}
