import type { MatchStats } from '../game/stats';
import { t } from '../i18n';
import { get, ref, set, type Unsubscribe } from 'firebase/database';
import type { DecisionChoice, GameState, GrabAttempt } from '../engine';
import { HostGame } from '../game/host';
import { BaseSession } from '../game/session';
import { toView, type TableView } from '../game/view';
import { PeerLink, listenOffers, type LinkMode } from './link';
import type { Room, RoomView } from './room';

/** Πόσο περιμένουμε έναν αποσυνδεδεμένο παίκτη πριν τον βγάλουμε από την παρτίδα. */
export const RECONNECT_LIMIT_MS = 180_000;
const SAVE_EVERY_MS = 250;

/** Παράθυρο αρπάγματος online: 150 ms + η μεγαλύτερη καθυστέρηση μιας διαδρομής, ως 400 ms. */
export function onlineGrabWindow(rtts: number[]): number {
  const oneWay = rtts.length ? Math.max(...rtts) / 2 : 0;
  return Math.min(400, Math.round(150 + oneWay));
}

type Msg = Record<string, unknown>;

/**
 * Online παρτίδα από τη σκοπιά αυτού του κινητού. Ως host τρέχει τη μηχανή και μοιράζει την
 * εικόνα του τραπεζιού· ως παίκτης στέλνει κινήσεις στον host. Αν αλλάξει host, αλλάζει ρόλο.
 */
export class OnlineMatch extends BaseSession {
  view: TableView;
  readonly me: string;
  private host: HostGame | null = null;
  private links = new Map<string, PeerLink>();
  private hostLink: PeerLink | null = null;
  private hostId = '';
  private unsubOffers: Unsubscribe | null = null;
  private away = new Map<string, number>();
  private saveTimer = 0;
  private lastSave = 0;
  private finished = false;
  private quitting = false;

  constructor(private room: Room, private onEnded: () => void = () => {}) {
    super();
    this.me = room.uid;
    const meta = room.view.meta!;
    this.view = emptyView(meta.order ?? [], this.me);
  }

  get symbolMap() {
    return this.room.view.meta?.setup.symbols ?? [];
  }

  name(id: string) {
    if (id === this.me) return t('you');
    return this.room.view.players[id]?.name ?? t('player');
  }

  connection() {
    if (this.host) return '';
    const m = this.hostLink?.mode;
    return m === 'relay' ? t('conn.relay') : m === 'connecting' ? t('conn.connecting') : m === 'closed' ? t('conn.closed') : '';
  }

  /** Ξεκινά (ή συνεχίζει) ανάλογα με το ποιος είναι host. */
  async start() {
    this.room.onUpdate = (v) => this.onRoom(v);
    await this.onRoom(this.room.view, true);
  }

  // ---------- ενέργειες του παίκτη ----------

  flip() {
    if (this.host) this.host.flipBy(this.me);
    else this.hostLink?.send({ t: 'flip' });
  }

  grab(a: Omit<GrabAttempt, 'playerId'>) {
    if (this.host) this.host.grabBy(this.me, a);
    else this.hostLink?.send({ t: 'grab', a, seq: this.displayedSeq });
  }

  decide(choice: DecisionChoice) {
    if (this.host) this.host.decideBy(this.me, choice);
    else this.hostLink?.send({ t: 'decide', choice });
  }

  quit() {
    if (this.quitting) return;
    this.quitting = true;
    if (this.host) {
      this.host.leave(this.me);
      this.saveNow();
    } else this.hostLink?.send({ t: 'leave' });
    setTimeout(() => this.dispose(), 300);
    this.room.leave().catch(() => {});
  }

  dispose() {
    this.host?.stop();
    this.host = null;
    this.unsubOffers?.();
    this.links.forEach((l) => l.close());
    this.links.clear();
    this.hostLink?.close();
    this.hostLink = null;
    this.away.forEach((t) => clearTimeout(t));
    this.away.clear();
    clearTimeout(this.saveTimer);
  }

  // ---------- αλλαγές στο δωμάτιο ----------

  private async onRoom(v: RoomView, first = false) {
    if (this.quitting) return;
    const meta = v.meta;
    if (!meta) return;
    if (meta.host !== this.hostId || first) {
      const prev = this.hostId;
      this.hostId = meta.host;
      if (meta.host === this.me) await this.becomeHost(prev);
      else this.becomeClient();
    }
    if (this.host) this.syncPresence(v);
  }

  // ---------- ρόλος host ----------

  private async becomeHost(prevHost: string) {
    this.hostLink?.close();
    this.hostLink = null;
    const meta = this.room.view.meta!;
    let resume: { state: GameState; reactions: Record<string, number[]>; stats?: MatchStats } | undefined;
    if (prevHost && prevHost !== this.me) {
      // Συνέχεια από την τελευταία αποθηκευμένη κατάσταση του προηγούμενου host.
      try {
        const snap = await get(ref(this.room.db, `rooms/${this.room.code}/state`));
        const v = snap.val() as { j?: string } | null;
        if (v?.j) resume = JSON.parse(v.j);
      } catch {
        /* χωρίς κατάσταση: νέα παρτίδα δεν ξεκινάμε, περιμένουμε */
      }
      if (!resume) return;
    }
    const host = new HostGame(
      {
        ids: meta.order ?? [],
        bots: {},
        turnTimerS: meta.setup.turnTimerS,
        symbols: meta.setup.symbols,
        config: meta.setup.config,
        grabWindowMs: () => onlineGrabWindow([...this.links.values()].filter((l) => l.mode !== 'closed').map((l) => l.rtt)),
        resume,
      },
      () => this.onHostChange(),
    );
    this.host = host;
    this.unsubOffers?.();
    this.unsubOffers = listenOffers(this.room.db, this.room.code, this.me, (from, offer, nonce) => {
      if (!(meta.order ?? []).includes(from) || from === this.me) return;
      this.linkTo(from).answer(offer, nonce);
    });
    for (const id of meta.order ?? []) if (id !== this.me) this.linkTo(id);
    host.start();
    if (prevHost && prevHost !== this.me) this.syncPresence(this.room.view);
  }

