import { buildDeck } from './deck';
import { nextRandom, shuffle } from './rng';
import {
  DEFAULT_CONFIG, MAX_PLAYERS, MAX_SYMBOLS, MIN_PLAYERS, MIN_SYMBOLS, TIE_MS,
  type Card, type DecisionChoice, type GameConfig, type GameState, type GrabAttempt, type PlayerState,
} from './types';

// ---------- βοηθητικά ----------

const clone = (s: GameState): GameState => {
  const c = structuredClone(s);
  c.events = [];
  return c;
};

const topOf = (p: PlayerState): Card | undefined => p.discard[p.discard.length - 1];

/** Παίκτης που είναι ακόμα στο τραπέζι (ενεργός ή προσωρινά αποσυνδεδεμένος). */
const inPlay = (p: PlayerState) => p.status === 'active' || p.status === 'disconnected';

const byId = (s: GameState, id: string): PlayerState => {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`Άγνωστος παίκτης: ${id}`);
  return p;
};

const indexOf = (s: GameState, id: string) => s.players.findIndex((x) => x.id === id);

const canFlip = (p: PlayerState) => p.status === 'active' && p.deck.length > 0;

/** Οι αντίπαλοι των οποίων η ορατή κάρτα ταιριάζει με του παίκτη (σύμβολο ή χρώμα, ανάλογα με τη λειτουργία). */
export function matchesOf(s: GameState, id: string): string[] {
  const p = byId(s, id);
  const t = topOf(p);
  if (!inPlay(p) || !t || t.kind !== 'symbol') return [];
  return s.players
    .filter((o) => o.id !== id && inPlay(o))
    .filter((o) => {
      const ot = topOf(o);
      if (!ot || ot.kind !== 'symbol') return false;
      return s.matchMode === 'symbol' ? ot.symbol === t.symbol : ot.color === t.color;
    })
    .map((o) => o.id);
}

/** Δικαιούται ο παίκτης να αρπάξει το ξόανο αυτή τη στιγμή; */
export function canGrab(s: GameState, id: string): boolean {
  const p = byId(s, id);
  return p.status === 'active' && (s.inwardActive || matchesOf(s, id).length > 0);
}

const anyGrabPossible = (s: GameState) =>
  s.inwardActive || s.players.some((p) => matchesOf(s, p.id).length > 0);

function advanceTurn(s: GameState, from: number) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (canFlip(s.players[i])) {
      s.turn = i;
      return;
    }
  }
}

function setTurnTo(s: GameState, idx: number) {
  if (canFlip(s.players[idx])) s.turn = idx;
  else advanceTurn(s, idx);
}

function collectFaceUp(s: GameState, includePot: boolean): Card[] {
  const out: Card[] = [];
  for (const p of s.players) {
    if (!inPlay(p)) continue;
    out.push(...p.discard);
    p.discard = [];
  }
  if (includePot) {
    out.push(...s.pot);
    s.pot = [];
  }
  return shuffle(s, out);
}

function resetSpecialState(s: GameState) {
  s.matchMode = 'symbol';
  s.inwardActive = false;
  s.lastCardInward = null;
  s.pendingAllFlip = false;
  s.outwardFlipper = null;
}

function penalty(s: GameState, p: PlayerState, reason: 'wrong' | 'drop' | 'lastColors' | 'lastInward') {
  p.deck.push(...collectFaceUp(s, reason === 'wrong' || reason === 'drop'));
  if (reason === 'wrong') p.stats.wrongGrabs++;
  if (reason === 'drop') p.stats.drops++;
  s.events.push({ type: 'penalty', playerId: p.id, reason });
}

function checkFinished(s: GameState) {
  for (const p of s.players) {
    if (inPlay(p) && p.deck.length === 0 && p.discard.length === 0) {
      p.status = 'finished';
      s.finishOrder.push(p.id);
      s.events.push({ type: 'finished', playerId: p.id });
    }
  }
}

function endGame(s: GameState) {
  const remaining = s.players
    .filter(inPlay)
    .sort((a, b) => a.deck.length + a.discard.length - (b.deck.length + b.discard.length))
    .map((p) => p.id);
  s.ranking = [...s.finishOrder, ...remaining, ...[...s.leftOrder].reverse()];
  s.phase = 'ended';
  s.decision = null;
  s.events.push({ type: 'ended', ranking: s.ranking });
}

