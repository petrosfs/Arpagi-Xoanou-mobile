import { go } from '../app';
import { resolveLang, setLang, t } from '../i18n';
import { loadSettings, saveSettings } from '../ui/settings';
import { homeScreen } from './home';

export function settingsScreen(root: HTMLElement) {
  const st = loadSettings();
  const radio = (name: string, value: string, checked: boolean, label: string) =>
    `<label class="radio"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
  root.className = 'screen form';
  root.innerHTML = `
    <header><button class="back" aria-label="${t('back')}">‹</button><h2>${t('settings.title')}</h2></header>
    <section>
      <h3>${t('settings.lang')}</h3>
      ${radio('lang', 'auto', st.lang === 'auto', t('settings.lang.auto'))}
      ${radio('lang', 'el', st.lang === 'el', 'Ελληνικά')}
      ${radio('lang', 'en', st.lang === 'en', 'English')}
    </section>
    <section>
      <h3>${t('settings.flip')}</h3>
      ${radio('flip', 'swipe', st.flipGesture === 'swipe', t('settings.flip.swipe'))}
      ${radio('flip', 'tap', st.flipGesture === 'tap', t('settings.flip.tap'))}
    </section>
    <section>
      <h3>${t('settings.colors')}</h3>
      <label class="check"><input type="checkbox" name="cb" ${st.colorblind ? 'checked' : ''}>
        <span>${t('settings.colorblind')}</span></label>
    </section>`;
  root.addEventListener('change', (e) => {
    const val = (n: string) => root.querySelector<HTMLInputElement>(`input[name="${n}"]:checked`)!.value;
    const next = {
      flipGesture: val('flip') as 'swipe' | 'tap',
      colorblind: root.querySelector<HTMLInputElement>('input[name="cb"]')!.checked,
      lang: val('lang') as 'auto' | 'el' | 'en',
    };
    saveSettings(next);
    if ((e.target as HTMLInputElement).name === 'lang') {
      setLang(resolveLang(next.lang));
      go(settingsScreen); // ξαναζωγραφίζουμε στη νέα γλώσσα
    }
  });
  root.querySelector('.back')!.addEventListener('click', () => go(homeScreen));
}
