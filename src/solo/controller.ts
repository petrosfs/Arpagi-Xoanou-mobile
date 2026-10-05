import type { DecisionChoice, GameConfig, GameState, GrabAttempt } from '../engine';
import { HostGame } from '../game/host';
import type { BotLevel } from './bots';

export {
  ALL_FLIP_DELAY_MS, BOT_DECISION_MS, GRAB_WINDOW_MS, TOTEM_HOLD_MS, TOTEM_RETURN_MS,
} from '../game/host';

export const HUMAN = 'you';

export interface SoloOptions {
  bots: BotLevel[];
  config: Partial<GameConfig>;
  turnTimerS: number;
  /** Δείκτες στον κατάλογο συμβόλων, με τη σειρά που τα χρησιμοποιεί η μηχανή. */
  symbols: number[];
  seed?: number;
}

/** Solo: ο host τρέχει τοπικά, με έναν άνθρωπο («you») και bots. */
export class SoloGame extends HostGame {
  constructor(opts: SoloOptions, onChange: (s: GameState) => void) {
    const bots = Object.fromEntries(opts.bots.map((lv, i) => [`bot${i + 1}`, lv]));
    super(
      { ids: [HUMAN, ...Object.keys(bots)], bots, turnTimerS: opts.turnTimerS, symbols: opts.symbols, config: opts.config, seed: opts.seed },
      onChange,
    );
  }


  humanFlip() {
    this.flipBy(HUMAN);
  }

  humanGrab(a: Omit<GrabAttempt, 'playerId'>) {
    this.grabBy(HUMAN, a);
  }

  humanDecide(choice: DecisionChoice) {
    this.decideBy(HUMAN, choice);
  }
}
