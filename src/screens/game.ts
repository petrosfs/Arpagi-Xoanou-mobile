import { esc, go } from '../app';
import type { GameEvent, GameState } from '../engine';
import { BOT_LEVELS } from '../solo/bots';
import { HUMAN, SoloGame, type SoloOptions } from '../solo/controller';
import { backHtml, cardHtml } from '../ui/cards';
import { FlipGesture } from '../ui/gesture';
import { fitTable, tableCenter } from '../ui/layout';
import { loadSettings } from '../ui/settings';
import { XOANO_SVG } from '../ui/xoano';
import { homeScreen } from './home';
import { summaryScreen } from './summary';

/** Παράθυρο μέτρησης δαχτύλων μετά το πρώτο άγγιγμα στο ξόανο (αρχική τιμή, ρυθμίζεται με δοκιμές). */
const FINGER_WINDOW_MS = 80;

export function playerName(game: SoloGame, id: string): string {
  if (id === HUMAN) return 'Εσύ';
  return `${id.replace('bot', 'Bot ')} · ${BOT_LEVELS[game.levels[id]].label}`;
}

export const shortName = (id: string) => (id === HUMAN ? 'Εσύ' : id.replace('bot', 'Bot '));

export function gameScreen(root: HTMLElement, opts: SoloOptions) {
  const settings = loadSettings();
  root.className = 'game';
  root.innerHTML = `
    <div class="hud">
      <button class="quit" aria-label="Έξοδος">✕</button>
      <span class="status" aria-live="polite"></span>
      <span class="pot"></span>
    </div>
    <div class="table">
      <div class="seats"></div>
      <div class="dropzone"></div>
      <div class="totem" role="button" aria-label="Ξόανο">${XOANO_SVG}</div>
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
  const game = new SoloGame(opts, (s) => render(s));

  // ---------- απόδοση ----------

  function layout() {
    const w = table.clientWidth;
    const h = table.clientHeight;
    const n = game.state.players.length - 1;
    const { cardW, seats: pos, totemH } = fitTable(n, w, h);
    root.style.setProperty('--cw', `${cardW}px`);
    root.style.setProperty('--th', `${totemH}px`);
    const { cx, cy } = tableCenter(w, h);
    for (const el of [totem, dropzone]) {
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
    }
    root.querySelectorAll<HTMLElement>('.seat').forEach((el, i) => {
      el.style.left = `${pos[i].x}px`;
      el.style.top = `${pos[i].y}px`;
    });
  }

  function render(s: GameState) {
    const map = game.symbolMap;
    const cb = settings.colorblind;
    const others = s.players.filter((p) => p.id !== HUMAN);
    const cur = s.players[s.turn];
    $('.seats').innerHTML = others
      .map((p) => {
        const top = p.discard[p.discard.length - 1];
        const turn = cur.id === p.id && s.phase === 'playing' && !s.pendingAllFlip;
        const total = p.deck.length + p.discard.length;
        return `<div class="seat ${turn ? 'turn' : ''} ${p.status}">
          <div class="name">${esc(shortName(p.id))}</div>
          <div class="holder">${cardHtml(top, map, cb)}<span class="count" title="Κάρτες">${total}</span></div></div>`;
      })
      .join('');
    const me = s.players.find((p) => p.id === HUMAN)!;
    $('.my-discard').innerHTML = cardHtml(me.discard[me.discard.length - 1], map, cb);
    deckEl.innerHTML = me.deck.length ? backHtml(me.deck.length) : `<div class="card empty"></div>`;
    const myTurn = cur.id === HUMAN && s.phase === 'playing' && !s.pendingAllFlip && me.deck.length > 0;
    deckEl.classList.toggle('turn', myTurn);
    $('.my-info').textContent = myTurn
      ? settings.flipGesture === 'swipe' ? 'Σύρε πάνω-κάτω για να γυρίσεις' : 'Πάτα για να γυρίσεις'
      : `Κάρτες: ${me.deck.length + me.discard.length}`;
    $('.pot').textContent = s.pot.length ? `Κάτω από το ξόανο: ${s.pot.length}` : '';

    const banner = $('.banner');
    banner.className = 'banner';
    if (s.pendingAllFlip) {
      banner.textContent = 'Βέλη έξω: όλοι γυρίζουν μαζί!';
      banner.classList.add('show');
    } else if (s.inwardActive) {
      banner.textContent = 'Βέλη μέσα: όλοι στο ξόανο!';
      banner.classList.add('show', 'hot');
    } else if (s.matchMode === 'color') {
      banner.textContent = 'Ταίρι με χρώμα';
      banner.classList.add('show');
    }

    layout();
    showEvents(s.events);
    renderModal(s);
    // Χρόνος αντίδρασης: μετράμε από τη στιγμή που ζωγραφίστηκε η νέα κατάσταση.
    requestAnimationFrame(() => game.markDisplayed(s.seq, performance.now()));
    grabLockSeq = -1;

    if (s.phase === 'ended' && !ended) {
      ended = true;
      setTimeout(() => go((r) => summaryScreen(r, game, opts)), 1800);
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
    const nm = (id: string) => (id === HUMAN ? 'Εσύ' : id.replace('bot', 'Bot '));
    for (const e of events) {
      if (e.type === 'duel') {
        if (e.winner === HUMAN) toast('Κέρδισες τη μονομαχία!', 'good');
        else if (e.losers.includes(HUMAN)) toast(`Έχασες από ${nm(e.winner)}`, 'bad');
        else toast(`${nm(e.winner)} κέρδισε τη μονομαχία`);
      } else if (e.type === 'inward') toast(e.winner === HUMAN ? 'Πρώτος στο ξόανο!' : `${nm(e.winner)} πρώτος στο ξόανο`);
      else if (e.type === 'penalty') {
        const who = e.playerId === HUMAN ? 'Εσύ' : nm(e.playerId);
        const why = e.reason === 'drop' ? 'έριξε το ξόανο' : e.reason === 'wrong' ? 'λάθος άρπαγμα' : 'μαζεύει τις ανοιχτές';
        toast(e.playerId === HUMAN ? (e.reason === 'drop' ? 'Έριξες το ξόανο!' : e.reason === 'wrong' ? 'Λάθος άρπαγμα!' : 'Μαζεύεις τις ανοιχτές') : `${who}: ${why}`, e.playerId === HUMAN ? 'bad' : '');
      } else if (e.type === 'ended') toast('Τέλος παρτίδας');
    }
  }

  // ---------- αποφάσεις ----------

  function renderModal(s: GameState) {
    const d = s.decision;
    if (s.phase !== 'decision' || !d || d.by !== HUMAN) {
      modal.hidden = true;
      return;
    }
    modal.hidden = false;
    const nm = (id: string) => esc(playerName(game, id));
    if (d.type === 'inwardOrDuel') {
      modal.innerHTML = `<div class="dialog"><h3>Τι ισχύει;</h3><p class="countdown"></p>
        <button class="primary" data-pick="inward">Βέλη μέσα: η στοίβα μου κάτω από το ξόανο</button>
        <button data-pick="duel">Μονομαχία: ο αντίπαλος παίρνει τις κάρτες</button></div>`;
      modal.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) =>
        b.addEventListener('click', () => game.humanDecide({ type: 'inwardOrDuel', pick: b.dataset.pick as 'inward' | 'duel' })),
      );
    } else if (d.type === 'chooseLoser') {
      modal.innerHTML = `<div class="dialog"><h3>Ποιος παίρνει τις κάρτες σου;</h3><p class="countdown"></p>
        ${d.losers.map((id) => `<button data-loser="${id}">${nm(id)}</button>`).join('')}</div>`;
      modal.querySelectorAll<HTMLButtonElement>('[data-loser]').forEach((b) =>
        b.addEventListener('click', () => game.humanDecide({ type: 'chooseLoser', loser: b.dataset.loser! })),
      );
    } else {
      const picked = new Set<string>();
      modal.innerHTML = `<div class="dialog"><h3>Περισσεύ${d.count > 1 ? 'ουν' : 'ει'} ${d.count} κάρτ${d.count > 1 ? 'ες' : 'α'}</h3>
        <p>Διάλεξε ${d.count} ${d.count > 1 ? 'παίκτες που παίρνουν' : 'παίκτη που παίρνει'} από μία.</p><p class="countdown"></p>
        ${d.losers.map((id) => `<button class="toggle" data-loser="${id}">${nm(id)}</button>`).join('')}
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
      confirm.addEventListener('click', () => game.humanDecide({ type: 'remainder', losers: [...picked] }));
    }
  }

  // ---------- χρονόμετρα στην οθόνη ----------

  const tick = window.setInterval(() => {
    const s = game.state;
    const now = performance.now();
    const status = $('.status');
    if (s.phase === 'ended') status.textContent = 'Τέλος';
    else if (s.phase === 'decision') {
      status.textContent = s.decision?.by === HUMAN ? 'Αποφάσισε' : 'Ο νικητής αποφασίζει…';
      const cd = modal.querySelector('.countdown');
      if (cd && game.decisionDeadline) cd.textContent = `${Math.max(0, Math.ceil((game.decisionDeadline - now) / 1000))} δευτ.`;
    } else if (s.pendingAllFlip) {
      status.textContent = `Όλοι γυρίζουν σε ${Math.max(0, Math.ceil((game.allFlipAt - now) / 1000))}…`;
    } else {
      const cur = s.players[s.turn];
      if (cur.id === HUMAN && game.turnDeadline) {
        const left = Math.max(0, Math.ceil((game.turnDeadline - now) / 1000));
        status.textContent = `Σειρά σου · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      } else status.textContent = `Σειρά: ${cur.id === HUMAN ? 'Εσύ' : cur.id.replace('bot', 'Bot ')}`;
    }
  }, 200);

  // ---------- άρπαγμα ----------

  let grabLockSeq = -1;
  let grab: { start: number; fingers: Set<number>; base: number; timer: number } | null = null;

  function onTotemDown(e: PointerEvent) {
    e.preventDefault();
    const s = game.state;
    if (s.phase !== 'playing' || grabLockSeq === s.seq) return;
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
        grabLockSeq = game.state.seq;
        game.humanGrab({
          reactionMs: Math.max(0, g.start - game.displayedAt),
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
    const s = game.state;
    if (s.phase !== 'playing' || grab || grabLockSeq === s.seq) return;
    grabLockSeq = s.seq;
    game.humanGrab({ reactionMs: Math.max(0, e.timeStamp - game.displayedAt), fingers: 1, baseScore: 0, onTarget: false });
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
    if (gesture.move(e.clientX, e.clientY)) game.humanFlip();
  });
  deckEl.addEventListener('pointerup', (e) => {
    if (gesture.up(e.clientX, e.clientY, e.timeStamp)) game.humanFlip();
  });
  deckEl.addEventListener('pointercancel', () => gesture.cancel());

  // ---------- έξοδος ----------

  $('.quit').addEventListener('click', () => {
    if (confirm('Να εγκαταλείψεις την παρτίδα;')) go(homeScreen);
  });

  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  game.start();

  return () => {
    game.stop();
    clearInterval(tick);
    clearTimeout(toastTimer);
    window.removeEventListener('resize', onResize);
  };
}
