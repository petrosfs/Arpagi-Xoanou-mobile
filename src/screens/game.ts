import { esc, go } from '../app';
import type { GameEvent } from '../engine';
import { botLabel, type Session } from '../game/session';
import type { TableView } from '../game/view';
import { backHtml, cardHtml } from '../ui/cards';
import { FlipGesture } from '../ui/gesture';
import { fitTable, tableCenter } from '../ui/layout';
import { loadSettings } from '../ui/settings';
import { XOANO_SVG } from '../ui/xoano';
import { homeScreen } from './home';
import { summaryScreen } from './summary';

/** Παράθυρο μέτρησης δαχτύλων μετά το πρώτο άγγιγμα στο ξόανο (αρχική τιμή, ρυθμίζεται με δοκιμές). */
const FINGER_WINDOW_MS = 80;

export interface GameScreenOptions {
  /** Νέα παρτίδα με τις ίδιες ρυθμίσεις (solo). */
  replay?: () => void;
  /** Τι γίνεται μετά τη σύνοψη/έξοδο (online: πίσω στο δωμάτιο). */
  exit?: () => void;
}

export function fullName(session: Session, id: string): string {
  const lv = session.level(id);
  return lv ? `${session.name(id)} · ${botLabel(lv)}` : session.name(id);
}