function checkEnd(s: GameState) {
  if (s.phase === 'ended') return;
  const remaining = s.players.filter(inPlay);
  if (s.config.endMode === 'firstWinner' && s.finishOrder.length > 0) return endGame(s);
  if (remaining.length <= 1) return endGame(s);
  // Αδιέξοδο: κανείς δεν έχει κλειστή στοίβα και δεν υπάρχει άρπαγμα σε εκκρεμότητα.
  const anyDeck = remaining.some((p) => p.deck.length > 0);
  if (s.phase === 'playing' && !anyDeck && !s.pendingAllFlip && !anyGrabPossible(s)) endGame(s);
}

function finalize(s: GameState): GameState {
  checkFinished(s);
  checkEnd(s);
  if (s.phase === 'playing' && !canFlip(s.players[s.turn]) && !s.pendingAllFlip) advanceTurn(s, s.turn);
  return s;
}

// ---------- δημιουργία ----------

export function createGame(playerIds: string[], config: Partial<GameConfig> & { seed: number }): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS)
    throw new Error(`Παίκτες: ${MIN_PLAYERS}–${MAX_PLAYERS}`);
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Διπλό id παίκτη');
  if (cfg.symbolCount < MIN_SYMBOLS || cfg.symbolCount > MAX_SYMBOLS)
    throw new Error(`Σύμβολα: ${MIN_SYMBOLS}–${MAX_SYMBOLS}`);

  const threeRuleActive = cfg.threePlayerRule && playerIds.length === 3;
  const s: GameState = {
    config: cfg,
    players: playerIds.map((id) => ({
      id, deck: [], discard: [], status: 'active',
      stats: { duelsWon: 0, duelsLost: 0, wrongGrabs: 0, drops: 0 },
    })),
    pot: [], turn: 0, matchMode: 'symbol', inwardActive: false, lastCardInward: null,
    pendingAllFlip: false, outwardFlipper: null, threeRuleActive, decision: null,
    phase: 'playing', finishOrder: [], leftOrder: [], ranking: [], rng: cfg.seed | 0, seq: 0, events: [],
  };
  const deck = shuffle(s, buildDeck(playerIds.length, cfg.symbolCount, !threeRuleActive));
  const per = Math.floor(deck.length / playerIds.length);
  s.players.forEach((p, i) => (p.deck = deck.slice(i * per, (i + 1) * per)));
  s.pot = deck.slice(per * playerIds.length);
  return s;
}

// ---------- γύρισμα καρτών ----------

function afterReveal(s: GameState, flips: { p: PlayerState; card: Card }[], all: boolean) {
  let outwardSeen = false;
  let colorsSeen = false;
  let specialSeen = false;
  for (const { p, card } of flips) {
    const last = p.deck.length === 0;
    if (card.kind === 'symbol') continue;
    specialSeen = true;
    if (card.kind === 'inward') {
      s.inwardActive = true;
      if (last) s.lastCardInward = p.id;
    } else if (card.kind === 'outward') {
      if (last) {
        // Βέλη έξω ως τελευταία κάρτα: νικά αμέσως. Η στοίβα του πάει στο pot.
        s.pot.push(...p.discard);
        p.discard = [];
      } else outwardSeen = true;
    } else if (card.kind === 'colors') {
      if (last) penalty(s, p, 'lastColors');
      else colorsSeen = true;
    }
  }
  if (colorsSeen) s.matchMode = 'color';
  else if (specialSeen) s.matchMode = 'symbol';

  if (s.threeRuleActive) {
    const tops = s.players.filter(inPlay).map(topOf);
    if (tops.length === 3 && tops.every((t) => t?.kind === 'symbol')) {
      const colors = new Set(tops.map((t) => (t as { color: number }).color));
      if (colors.size === 1) s.inwardActive = true;
    }
  }

  const flipper = flips[0]?.p;
  if (!all) {
    if (outwardSeen && flipper) {
      s.pendingAllFlip = true;
      s.outwardFlipper = flipper.id;
    } else if (flipper) advanceTurn(s, indexOf(s, flipper.id));
  } else {
    s.pendingAllFlip = outwardSeen && !anyGrabPossible(s);
    if (!s.pendingAllFlip) {
      if (s.outwardFlipper) setTurnTo(s, indexOf(s, s.outwardFlipper));
      s.outwardFlipper = null;
    }
  }
}

export function flip(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing' || state.pendingAllFlip) return state;
  const cur = state.players[state.turn];
  if (cur.id !== playerId || !canFlip(cur)) return state;
  const s = clone(state);
  // Αν κανείς δεν άρπαξε μετά από βέλη μέσα, το εφέ λήγει με το επόμενο γύρισμα.
  s.inwardActive = false;
  s.lastCardInward = null;
  const p = s.players[s.turn];
  const card = p.deck.shift() as Card;
  p.discard.push(card);
  s.seq++;
  s.events.push({ type: 'flip', playerId, card });
  afterReveal(s, [{ p, card }], false);
  return finalize(s);
}

