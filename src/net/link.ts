import {
  get, limitToLast, onChildAdded, onValue, orderByKey, push, query, ref, set, startAfter,
  type Database, type Unsubscribe,
} from 'firebase/database';

/**
 * Σύνδεση ενός παίκτη με τον host. Προτιμά WebRTC (απευθείας, γρήγορο). Αν δεν ανοίξει,
 * τα μηνύματα περνούν μέσω Firebase (πιο αργό, αλλά δουλεύει παντού).
 * caller: ο παίκτης (ξεκινά τη σύνδεση). callee: ο host (απαντά).
 */
export type LinkMode = 'connecting' | 'rtc' | 'relay' | 'closed';

const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const RTC_TIMEOUT_MS = 7000;
const ICE_GATHER_MS = 2500;
const PING_EVERY_MS = 2000;
const RETRY_RTC_MS = 15000;

const forceRelay = () => {
  try {
    return localStorage.getItem('arpagi.debug.relay') === '1';
  } catch {
    return false;
  }
};

export interface LinkPaths {
  db: Database;
  code: string;
  me: string;
  peer: string;
}

export class PeerLink {
  mode: LinkMode = 'connecting';
  /** Μετρημένος χρόνος πήγαινε-έλα (ms). */
  rtt = 0;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private unsubs: Unsubscribe[] = [];
  private timers: number[] = [];
  private nonce = '';
  private pingId = 0;
  private pings = new Map<number, number>();
  private closed = false;

  constructor(
    private p: LinkPaths,
    readonly role: 'caller' | 'callee',
    private onMessage: (msg: Record<string, unknown>) => void,
    private onMode: (mode: LinkMode) => void = () => {},
  ) {
    this.listenRelay();
    this.timers.push(window.setInterval(() => this.ping(), PING_EVERY_MS));
    if (role === 'caller') this.call();
  }

  get peer() {
    return this.p.peer;
  }