export function gameScreen(root: HTMLElement, session: Session, opts: GameScreenOptions = {}) {
  const settings = loadSettings();
  const me = session.me;
  root.className = 'game';
  root.innerHTML = `
    <div class="hud">
      <button class="quit" aria-label="Έξοδος">✕</button>
      <span class="status" aria-live="polite"></span>
      <span class="conn"></span>
      <span class="pot"></span>
    </div>
    <div class="table">
      <div class="seats"></div>
      <div class="dropzone"></div>
      <div class="totem" role="button" aria-label="Ξόανο">${XOANO_SVG}</div>
      <div class="held-label" aria-live="polite"></div>
      <div class="banner"></div>
    </div>
    <div class="me">
      <div class="my-discard"></div>
      <div class="my-deck" aria-label="Η στοίβα σου"></div>
      <div class="my-info"></div>
    </div>
    <div class="toast" aria-live="assertive"></div>
    <div class="modal" hidden></div>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const table = $('.table');
  const totem = $('.totem');
  const dropzone = $('.dropzone');
  const deckEl = $('.my-deck');
  const modal = $('.modal');
  let ended = false;
  let lastRendered: TableView | null = null;
  let grabLockSeq = -1;

  // ---------- απόδοση ----------

  function layout() {
    const w = table.clientWidth;
    const h = table.clientHeight;
    const n = session.view.players.length - 1;
    const { cardW, seats: pos, totemH } = fitTable(n, w, h);
    root.style.setProperty('--cw', `${cardW}px`);
    root.style.setProperty('--th', `${totemH}px`);
    const { cx, cy } = tableCenter(w, h);
    for (const el of [totem, dropzone, $('.held-label')]) {
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
    }
    root.querySelectorAll<HTMLElement>('.seat').forEach((el, i) => {
      el.style.left = `${pos[i].x}px`;
      el.style.top = `${pos[i].y}px`;
    });
  }

  function render(v: TableView) {
    const fresh = v !== lastRendered && (lastRendered === null || v.seq !== lastRendered.seq || v.events !== lastRendered.events);
    lastRendered = v;
    const map = session.symbolMap;
    const cb = settings.colorblind;
    const playing = v.phase === 'playing' && !v.pendingAllFlip;
    $('.seats').innerHTML = v.players
      .filter((p) => p.id !== me)
      .map((p) => {
        const turn = v.turnId === p.id && playing;
        return `<div class="seat ${turn ? 'turn' : ''} ${p.status}">
          <div class="name">${esc(session.name(p.id))}</div>
          <div class="holder">${cardHtml(p.top ?? undefined, map, cb)}<span class="count" title="Κάρτες">${p.deckCount + p.discardCount}</span></div></div>`;
      })
      .join('');
    const mine = v.players.find((p) => p.id === me)!;
    $('.my-discard').innerHTML = cardHtml(mine.top ?? undefined, map, cb);
    deckEl.innerHTML = mine.deckCount ? backHtml(mine.deckCount) : `<div class="card empty"></div>`;
    const myTurn = v.turnId === me && playing && !v.held && mine.deckCount > 0;
    deckEl.classList.toggle('turn', myTurn);
    $('.my-info').textContent = myTurn
      ? settings.flipGesture === 'swipe' ? 'Σύρε πάνω-κάτω για να γυρίσεις' : 'Πάτα για να γυρίσεις'
      : `Κάρτες: ${mine.deckCount + mine.discardCount}`;
    $('.pot').textContent = v.potCount ? `Κάτω από το ξόανο: ${v.potCount}` : '';

    const banner = $('.banner');
    banner.className = 'banner';
    if (v.pendingAllFlip) {
      banner.textContent = 'Βέλη έξω: όλοι γυρίζουν μαζί!';
      banner.classList.add('show');
    } else if (v.inwardActive) {
      banner.textContent = 'Βέλη μέσα: όλοι στο ξόανο!';
      banner.classList.add('show', 'hot');
    } else if (v.matchMode === 'color') {
      banner.textContent = 'Ταίρι με χρώμα';
      banner.classList.add('show');
    }

    const held = v.held && v.phase !== 'ended';
    totem.classList.toggle('held', held);
    dropzone.classList.toggle('held', held);
    const hl = $('.held-label');
    hl.textContent = !held ? '' : v.heldBy ? `Το κρατάει: ${session.name(v.heldBy)}` : 'Το ξόανο έπεσε!';
    hl.classList.toggle('show', held);

    layout();
    if (fresh) {
      showEvents(v.events);
      renderModal(v);
      grabLockSeq = -1;
    }
    // Χρόνος αντίδρασης: μετράμε από τη στιγμή που ζωγραφίστηκε η νέα κατάσταση.
    requestAnimationFrame(() => session.markDisplayed(v.seq, performance.now()));

    if (v.phase === 'ended' && !ended) {
      ended = true;
      setTimeout(() => go((r) => summaryScreen(r, session, opts)), 1800);
    }
  }

  let toastTimer = 0;
  function toast(text: string, kind = '') {
    const t = $('.toast');
    t.textContent = text;
    t.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (t.className = 'toast'), 1600);
  }

  function showEvents(events: GameEvent[]) {
    const nm = (id: string) => session.name(id);
    for (const e of events) {
      if (e.type === 'duel') {
        if (e.winner === me) toast('Κέρδισες τη μονομαχία!', 'good');
        else if (e.losers.includes(me)) toast(`Έχασες από ${nm(e.winner)}`, 'bad');
        else toast(`${nm(e.winner)} κέρδισε τη μονομαχία`);
      } else if (e.type === 'inward') toast(e.winner === me ? 'Πρώτος στο ξόανο!' : `${nm(e.winner)} πρώτος στο ξόανο`);
      else if (e.type === 'penalty') {
        if (e.playerId === me)
          toast(e.reason === 'drop' ? 'Έριξες το ξόανο!' : e.reason === 'wrong' ? 'Λάθος άρπαγμα!' : 'Μαζεύεις τις ανοιχτές', 'bad');
        else {
          const why = e.reason === 'drop' ? 'έριξε το ξόανο' : e.reason === 'wrong' ? 'λάθος άρπαγμα' : 'μαζεύει τις ανοιχτές';
          toast(`${nm(e.playerId)}: ${why}`);
        }
      } else if (e.type === 'left') toast(`${nm(e.playerId)} αποχώρησε`);
      else if (e.type === 'ended') toast('Τέλος παρτίδας');
    }
  }

  // ---------- αποφάσεις ----------

  function renderModal(v: TableView) {
    const d = v.decision;
    if (v.phase !== 'decision' || !d || d.by !== me) {
      modal.hidden = true;
      return;
    }
    modal.hidden = false;
    const nm = (id: string) => esc(fullName(session, id));
    if (d.type === 'inwardOrDuel') {
      modal.innerHTML = `<div class="dialog"><h3>Τι ισχύει;</h3><p class="countdown"></p>
        <button class="primary" data-pick="inward">Βέλη μέσα: η στοίβα μου κάτω από το ξόανο</button>
        <button data-pick="duel">Μονομαχία: ο αντίπαλος παίρνει τις κάρτες</button></div>`;
      modal.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) =>
        b.addEventListener('click', () => session.decide({ type: 'inwardOrDuel', pick: b.dataset.pick as 'inward' | 'duel' })),
      );
    } else if (d.type === 'chooseLoser') {
      modal.innerHTML = `<div class="dialog"><h3>Ποιος παίρνει τις κάρτες σου;</h3><p class="countdown"></p>
        ${d.losers.map((id) => `<button data-loser="${esc(id)}">${nm(id)}</button>`).join('')}</div>`;
      modal.querySelectorAll<HTMLButtonElement>('[data-loser]').forEach((b) =>
        b.addEventListener('click', () => session.decide({ type: 'chooseLoser', loser: b.dataset.loser! })),
      );
    } else {
      const picked = new Set<string>();
      modal.innerHTML = `<div class="dialog"><h3>Περισσεύ${d.count > 1 ? 'ουν' : 'ει'} ${d.count} κάρτ${d.count > 1 ? 'ες' : 'α'}</h3>
        <p>Διάλεξε ${d.count} ${d.count > 1 ? 'παίκτες που παίρνουν' : 'παίκτη που παίρνει'} από μία.</p><p class="countdown"></p>
        ${d.losers.map((id) => `<button class="toggle" data-loser="${esc(id)}">${nm(id)}</button>`).join('')}
        <button class="primary confirm" disabled>Επιβεβαίωση</button></div>`;
      const confirm = modal.querySelector<HTMLButtonElement>('.confirm')!;
      modal.querySelectorAll<HTMLButtonElement>('[data-loser]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.loser!;
          if (picked.has(id)) picked.delete(id);
          else if (picked.size < d.count) picked.add(id);
          b.classList.toggle('on', picked.has(id));
          confirm.disabled = picked.size !== d.count;
        }),
      );
      confirm.addEventListener('click', () => session.decide({ type: 'remainder', losers: [...picked] }));
    }
  }

  // ---------- χρονόμετρα στην οθόνη ----------

  const tick = window.setInterval(() => {
    const v = session.view;
    const since = performance.now() - session.receivedAt;
    const left = (ms: number) => Math.max(0, Math.ceil((ms - since) / 1000));
    const status = $('.status');
    $('.conn').textContent = session.connection();
    if (v.phase === 'ended') status.textContent = 'Τέλος';
    else if (v.phase === 'decision') {
      status.textContent = v.decision?.by === me ? 'Αποφάσισε' : 'Ο νικητής αποφασίζει…';
      const cd = modal.querySelector('.countdown');
      if (cd && v.decisionLeftMs) cd.textContent = `${left(v.decisionLeftMs)} δευτ.`;
    } else if (v.pendingAllFlip) {
      status.textContent = `Όλοι γυρίζουν σε ${left(v.allFlipLeftMs)}…`;
    } else if (v.turnId === me && v.turnLeftMs) {
      const s = left(v.turnLeftMs);
      status.textContent = `Σειρά σου · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    } else status.textContent = `Σειρά: ${session.name(v.turnId)}`;
  }, 200);

  // ---------- άρπαγμα ----------

  let grab: { start: number; fingers: Set<number>; base: number; timer: number } | null = null;

  function onTotemDown(e: PointerEvent) {
    e.preventDefault();
    const v = session.view;
    if (v.phase !== 'playing' || v.held || grabLockSeq === v.seq) return;
    if (grab) {
      grab.fingers.add(e.pointerId);
      return;
    }
    const r = totem.getBoundingClientRect();
    const base = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    grab = {
      start: e.timeStamp,
      fingers: new Set([e.pointerId]),
      base,
      timer: window.setTimeout(() => {
        const g = grab!;
        grab = null;
        grabLockSeq = session.view.seq;
        session.grab({
          reactionMs: Math.max(0, g.start - session.displayedAt),
          fingers: g.fingers.size,
          baseScore: g.base,
          onTarget: true,
        });
      }, FINGER_WINDOW_MS),
    };
    totem.classList.add('grabbed');
    setTimeout(() => totem.classList.remove('grabbed'), 250);
  }

  function onDropDown(e: PointerEvent) {
    if (e.target !== dropzone) return;
    e.preventDefault();
    const v = session.view;
    if (v.phase !== 'playing' || v.held || grab || grabLockSeq === v.seq) return;
    grabLockSeq = v.seq;
    session.grab({ reactionMs: Math.max(0, e.timeStamp - session.displayedAt), fingers: 1, baseScore: 0, onTarget: false });
  }

  totem.addEventListener('pointerdown', onTotemDown);
  dropzone.addEventListener('pointerdown', onDropDown);

  // ---------- γύρισμα κάρτας ----------

  const gesture = new FlipGesture(settings.flipGesture);
  deckEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    deckEl.setPointerCapture(e.pointerId);
    gesture.down(e.clientX, e.clientY, e.timeStamp);
  });
  deckEl.addEventListener('pointermove', (e) => {
    if (gesture.move(e.clientX, e.clientY)) session.flip();
  });
  deckEl.addEventListener('pointerup', (e) => {
    if (gesture.up(e.clientX, e.clientY, e.timeStamp)) session.flip();
  });
  deckEl.addEventListener('pointercancel', () => gesture.cancel());

  // ---------- έξοδος ----------

  $('.quit').addEventListener('click', () => {
    if (!confirm('Να εγκαταλείψεις την παρτίδα;')) return;
    session.quit();
    go(homeScreen);
  });

  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  const unsub = session.subscribe(render);
  render(session.view);

  return () => {
    unsub();
    clearInterval(tick);
    clearTimeout(toastTimer);
    window.removeEventListener('resize', onResize);
  };
}
