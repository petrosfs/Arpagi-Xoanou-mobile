// Αναγνώριση κίνησης γυρίσματος: συνεχόμενο σύρσιμο πάνω και μετά κάτω, ή απλό πάτημα.
export const SWIPE_PX = 40;
export const TAP_MAX_MS = 300;
export const TAP_MAX_MOVE = 12;

export type GestureMode = 'swipe' | 'tap';

export class FlipGesture {
  private startY = 0;
  private startX = 0;
  private startT = 0;
  private minY = 0;
  private wentUp = false;
  private active = false;
  private fired = false;

  constructor(private mode: GestureMode) {}

  setMode(mode: GestureMode) {
    this.mode = mode;
  }

  down(x: number, y: number, t: number) {
    this.active = true;
    this.fired = false;
    this.wentUp = false;
    this.startX = x;
    this.startY = y;
    this.minY = y;
    this.startT = t;
  }

  /** true τη στιγμή που ολοκληρώνεται η κίνηση πάνω-κάτω. */
  move(_x: number, y: number): boolean {
    if (!this.active || this.fired || this.mode !== 'swipe') return false;
    if (y < this.minY) this.minY = y;
    if (!this.wentUp && this.startY - this.minY >= SWIPE_PX) this.wentUp = true;
    if (this.wentUp && y - this.minY >= SWIPE_PX) {
      this.fired = true;
      return true;
    }
    return false;
  }

  /** true αν το άφημα του δαχτύλου ολοκληρώνει πάτημα (λειτουργία tap). */
  up(x: number, y: number, t: number): boolean {
    if (!this.active) return false;
    this.active = false;
    if (this.mode !== 'tap' || this.fired) return false;
    const moved = Math.hypot(x - this.startX, y - this.startY);
    return t - this.startT <= TAP_MAX_MS && moved <= TAP_MAX_MOVE;
  }

  cancel() {
    this.active = false;
  }
}
