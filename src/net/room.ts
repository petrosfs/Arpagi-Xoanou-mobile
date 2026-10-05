import {
  get, onDisconnect, onValue, ref, remove, runTransaction, serverTimestamp, set, update,
  type DatabaseReference, type Unsubscribe,
} from 'firebase/database';
import type { MatchSetup } from '../ui/setupForm';
import { connect, type Net } from './firebase';

export const MAX_ROOM_PLAYERS = 10;
/** Χωρίς χαρακτήρες που μπερδεύονται (0/O, 1/I). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export interface RoomMeta {
  host: string;
  status: RoomStatus;
  createdAt: number;
  setup: MatchSetup;
  /** Σειρά παικτών στο τραπέζι, ορίζεται στην έναρξη. */
  order?: string[];
}

export interface RoomPlayer {
  name: string;
  joinedAt: number;
  online: boolean;
  inLobby?: boolean;
}

export interface RoomView {
  code: string;
  /** false ώσπου να έρθουν τα πρώτα δεδομένα από τη βάση. */
  loaded: boolean;
  meta: RoomMeta | null;
  players: Record<string, RoomPlayer>;
}

export type RoomError = 'not-found' | 'started' | 'full' | 'bad-code' | 'network';

export function randomCode(rnd: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return c;
}

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

/** Παίκτες με τη σειρά εισόδου. */
export function sortedPlayers(players: Record<string, RoomPlayer>): [string, RoomPlayer][] {
  return Object.entries(players).sort((a, b) => a[1].joinedAt - b[1].joinedAt || a[0].localeCompare(b[0]));
}

/** Ποιος πρέπει να γίνει host αν ο τωρινός είναι εκτός: ο πρώτος συνδεδεμένος κατά σειρά εισόδου. */
export function nextHost(view: RoomView): string | null {
  const host = view.meta?.host;
  if (!host) return null;
  if (view.players[host]?.online) return null;
  const first = sortedPlayers(view.players).find(([, p]) => p.online);
  return first ? first[0] : null;
}

export class Room {
  private unsubs: Unsubscribe[] = [];
  private presenceRef: DatabaseReference;
  view: RoomView;

  private constructor(private net: Net, readonly code: string, public onUpdate: (v: RoomView) => void) {
    this.view = { code, loaded: false, meta: null, players: {} };
    this.presenceRef = ref(net.db, `rooms/${code}/players/${net.uid}/online`);
  }

  get uid() {
    return this.net.uid;
  }

  get isHost() {
    return this.view.meta?.host === this.net.uid;
  }

  get db() {
    return this.net.db;
  }

