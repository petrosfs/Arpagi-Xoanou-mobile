import { t } from '../i18n';
import { openRules } from './rules';
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
/** Διάρκεια γυρίσματος κάρτας (3D). Ο χρόνος αντίδρασης μετράει από τη μέση του, όταν το σύμβολο φαίνεται. */
const FLIP_MS = 100;
const FLY_MS = 420;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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
      <button class="quit" aria-label="${t('game.quit')}">✕</button>
      <span class="status" aria-live="polite"></span>
      <span class="conn"></span>
      <span class="pot"></span>
      <button class="help" aria-label="${t('home.rules')}">?</button>
    </div>
    <div class="table">
      <div class="table-surface" aria-hidden="true"></div>
      <div class="seats"></div>
      <div class="dropzone"></div>
      <div class="totem" role="button" aria-label="${t('game.totem')}">${XOANO_SVG}</div>
      <div class="held-label" aria-live="polite"></div>
      <div class="banner"></div>
    </div>
    <div class="me">
      <div class="my-discard"></div>
      <div class="my-deck" aria-label="${t('game.myDeck')}"></div>
      <div class="my-info"></div>
    </div>
    <div class="fx" aria-hidden="true"></div>
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
  /** Η πάνω κάρτα κάθε παίκτη στην προηγούμενη απόδοση, για να ξέρουμε ποια μόλις γύρισε. */
  const lastTop = new Map<string, number>();
  let surfaceKey = '';

  // ---------- απόδοση ----------

  function layout() {
    const w = table.clientWidth;
    const h = table.clientHeight;
    const n = session.view.players.length - 1;
    const { cardW, seats: pos, totemH } = fitTable(n, w, h);
    root.style.setProperty('--cw', `${cardW}px`);
    root.style.setProperty('--th', `${totemH}px`);
    const { cx, cy } = tableCenter(w, h);
    // Η επιφάνεια ζωγραφίζεται μία φορά· αλλάζει μόνο αν αλλάξει το μέγεθος της οθόνης.
    const key = `${w}x${h}`;
    if (surfaceKey !== key) {
      surfaceKey = key;
      const surface = $('.table-surface');
      surface.style.left = `${cx}px`;
      surface.style.top = `${cy}px`;
      surface.style.width = `${w * 0.94}px`;
      surface.style.height = `${h * 0.86}px`;
    }
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
    // Ποιες κάρτες μόλις γύρισαν (για το εφέ γυρίσματος).
    const flipped = new Set<string>();
    for (const p of v.players) {
      const id = p.top?.id ?? -1;
      if (p.top && lastTop.get(p.id) !== id && v.events.some((e) => e.type === 'flip' || e.type === 'allFlip')) flipped.add(p.id);
      lastTop.set(p.id, id);
    }
    const stack = (n: number) => (n > 2 ? 'stack2' : n > 1 ? 'stack1' : '');
    $('.seats').innerHTML = v.players
      .filter((p) => p.id !== me)
      .map((p) => {
        const turn = v.turnId === p.id && playing;
        return `<div class="seat ${turn ? 'turn' : ''} ${p.status}" data-id="${esc(p.id)}">
          <div class="name">${esc(session.name(p.id))}</div>
          <div class="holder ${stack(p.discardCount)} ${flipped.has(p.id) ? 'flip-in' : ''}">${cardHtml(p.top ?? undefined, map, cb)}<span class="count" title="${t('card.count')}">${p.deckCount + p.discardCount}</span></div></div>`;
      })
      .join('');
    const mine = v.players.find((p) => p.id === me)!;
    const myDiscard = $('.my-discard');
    myDiscard.innerHTML = cardHtml(mine.top ?? undefined, map, cb);
    myDiscard.className = `my-discard ${stack(mine.discardCount)} ${flipped.has(me) ? 'flip-in' : ''}`;
    deckEl.innerHTML = mine.deckCount ? backHtml(mine.deckCount) : `<div class="card empty"></div>`;
    deckEl.dataset.depth = String(Math.min(4, Math.ceil(mine.deckCount / 6)));
    const myTurn = v.turnId === me && playing && !v.held && mine.deckCount > 0;
    deckEl.classList.toggle('turn', myTurn);
    $('.my-info').textContent = myTurn
      ? t(settings.flipGesture === 'swipe' ? 'game.flipSwipe' : 'game.flipTap')
      : t('game.cards', { n: mine.deckCount + mine.discardCount });
    $('.pot').textContent = v.potCount ? t('game.pot', { n: v.potCount }) : '';

    const banner = $('.banner');
    banner.className = 'banner';
    if (v.pendingAllFlip) {
      banner.textContent = t('game.banner.out');
      banner.classList.add('show');
    } else if (v.inwardActive) {
      banner.textContent = t('game.banner.in');
      banner.classList.add('show', 'hot');
    } else if (v.matchMode === 'color') {
      banner.textContent = t('game.banner.color');
      banner.classList.add('show');
    }

    const held = v.held && v.phase !== 'ended';
    totem.classList.toggle('held', held);
    dropzone.classList.toggle('held', held);
    const hl = $('.held-label');
    hl.textContent = !held ? '' : v.heldBy ? t('game.heldBy', { name: session.name(v.heldBy) }) : t('game.fell');
    hl.classList.toggle('show', held);

    layout();
    if (fresh) {
      showEvents(v.events);
      flyEvents(v);
      renderModal(v);
      grabLockSeq = -1;
    }
    // Χρόνος αντίδρασης: από τη στιγμή που ζωγραφίστηκε η νέα κατάσταση. Αν γύρισε κάρτα με εφέ,
    // από τη μέση του γυρίσματος, όταν το σύμβολο έχει ήδη φανεί.
    const flipDelay = flipped.size && !reducedMotion() ? FLIP_MS / 2 : 0;
    requestAnimationFrame(() => session.markDisplayed(v.seq, performance.now() + flipDelay));

    if (v.phase === 'ended' && !ended) {
      ended = true;
      setTimeout(() => go((r) => summaryScreen(r, session, opts)), 1800);
    }
  }

  // ---------- κάρτες που πετούν (3D) ----------

  /** Κέντρο ενός παίκτη ('' = το ξόανο) σε συντεταγμένες της οθόνης. */
  function spot(id: string): { x: number; y: number } | null {
    const el =
      id === '' ? totem : id === me ? $('.my-discard') : root.querySelector<HTMLElement>(`.seat[data-id="${CSS.escape(id)}"] .holder`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function fly(fromIds: string[], toId: string) {
    const to = spot(toId);
    if (!to || reducedMotion()) return;
    const fx = $('.fx');
    const per = fromIds.length > 4 ? 1 : 2;
    fromIds.slice(0, 10).forEach((fromId, i) => {
      const from = spot(fromId);
      if (!from) return;
      for (let k = 0; k < per; k++) {
        const c = document.createElement('div');
        c.className = 'fly-card';
        c.style.left = `${from.x}px`;
        c.style.top = `${from.y}px`;
        fx.appendChild(c);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const delay = i * 60 + k * 45;
        c.animate(
          [
            { transform: 'translate(-50%, -50%) translateZ(0) rotateX(0deg) rotateZ(0deg)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2}px)) translateZ(60px) rotateX(35deg) rotateZ(${(k - 1) * 12}deg)`, opacity: 1, offset: 0.5 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) translateZ(0) rotateX(0deg) rotateZ(${(k - 1) * 6}deg)`, opacity: 0.2 },
          ],
          { duration: FLY_MS, delay, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' },
        ).onfinish = () => c.remove();
        setTimeout(() => c.remove(), FLY_MS + delay + 100);
      }
    });
  }

  function flyEvents(v: TableView) {
    for (const e of v.events) {
      if (e.type === 'duel') for (const l of e.losers) fly([e.winner, ''], l);
      else if (e.type === 'inward') fly([e.winner], '');
      else if (e.type === 'penalty') fly([...v.players.map((p) => p.id).filter((id) => id !== e.playerId), ''], e.playerId);
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
        if (e.winner === me) toast(t('game.won'), 'good');
        else if (e.losers.includes(me)) toast(t('game.lostTo', { name: nm(e.winner) }), 'bad');
        else toast(t('game.wonOther', { name: nm(e.winner) }));
      } else if (e.type === 'inward') toast(e.winner === me ? t('game.firstMe') : t('game.firstOther', { name: nm(e.winner) }));
      else if (e.type === 'penalty') {
        const kind = e.reason === 'drop' ? 'drop' : e.reason === 'wrong' ? 'wrong' : 'collect';
        if (e.playerId === me) toast(t(`game.${kind}Me`), 'bad');
        else toast(t(`game.${kind}Other`, { name: nm(e.playerId) }));
      } else if (e.type === 'left') toast(t('game.left', { name: nm(e.playerId) }));
      else if (e.type === 'ended') toast(t('game.over'));
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
      modal.innerHTML = `<div class="dialog"><h3>${t('dec.which')}</h3><p class="countdown"></p>
        <button class="primary" data-pick="inward">${t('dec.inward')}</button>
        <button data-pick="duel">${t('dec.duel')}</button></div>`;
      modal.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) =>
        b.addEventListener('click', () => session.decide({ type: 'inwardOrDuel', pick: b.dataset.pick as 'inward' | 'duel' })),
      );
    } else if (d.type === 'chooseLoser') {
      modal.innerHTML = `<div class="dialog"><h3>${t('dec.whoTakes')}</h3><p class="countdown"></p>
        ${d.losers.map((id) => `<button data-loser="${esc(id)}">${nm(id)}</button>`).join('')}</div>`;
      modal.querySelectorAll<HTMLButtonElement>('[data-loser]').forEach((b) =>
        b.addEventListener('click', () => session.decide({ type: 'chooseLoser', loser: b.dataset.loser! })),
      );
    } else {
      const picked = new Set<string>();
      modal.innerHTML = `<div class="dialog"><h3>${t('dec.remainder', { n: d.count })}</h3>
        <p>${t('dec.remainderHint', { n: d.count })}</p><p class="countdown"></p>
        ${d.losers.map((id) => `<button class="toggle" data-loser="${esc(id)}">${nm(id)}</button>`).join('')}
        <button class="primary confirm" disabled>${t('dec.confirm')}</button></div>`;
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
    if (v.phase === 'ended') status.textContent = t('game.end');
    else if (v.phase === 'decision') {
      status.textContent = v.decision?.by === me ? t('game.decide') : t('game.winnerDeciding');
      const cd = modal.querySelector('.countdown');
      if (cd && v.decisionLeftMs) cd.textContent = t('game.seconds', { n: left(v.decisionLeftMs) });
    } else if (v.pendingAllFlip) {
      status.textContent = t('game.allFlipIn', { n: left(v.allFlipLeftMs) });
    } else if (v.turnId === me && v.turnLeftMs) {
      const s = left(v.turnLeftMs);
      status.textContent = t('game.yourTurn', { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
    } else status.textContent = t('game.turnOf', { name: session.name(v.turnId) });
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
    if (!confirm(t('game.quitConfirm'))) return;
    session.quit();
    go(homeScreen);
  });

  $('.help').addEventListener('click', () => openRules());

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