/** Ταυτόχρονο γύρισμα μετά από βέλη έξω (ο host το καλεί μετά την αντίστροφη μέτρηση). */
export function allFlip(state: GameState): GameState {
  if (state.phase !== 'playing' || !state.pendingAllFlip) return state;
  const s = clone(state);
  const flips: { p: PlayerState; card: Card }[] = [];
  for (const p of s.players) {
    if (!canFlip(p)) continue;
    const card = p.deck.shift() as Card;
    p.discard.push(card);
    flips.push({ p, card });
  }
  s.seq++;
  s.events.push({ type: 'allFlip', flips: flips.map((f) => ({ playerId: f.p.id, card: f.card })) });
  if (flips.length === 0) {
    s.pendingAllFlip = false;
    if (s.outwardFlipper) setTurnTo(s, indexOf(s, s.outwardFlipper));
    s.outwardFlipper = null;
  } else afterReveal(s, flips, true);
  return finalize(s);
}

// ---------- άρπαγμα ----------

/** true αν το a είναι καλύτερο άρπαγμα από το b. */
function better(a: GrabAttempt & { r: number }, b: GrabAttempt & { r: number }): boolean {
  const d = a.reactionMs - b.reactionMs;
  if (Math.abs(d) > TIE_MS) return d < 0;
  if (a.fingers !== b.fingers) return a.fingers > b.fingers;
  if (a.baseScore !== b.baseScore) return a.baseScore > b.baseScore;
  return a.r < b.r;
}

function doInward(s: GameState, w: PlayerState) {
  const lastId = s.lastCardInward;
  s.inwardActive = false;
  s.lastCardInward = null;
  if (lastId && lastId !== w.id && inPlay(byId(s, lastId))) {
    // Γύρισε βέλη μέσα ως τελευταία κάρτα και δεν τα άρπαξε: μαζεύει όλες τις ανοιχτές.
    const loser = byId(s, lastId);
    penalty(s, loser, 'lastInward');
    setTurnTo(s, indexOf(s, loser.id));
    return;
  }
  s.pot.push(...w.discard);
  w.discard = [];
  s.events.push({ type: 'inward', winner: w.id });
  setTurnTo(s, indexOf(s, w.id));
}

function doDuel(s: GameState, w: PlayerState) {
  const loserIds = matchesOf(s, w.id);
  s.matchMode = 'symbol';
  w.stats.duelsWon++;
  const losers = loserIds.map((id) => byId(s, id));
  for (const l of losers) {
    l.stats.duelsLost++;
    l.deck.push(...l.discard);
    l.discard = [];
  }
  const spoils = [...w.discard, ...s.pot];
  w.discard = [];
  s.pot = [];
  s.events.push({ type: 'duel', winner: w.id, losers: loserIds });

  if (losers.length === 1) losers[0].deck.push(...spoils);
  else if (s.config.distribution === 'equal') {
    const q = Math.floor(spoils.length / losers.length);
    const r = spoils.length % losers.length;
    losers.forEach((l, i) => l.deck.push(...spoils.slice(i * q, (i + 1) * q)));
    if (r > 0) {
      s.decision = { type: 'remainder', by: w.id, losers: loserIds, cards: spoils.slice(q * losers.length), count: r };
      s.phase = 'decision';
    }
  } else {
    s.decision = { type: 'chooseLoser', by: w.id, losers: loserIds, cards: spoils };
    s.phase = 'decision';
  }

  // Ο επόμενος γύρος ξεκινά από τον πρώτο χαμένο δεξιόστροφα από τον νικητή.
  const wi = indexOf(s, w.id);
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (wi + k) % n;
    if (loserIds.includes(s.players[i].id)) {
      setTurnTo(s, i);
      break;
    }
  }
}

/** Ο host συγκεντρώνει τα αρπάγματα ενός παραθύρου και τα δίνει εδώ. Μετράει μόνο το καλύτερο. */
export function resolveGrabs(state: GameState, attempts: GrabAttempt[]): GameState {
  if (state.phase !== 'playing') return state;
  const valid = attempts.filter((a) => state.players.some((p) => p.id === a.playerId && p.status === 'active'));
  if (valid.length === 0) return state;
  const s = clone(state);
  const seen = new Set<string>();
  const ranked = valid
    .filter((a) => (seen.has(a.playerId) ? false : (seen.add(a.playerId), true)))
    .map((a) => ({ ...a, r: nextRandom(s) }));
  let best = ranked[0];
  for (const a of ranked.slice(1)) if (better(a, best)) best = a;
  const w = byId(s, best.playerId);

  if (!best.onTarget) {
    penalty(s, w, 'drop');
    resetSpecialState(s);
    setTurnTo(s, indexOf(s, w.id));
  } else if (!canGrab(s, w.id)) {
    penalty(s, w, 'wrong');
    resetSpecialState(s);
    setTurnTo(s, indexOf(s, w.id));
  } else if (s.inwardActive && matchesOf(s, w.id).length > 0) {
    s.decision = { type: 'inwardOrDuel', by: w.id };
    s.phase = 'decision';
  } else if (s.inwardActive) doInward(s, w);
  else doDuel(s, w);
  s.seq++;
  return finalize(s);
}

