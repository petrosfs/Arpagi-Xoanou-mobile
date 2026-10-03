// Επίπεδα bots (αρχικές τιμές, ρυθμίζονται με δοκιμές).
export type BotLevel = 'easy' | 'medium' | 'hard' | 'impossible';

export interface BotParams {
  label: string;
  reaction: [number, number]; // ms
  miss: number; // πιθανότητα να χάσει ένα ταίρι
  wrong: number; // πιθανότητα λάθος αρπάγματος σε κάθε γύρισμα χωρίς ταίρι
  fingers: [number, number];
  base: [number, number];
}

export const BOT_LEVELS: Record<BotLevel, BotParams> = {
  easy: { label: 'Εύκολο', reaction: [900, 1400], miss: 0.3, wrong: 0.05, fingers: [1, 2], base: [0.1, 0.4] },
  medium: { label: 'Μέτριο', reaction: [600, 900], miss: 0.15, wrong: 0.03, fingers: [2, 3], base: [0.3, 0.6] },
  hard: { label: 'Δύσκολο', reaction: [400, 600], miss: 0.05, wrong: 0.01, fingers: [3, 4], base: [0.5, 0.8] },
  impossible: { label: 'Αδύνατο', reaction: [250, 350], miss: 0, wrong: 0, fingers: [4, 5], base: [0.8, 1] },
};

export const BOT_FLIP_MS: [number, number] = [800, 1500];

export const between = (r: () => number, [a, b]: [number, number]) => a + (b - a) * r();
export const intBetween = (r: () => number, [a, b]: [number, number]) => Math.floor(a + (b - a + 1) * r());
