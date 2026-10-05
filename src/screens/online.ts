import { esc, go } from '../app';
import { isConfigured } from '../net/firebase';
import { CODE_RE, Room, normalizeCode, type RoomError } from '../net/room';
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

const ERRORS: Record<RoomError | 'name' | 'not-configured', string> = {
  'not-found': 'Δεν υπάρχει δωμάτιο με αυτόν τον κωδικό.',
  started: 'Η παρτίδα σε αυτό το δωμάτιο έχει ήδη ξεκινήσει.',
  full: 'Το δωμάτιο είναι γεμάτο (10 παίκτες).',
  'bad-code': 'Ο κωδικός έχει 4 χαρακτήρες (γράμματα και αριθμοί).',
  network: 'Πρόβλημα σύνδεσης. Δοκίμασε ξανά.',
  name: 'Γράψε ένα ψευδώνυμο (1–16 χαρακτήρες).',
  'not-configured': 'Το online δεν έχει ρυθμιστεί ακόμα σε αυτή την έκδοση.',
};

export function onlineScreen(root: HTMLElement, prefillCode = '') {
  root.className = 'screen form';
  root.innerHTML = `
    <header><button class="back" aria-label="Πίσω">‹</button><h2>Online με φίλους</h2></header>
    <section>
      <label class="field"><span>Ψευδώνυμο</span>
        <input name="nick" maxlength="16" autocomplete="nickname" value="${esc(loadName())}"></label>
    </section>
    <section>
      <h3>Νέο δωμάτιο</h3>
      <button class="primary create">Δημιουργία δωματίου</button>
    </section>
    <section>
      <h3>Έχω κωδικό</h3>
      <div class="join-row">
        <input name="code" class="code-input" maxlength="4" autocapitalize="characters" autocomplete="off"
          spellcheck="false" placeholder="K7XR" value="${esc(normalizeCode(prefillCode))}" aria-label="Κωδικός δωματίου">
        <button class="join">Είσοδος</button>
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
      err.textContent = ERRORS.name;
      return null;
    }
    saveName(n);
    return n;
  };
  const fail = (e: unknown) => {
    const key = (e instanceof Error ? e.message : '') as keyof typeof ERRORS;
    err.textContent = ERRORS[key] ?? ERRORS.network;
    busy(false);
  };

  if (!isConfigured()) {
    err.textContent = ERRORS['not-configured'];
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
      err.textContent = ERRORS['bad-code'];
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