// ---------- αποφάσεις ----------

export function applyDecision(state: GameState, playerId: string, choice: DecisionChoice): GameState {
  const d = state.decision;
  if (state.phase !== 'decision' || !d || d.by !== playerId || d.type !== choice.type) return state;
  const s = clone(state);
  const dec = s.decision!;
  s.decision = null;
  s.phase = 'playing';
  if (dec.type === 'inwardOrDuel' && choice.type === 'inwardOrDuel') {
    const w = byId(s, playerId);
    if (choice.pick === 'inward') doInward(s, w);
    else {
      s.inwardActive = false;
      s.lastCardInward = null;
      doDuel(s, w);
    }
  } else if (dec.type === 'remainder' && choice.type === 'remainder') {
    const pick = [...new Set(choice.losers)];
    if (pick.length !== dec.count || !pick.every((id) => dec.losers.includes(id))) return state;
    pick.forEach((id, i) => byId(s, id).deck.push(dec.cards[i]));
  } else if (dec.type === 'chooseLoser' && choice.type === 'chooseLoser') {
    if (!dec.losers.includes(choice.loser)) return state;
    byId(s, choice.loser).deck.push(...dec.cards);
  }
  s.seq++;
  return finalize(s);
}

/** Τυχαία έγκυρη απόφαση: όταν λήγει ο χρόνος ή ο παίκτης έχει φύγει. */
export function autoDecide(state: GameState): GameState {
  const d = state.decision;
  if (state.phase !== 'decision' || !d) return state;
  const tmp = { rng: state.rng };
  let choice: DecisionChoice;
  if (d.type === 'inwardOrDuel') choice = { type: 'inwardOrDuel', pick: nextRandom(tmp) < 0.5 ? 'inward' : 'duel' };
  else if (d.type === 'remainder') choice = { type: 'remainder', losers: shuffle(tmp, [...d.losers]).slice(0, d.count) };
  else choice = { type: 'chooseLoser', loser: d.losers[Math.floor(nextRandom(tmp) * d.losers.length)] };
  const next = applyDecision({ ...state, rng: tmp.rng }, d.by, choice);
  return next;
}

// ---------- συνδέσεις ----------

export function setConnected(state: GameState, playerId: string, connected: boolean): GameState {
  const p0 = state.players.find((p) => p.id === playerId);
  if (!p0 || !inPlay(p0)) return state;
  const s = clone(state);
  const p = byId(s, playerId);
  p.status = connected ? 'active' : 'disconnected';
  if (!connected && s.players[s.turn].id === playerId && s.phase === 'playing') advanceTurn(s, s.turn);
  return finalize(s);
}

export function leave(state: GameState, playerId: string): GameState {
  const p0 = state.players.find((p) => p.id === playerId);
  if (!p0 || !inPlay(p0) || state.phase === 'ended') return state;
  let s = state;
  const d = s.decision;
  if (d && (d.by === playerId || ('losers' in d && d.losers.includes(playerId)))) s = autoDecide(s);
  s = clone(s);
  const p = byId(s, playerId);
  const cards = [...p.deck, ...p.discard];
  p.deck = [];
  p.discard = [];
  if (s.config.leaverCards === 'pot') s.pot.push(...cards);
  p.status = 'left';
  s.leftOrder.push(playerId);
  if (s.lastCardInward === playerId) s.lastCardInward = null;
  s.events.push({ type: 'left', playerId });
  if (s.players[s.turn].id === playerId) advanceTurn(s, s.turn);
  s.seq++;
  return finalize(s);
}

/** Σύνολο καρτών στο παιχνίδι (για έλεγχο ότι δεν χάνονται κάρτες). */
export function totalCards(s: GameState): number {
  const dec = s.decision && 'cards' in s.decision ? s.decision.cards.length : 0;
  return s.pot.length + dec + s.players.reduce((n, p) => n + p.deck.length + p.discard.length, 0);
}