  send(msg: Record<string, unknown>) {
    if (this.closed) return;
    const text = JSON.stringify(msg);
    if (this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(text);
        return;
      } catch {
        /* πέφτουμε στο relay */
      }
    }
    push(ref(this.p.db, `rooms/${this.p.code}/relay/${this.p.me}/${this.p.peer}`), { j: text }).catch(() => {});
  }

  close() {
    this.closed = true;
    this.setMode('closed');
    this.unsubs.forEach((u) => u());
    this.timers.forEach((t) => clearInterval(t));
    this.dc?.close();
    this.pc?.close();
  }

  // ---------- εσωτερικά ----------

  private setMode(m: LinkMode) {
    if (this.mode === m) return;
    this.mode = m;
    this.onMode(m);
  }

  private receive(text: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.t === 'ping') return this.send({ t: 'pong', id: msg.id });
    if (msg.t === 'pong') {
      const sent = this.pings.get(msg.id as number);
      if (sent !== undefined) {
        this.pings.delete(msg.id as number);
        const sample = performance.now() - sent;
        this.rtt = this.rtt ? this.rtt * 0.7 + sample * 0.3 : sample;
      }
      return;
    }
    this.onMessage(msg);
  }

  private ping() {
    const id = ++this.pingId;
    this.pings.set(id, performance.now());
    if (this.pings.size > 10) this.pings.delete(this.pings.keys().next().value!);
    this.send({ t: 'ping', id });
  }

  /** Μηνύματα μέσω Firebase: μόνο όσα γράφτηκαν μετά τη σύνδεση. */
  private async listenRelay() {
    const path = ref(this.p.db, `rooms/${this.p.code}/relay/${this.p.peer}/${this.p.me}`);
    let last: string | null = null;
    try {
      const snap = await get(query(path, orderByKey(), limitToLast(1)));
      snap.forEach((c) => {
        last = c.key;
      });
    } catch {
      /* συνεχίζουμε από την αρχή */
    }
    if (this.closed) return;
    const q = last ? query(path, orderByKey(), startAfter(last)) : query(path, orderByKey());
    this.unsubs.push(
      onChildAdded(q, (c) => {
        const v = c.val() as { j?: string };
        if (v?.j) this.receive(v.j);
      }),
    );
  }

  private newPc(): RTCPeerConnection {
    this.pc?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc || this.closed) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        this.setMode('relay');
        if (this.role === 'caller') this.timers.push(window.setTimeout(() => this.call(), RETRY_RTC_MS));
      }
    };
    return pc;
  }

  private attach(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => !this.closed && this.setMode('rtc');
    dc.onclose = () => !this.closed && this.dc === dc && this.setMode('relay');
    dc.onmessage = (e) => this.receive(String(e.data));
  }

  private gathered(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const t = window.setTimeout(resolve, ICE_GATHER_MS);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          resolve();
        }
      });
    });
  }

  /** Ο παίκτης στέλνει πρόταση σύνδεσης στον host. */
  private async call() {
    if (this.closed) return;
    if (forceRelay()) return this.setMode('relay');
    const nonce = Math.random().toString(36).slice(2);
    this.nonce = nonce;
    const pc = this.newPc();
    this.attach(pc.createDataChannel('game', { ordered: true }));
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await this.gathered(pc);
      if (this.closed || nonce !== this.nonce) return;
      await set(ref(this.p.db, `rooms/${this.p.code}/signal/${this.p.peer}/${this.p.me}`), {
        offer: JSON.stringify(pc.localDescription),
        nonce,
      });
    } catch {
      return this.setMode('relay');
    }
    const answerRef = ref(this.p.db, `rooms/${this.p.code}/signal/${this.p.me}/${this.p.peer}`);
    const un = onValue(answerRef, async (snap) => {
      const v = snap.val() as { answer?: string; nonce?: string } | null;
      if (!v?.answer || v.nonce !== nonce || pc.remoteDescription) return;
      try {
        await pc.setRemoteDescription(JSON.parse(v.answer));
      } catch {
        this.setMode('relay');
      }
    });
    this.unsubs.push(un);
    this.timers.push(
      window.setTimeout(() => {
        if (this.mode !== 'rtc' && !this.closed) this.setMode('relay');
      }, RTC_TIMEOUT_MS),
    );
  }

  /** Ο host απαντά σε πρόταση σύνδεσης. */
  async answer(offer: string, nonce: string) {
    if (this.closed || nonce === this.nonce) return;
    this.nonce = nonce;
    if (forceRelay()) return this.setMode('relay');
    const pc = this.newPc();
    pc.ondatachannel = (e) => this.attach(e.channel);
    try {
      await pc.setRemoteDescription(JSON.parse(offer));
      await pc.setLocalDescription(await pc.createAnswer());
      await this.gathered(pc);
      if (this.closed || nonce !== this.nonce) return;
      await set(ref(this.p.db, `rooms/${this.p.code}/signal/${this.p.peer}/${this.p.me}`), {
        answer: JSON.stringify(pc.localDescription),
        nonce,
      });
    } catch {
      this.setMode('relay');
    }
    this.timers.push(
      window.setTimeout(() => {
        if (this.mode !== 'rtc' && !this.closed) this.setMode('relay');
      }, RTC_TIMEOUT_MS),
    );
  }
}

/** Ο host ακούει προτάσεις σύνδεσης από όλους τους παίκτες. */
export function listenOffers(
  db: Database,
  code: string,
  me: string,
  onOffer: (from: string, offer: string, nonce: string) => void,
): Unsubscribe {
  return onValue(ref(db, `rooms/${code}/signal/${me}`), (snap) => {
    snap.forEach((c) => {
      const v = c.val() as { offer?: string; nonce?: string } | null;
      if (v?.offer && v.nonce) onOffer(c.key!, v.offer, v.nonce);
    });
  });
}