  /** Νέο δωμάτιο με μοναδικό κωδικό. */
  static async create(name: string, setup: MatchSetup, onUpdate: (v: RoomView) => void): Promise<Room> {
    const net = await connect();
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomCode();
      const meta: RoomMeta = { host: net.uid, status: 'lobby', createdAt: Date.now(), setup };
      const res = await runTransaction(ref(net.db, `rooms/${code}/meta`), (cur) => (cur === null ? meta : undefined));
      if (res.committed) {
        const room = new Room(net, code, onUpdate);
        await room.enter(name);
        return room;
      }
    }
    throw new Error('network');
  }

  /** Είσοδος σε υπάρχον δωμάτιο (ή επανασύνδεση). */
  static async join(codeIn: string, name: string, onUpdate: (v: RoomView) => void): Promise<Room> {
    const code = normalizeCode(codeIn);
    if (!CODE_RE.test(code)) throw new Error('bad-code' satisfies RoomError);
    const net = await connect();
    const [metaSnap, playersSnap] = await Promise.all([
      get(ref(net.db, `rooms/${code}/meta`)),
      get(ref(net.db, `rooms/${code}/players`)),
    ]);
    if (!metaSnap.exists()) throw new Error('not-found' satisfies RoomError);
    const meta = metaSnap.val() as RoomMeta;
    const players = (playersSnap.val() ?? {}) as Record<string, RoomPlayer>;
    const already = !!players[net.uid];
    if (!already && meta.status !== 'lobby') throw new Error('started' satisfies RoomError);
    if (!already && Object.keys(players).length >= MAX_ROOM_PLAYERS) throw new Error('full' satisfies RoomError);
    const room = new Room(net, code, onUpdate);
    await room.enter(name, already);
    return room;
  }

  private async enter(name: string, rejoin = false) {
    const me = ref(this.net.db, `rooms/${this.code}/players/${this.net.uid}`);
    if (rejoin) await update(me, { name, online: true });
    else await set(me, { name, joinedAt: serverTimestamp(), online: true });
    // Παρουσία: αν χαθεί η σύνδεση, ο server γράφει online=false. Μόλις ξανασυνδεθούμε, true.
    this.unsubs.push(
      onValue(ref(this.net.db, '.info/connected'), (snap) => {
        if (snap.val() !== true) return;
        onDisconnect(this.presenceRef).set(false).then(() => set(this.presenceRef, true)).catch(() => {});
      }),
    );
    this.unsubs.push(
      onValue(ref(this.net.db, `rooms/${this.code}/meta`), (snap) => {
        this.view = { ...this.view, loaded: true, meta: snap.val() };
        this.changed();
      }),
    );
    this.unsubs.push(
      onValue(ref(this.net.db, `rooms/${this.code}/players`), (snap) => {
        this.view = { ...this.view, players: snap.val() ?? {} };
        this.changed();
      }),
    );
  }

  private changed() {
    // Αν ο host λείπει και είμαι ο επόμενος, αναλαμβάνω (οι κανόνες της βάσης το επιτρέπουν μόνο τότε).
    if (nextHost(this.view) === this.net.uid && this.view.meta?.status !== 'ended') {
      update(ref(this.net.db, `rooms/${this.code}/meta`), { host: this.net.uid }).catch(() => {});
    }
    this.onUpdate(this.view);
  }

  async setStatus(status: RoomStatus) {
    if (!this.isHost) return;
    await update(ref(this.net.db, `rooms/${this.code}/meta`), { status });
  }

  /** Σημάδι ότι ο παίκτης βρίσκεται στο lobby (μόνο αυτοί μπαίνουν στην επόμενη παρτίδα). */
  async setInLobby(inLobby: boolean) {
    await update(ref(this.net.db, `rooms/${this.code}/players/${this.net.uid}`), { inLobby }).catch(() => {});
  }

  async setSetup(setup: MatchSetup) {
    if (!this.isHost) return;
    await update(ref(this.net.db, `rooms/${this.code}/meta`), { setup });
  }

  /** Ο host ξεκινά: σειρά στο τραπέζι = όσοι είναι συνδεδεμένοι, με τη σειρά εισόδου. */
  async start(): Promise<string[]> {
    const order = sortedPlayers(this.view.players)
      .filter(([, p]) => p.online && p.inLobby !== false)
      .map(([id]) => id);
    await update(ref(this.net.db, `rooms/${this.code}/meta`), { status: 'playing', order });
    return order;
  }

  /** Ο host αφαιρεί παίκτη από το lobby. */
  async kick(uid: string) {
    if (!this.isHost || uid === this.net.uid) return;
    await remove(ref(this.net.db, `rooms/${this.code}/players/${uid}`));
  }

  /** Έξοδος. Στο lobby φεύγει εντελώς· σε παρτίδα μένει ως εκτός σύνδεσης. */
  async leave() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    await onDisconnect(this.presenceRef).cancel().catch(() => {});
    const me = ref(this.net.db, `rooms/${this.code}/players/${this.net.uid}`);
    const onlineOthers = sortedPlayers(this.view.players).filter(([id, p]) => p.online && id !== this.net.uid);
    if (this.view.meta?.status === 'lobby') {
      if (this.isHost && onlineOthers.length === 0) {
        await remove(ref(this.net.db, `rooms/${this.code}`)).catch(() => {});
        return;
      }
      await remove(me).catch(() => {});
    } else await set(this.presenceRef, false).catch(() => {});
  }

  close() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