  private linkTo(id: string): PeerLink {
    let l = this.links.get(id);
    if (!l) {
      l = new PeerLink(
        { db: this.room.db, code: this.room.code, me: this.me, peer: id },
        'callee',
        (msg) => this.fromPlayer(id, msg),
        (mode) => mode === 'rtc' || mode === 'relay' ? this.sendView(id) : undefined,
      );
      this.links.set(id, l);
    }
    return l;
  }

  private fromPlayer(id: string, msg: Msg) {
    const h = this.host;
    if (!h) return;
    switch (msg.t) {
      case 'hello':
        return this.sendView(id);
      case 'flip':
        return h.flipBy(id);
      case 'grab':
        return h.grabBy(id, msg.a as Omit<GrabAttempt, 'playerId'>, msg.seq as number);
      case 'decide':
        return h.decideBy(id, msg.choice as DecisionChoice);
      case 'leave':
        return h.leave(id);
    }
  }

  private sendView(id: string) {
    if (this.host) this.links.get(id)?.send({ t: 'view', v: this.host.view() });
  }

  private onHostChange() {
    const h = this.host;
    if (!h) return;
    const v = h.view();
    this.publish(v);
    for (const id of this.links.keys()) this.links.get(id)!.send({ t: 'view', v });
    this.scheduleSave();
    if (v.phase === 'ended' && !this.finished) {
      this.finished = true;
      this.saveNow();
      this.room.setStatus('ended').catch(() => {});
      this.onEnded();
    }
  }

  /** Αποθήκευση για αλλαγή host (ως κείμενο: το Firebase χάνει τους άδειους πίνακες). */
  private scheduleSave() {
    if (this.saveTimer) return;
    const wait = Math.max(0, SAVE_EVERY_MS - (performance.now() - this.lastSave));
    this.saveTimer = window.setTimeout(() => this.saveNow(), wait);
  }

  private saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (!this.host) return;
    this.lastSave = performance.now();
    const j = JSON.stringify({ state: this.host.state, reactions: this.host.reactions, stats: this.host.stats.data });
    set(ref(this.room.db, `rooms/${this.room.code}/state`), { j }).catch(() => {});
  }

  /** Παρουσία από το Firebase: αποσύνδεση, επανασύνδεση, όριο 180 δευτ. */
  private syncPresence(v: RoomView) {
    const h = this.host;
    if (!h) return;
    for (const p of h.state.players) {
      if (p.id === this.me || p.status === 'left' || p.status === 'finished') continue;
      const online = v.players[p.id]?.online === true;
      if (!online && p.status === 'active') {
        h.setConnected(p.id, false);
        if (!this.away.has(p.id))
          this.away.set(
            p.id,
            window.setTimeout(() => {
              this.away.delete(p.id);
              this.host?.leave(p.id);
            }, RECONNECT_LIMIT_MS),
          );
      } else if (online && p.status === 'disconnected') {
        clearTimeout(this.away.get(p.id));
        this.away.delete(p.id);
        h.setConnected(p.id, true);
      }
    }
  }

  // ---------- ρόλος παίκτη ----------

  private becomeClient() {
    if (this.host) {
      // Κάποιος άλλος ανέλαβε (π.χ. χάσαμε για λίγο τη σύνδεση): σταματάμε να είμαστε host.
      this.host.stop();
      this.host = null;
      this.unsubOffers?.();
      this.links.forEach((l) => l.close());
      this.links.clear();
    }
    this.hostLink?.close();
    const link = new PeerLink(
      { db: this.room.db, code: this.room.code, me: this.me, peer: this.hostId },
      'caller',
      (msg) => this.fromHost(msg),
      (mode: LinkMode) => {
        // Η σύνδεση μπορεί να ανοίξει αμέσως (relay), πριν ολοκληρωθεί η δημιουργία της.
        if (mode === 'rtc' || mode === 'relay') queueMicrotask(() => this.hostLink?.send({ t: 'hello' }));
      },
    );
    this.hostLink = link;
  }

  private fromHost(msg: Msg) {
    if (msg.t !== 'view') return;
    const v = msg.v as TableView;
    if (v.seq < this.view.seq && v.phase === this.view.phase) return; // παλιό μήνυμα
    this.publish(v);
    if (v.phase === 'ended' && !this.finished) {
      this.finished = true;
      this.onEnded();
    }
  }
}

function emptyView(order: string[], me: string): TableView {
  const players = (order.length ? order : [me]).map((id) => ({
    id,
    status: 'active' as const,
    deckCount: 0,
    discardCount: 0,
    top: null,
    stats: { duelsWon: 0, duelsLost: 0, wrongGrabs: 0, drops: 0 },
  }));
  return {
    seq: -1, phase: 'playing', turnId: players[0].id, matchMode: 'symbol', inwardActive: false, pendingAllFlip: false,
    potCount: 0, players, decision: null, events: [], ranking: [], held: true, heldBy: null,
    turnLeftMs: 0, decisionLeftMs: 0, allFlipLeftMs: 0, reactions: {}, stats: null,
  };
}

export { toView };
