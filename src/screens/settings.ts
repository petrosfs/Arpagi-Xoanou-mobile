import { go } from '../app';
import { loadSettings, saveSettings } from '../ui/settings';
import { homeScreen } from './home';

export function settingsScreen(root: HTMLElement) {
  const st = loadSettings();
  root.className = 'screen form';
  root.innerHTML = `
    <header><button class="back" aria-label="Πίσω">‹</button><h2>Ρυθμίσεις</h2></header>
    <section>
      <h3>Γύρισμα κάρτας</h3>
      <label class="radio"><input type="radio" name="flip" value="swipe" ${st.flipGesture === 'swipe' ? 'checked' : ''}>
        <span>Σύρσιμο πάνω και κάτω πάνω στη στοίβα σου</span></label>
      <label class="radio"><input type="radio" name="flip" value="tap" ${st.flipGesture === 'tap' ? 'checked' : ''}>
        <span>Πάτημα στη στοίβα σου</span></label>
    </section>
    <section>
      <h3>Χρώματα</h3>
      <label class="check"><input type="checkbox" name="cb" ${st.colorblind ? 'checked' : ''}>
        <span>Σημάδια χρώματος για δυσχρωματοψία (1–4 γραμμές στη γωνία της κάρτας)</span></label>
    </section>`;
  root.addEventListener('change', () => {
    const flip = root.querySelector<HTMLInputElement>('input[name="flip"]:checked')!.value as 'swipe' | 'tap';
    const cb = root.querySelector<HTMLInputElement>('input[name="cb"]')!.checked;
    saveSettings({ flipGesture: flip, colorblind: cb });
  });
  root.querySelector('.back')!.addEventListener('click', () => go(homeScreen));
}
