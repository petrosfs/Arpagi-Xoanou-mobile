import { esc, go } from '../app';
import { MIN_PLAYERS } from '../engine';
import { ref, remove } from 'firebase/database';
import { OnlineMatch } from '../net/match';
import { MAX_ROOM_PLAYERS, sortedPlayers, type Room, type RoomView } from '../net/room';
import { gameScreen } from './game';
import { DEFAULT_SETUP, describeSetup, mountSetupForm, type SetupForm } from '../ui/setupForm';
import { homeScreen } from './home';

export function lobbyScreen(root: HTMLElement, room: Room) {
  root.className = 'screen form lobby';
  root.innerHTML = `
    <header><button class="back" aria-label="Έξοδος από το δωμάτιο">‹</button><h2>Δωμάτιο</h2></header>
    <section class="code-box">
      <p class="hint">Κωδικός δωματίου</p>
      <p class="room-code" aria-label="Κωδικός ${room.code.split('').join(' ')}">${room.code}</p>
      <button class="share">Κοινοποίηση συνδέσμου</button>
    </section>
    <section>
      <h3>Παίκτες <span class="count"></span></h3>
      <ul class="players"></ul>
    </section>
    <div class="host-only setup"></div>
    <section class="guest-only"><h3>Ρυθμίσεις του host</h3><ul class="setup-summary"></ul></section>
    <p class="error" role="alert"></p>
    <button class="primary start host-only">Ξεκίνα την παρτίδα</button>
    <p class="hint guest-only waiting">Περιμένουμε τον host να ξεκινήσει…</p>`;

  const err = root.querySelector<HTMLElement>('.error')!;
  let form: SetupForm | null = null;
  let saveTimer = 0;
  let leaving = false;

  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  root.querySelector('.share')!.addEventListener('click', async () => {
    const text = `Έλα να παίξουμε «Η Αρπαγή του Ξόανου»! Κωδικός: ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Η Αρπαγή του Ξόανου', text, url: link });
      else {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        err.textContent = 'Ο σύνδεσμος αντιγράφηκε.';
      }
    } catch {
      /* ο χρήστης ακύρωσε */
    }
  });

  function render(v: RoomView) {
    if (leaving || !v.loaded) return;
    if (!v.meta) {
      // Το δωμάτιο διαγράφηκε.
      room.close();
      go(homeScreen);
      return;
    }
    if (!v.players[room.uid] && Object.keys(v.players).length > 0) {
      room.close();
      alert('Ο host σε αφαίρεσε από το δωμάτιο.');
      go(homeScreen);
      return;
    }
    const host = room.isHost;
    if (v.meta.status === 'playing') {
      if ((v.meta.order ?? []).includes(room.uid)) {
        leaving = true;
        startOnline(room);
        return;
      }
      root.querySelector('.waiting')!.textContent = 'Μια παρτίδα είναι σε εξέλιξη. Θα μπεις στην επόμενη.';
    } else if (v.meta.status === 'ended') {
      // Νέος γύρος στο ίδιο δωμάτιο: ο host το ανοίγει ξανά.
      if (host) {
        room.setStatus('lobby').catch(() => {});
        remove(ref(room.db, `rooms/${room.code}/state`)).catch(() => {});
      }
    } else root.querySelector('.waiting')!.textContent = 'Περιμένουμε τον host να ξεκινήσει…';
    root.classList.toggle('is-host', host);
    const list = sortedPlayers(v.players);
    const online = list.filter(([, p]) => p.online).length;
    root.querySelector('.count')!.textContent = `(${list.length}/${MAX_ROOM_PLAYERS})`;
    root.querySelector('.players')!.innerHTML = list
      .map(
        ([id, p]) => `<li class="${p.online ? 'on' : 'off'}">
          <span class="dot" aria-hidden="true"></span>
          <span class="pname">${esc(p.name)}${id === room.uid ? ' (εσύ)' : ''}</span>
          ${id === v.meta!.host ? '<span class="badge">host</span>' : ''}
          ${!p.online ? '<span class="badge off">εκτός</span>' : ''}
          ${host && id !== room.uid ? `<button class="kick" data-kick="${id}" aria-label="Αφαίρεση ${esc(p.name)}">✕</button>` : ''}
        </li>`,
      )
      .join('');
    if (host && !form) {
      form = mountSetupForm(root.querySelector('.setup')!, v.meta.setup ?? DEFAULT_SETUP, {
        showLeaver: true,
        onChange: () => {
          clearTimeout(saveTimer);
          saveTimer = window.setTimeout(() => {
            const r = form!.read();
            if (r.ok) room.setSetup(r.setup).catch(() => (err.textContent = 'Δεν αποθηκεύτηκαν οι ρυθμίσεις.'));
          }, 400);
        },
      });
    }
    if (!host) {
      form = null;
      root.querySelector('.setup')!.innerHTML = '';
      root.querySelector('.setup-summary')!.innerHTML = describeSetup(v.meta.setup ?? DEFAULT_SETUP)
        .map((t) => `<li>${esc(t)}</li>`)
        .join('');
    }
    const start = root.querySelector<HTMLButtonElement>('.start')!;
    const ready = list.filter(([, p]) => p.online && p.inLobby !== false).length;
    start.disabled = ready < MIN_PLAYERS || ready > MAX_ROOM_PLAYERS || v.meta.status !== 'lobby';
    start.textContent = ready < MIN_PLAYERS ? 'Χρειάζεται τουλάχιστον ένας ακόμα παίκτης' : `Ξεκίνα την παρτίδα (${ready} παίκτες)`;
    void online;
  }

  root.querySelector('.players')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-kick]');
    if (b) room.kick(b.dataset.kick!).catch(() => (err.textContent = 'Η αφαίρεση απέτυχε.'));
  });

  root.querySelector('.start')!.addEventListener('click', async () => {
    const r = form?.read();
    if (r && !r.ok) {
      err.textContent = r.error;
      return;
    }
    try {
      if (r?.ok) await room.setSetup(r.setup);
      await room.start();
    } catch {
      err.textContent = 'Η έναρξη απέτυχε. Δοκίμασε ξανά.';
    }
  });

  root.querySelector('.back')!.addEventListener('click', async () => {
    leaving = true;
    await room.leave();
    go(homeScreen);
  });

  // Ο Room ενημερώνει μέσω του callback που ορίσαμε εδώ.
  room.onUpdate = render;
  room.setInLobby(true);
  render(room.view);

  return () => clearTimeout(saveTimer);
}

/** Μπαίνει στην online παρτίδα. Μετά το τέλος, «Πίσω στο δωμάτιο» επιστρέφει στο ίδιο lobby. */
function startOnline(room: Room) {
  room.setInLobby(false);
  const match = new OnlineMatch(room);
  try {
    if (localStorage.getItem('arpagi.debug') === '1') (window as unknown as { __session: unknown }).__session = match;
  } catch {
    /* χωρίς debug */
  }
  go((r) =>
    gameScreen(r, match, {
      exit: () => {
        match.dispose();
        go((el) => lobbyScreen(el, room));
      },
    }),
  );
  match.start();
}
