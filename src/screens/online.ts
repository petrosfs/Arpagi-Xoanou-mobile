import { t } from '../i18n';
import { esc, go } from '../app';
import { isConfigured } from '../net/firebase';
import { CODE_RE, Room, normalizeCode } from '../net/room';
import { DEFAULT_SETUP } from '../ui/setupForm';
import { homeScreen } from './home';
import { lobbyScreen } from './lobby';

const NAME_KEY = 'arpagi.name.v1';
export const loadName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* δεν πειράζει */
  }
};

const ERROR_KEYS = ['not-found', 'started', 'full', 'bad-code', 'network', 'name', 'not-configured'] as const;
type ErrKey = (typeof ERROR_KEYS)[number];
const errText = (k: ErrKey) => t(`err.${k}`);

export function onlineScreen(root: HTMLElement, prefillCode = '') {
  root.className = 'screen form';
  root.innerHTML = `
    <header><button class="back" aria-label="${t('back')}">‹</button><h2>${t('online.title')}</h2></header>
    <section>
      <label class="field"><span>${t('online.nick')}</span>
        <input name="nick" maxlength="16" autocomplete="nickname" value="${esc(loadName())}"></label>
    </section>
    <section>
      <h3>${t('online.new')}</h3>
      <button class="primary create">${t('online.create')}</button>
    </section>
    <section>
      <h3>${t('online.haveCode')}</h3>
      <div class="join-row">
        <input name="code" class="code-input" maxlength="4" autocapitalize="characters" autocomplete="off"
          spellcheck="false" placeholder="K7XR" value="${esc(normalizeCode(prefillCode))}" aria-label="${t('online.code')}">
        <button class="join">${t('online.join')}</button>
      </div>
    </section>
    <p class="error" role="alert"></p>`;

  const err = root.querySelector<HTMLElement>('.error')!;
  const nick = root.querySelector<HTMLInputElement>('input[name="nick"]')!;
  const code = root.querySelector<HTMLInputElement>('input[name="code"]')!;
  const buttons = root.querySelectorAll<HTMLButtonElement>('.create, .join');
  code.addEventListener('input', () => (code.value = normalizeCode(code.value)));

  const busy = (on: boolean) => buttons.forEach((b) => (b.disabled = on));
  const name = () => {
    const n = nick.value.trim().slice(0, 16);
    if (!n) {
      err.textContent = errText('name');
      return null;
    }
    saveName(n);
    return n;
  };
  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : '';
    err.textContent = errText((ERROR_KEYS as readonly string[]).includes(msg) ? (msg as ErrKey) : 'network');
    busy(false);
  };

  if (!isConfigured()) {
    err.textContent = errText('not-configured');
    busy(true);
  }

  root.querySelector('.back')!.addEventListener('click', () => go(homeScreen));
  root.querySelector('.create')!.addEventListener('click', async () => {
    const n = name();
    if (!n) return;
    busy(true);
    err.textContent = '';
    try {
      const room = await Room.create(n, DEFAULT_SETUP, () => {});
      go((r) => lobbyScreen(r, room));
    } catch (e) {
      fail(e);
    }
  });
  root.querySelector('.join')!.addEventListener('click', async () => {
    const n = name();
    if (!n) return;
    if (!CODE_RE.test(code.value)) {
      err.textContent = errText('bad-code');
      return;
    }
    busy(true);
    err.textContent = '';
    try {
      const room = await Room.join(code.value, n, () => {});
      go((r) => lobbyScreen(r, room));
    } catch (e) {
      fail(e);
    }
  });
}
