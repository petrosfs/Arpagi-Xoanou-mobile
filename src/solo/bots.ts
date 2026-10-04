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
  easy: { label: 'Εύκολο', reaction: [1700, 2500], miss: 0.35, wrong: 0.015, fingers: [1, 2], base: [0.1, 0.4] },
  medium: { label: 'Μέτριο', reaction: [1150, 1700], miss: 0.2, wrong: 0.008, fingers: [2, 3], base: [0.3, 0.6] },
  hard: { label: 'Δύσκολο', reaction: [800, 1150], miss: 0.08, wrong: 0.003, fingers: [3, 4], base: [0.5, 0.8] },
  impossible: { label: 'Αδύνατο', reaction: [500, 700], miss: 0.02, wrong: 0, fingers: [4, 5], base: [0.8, 1] },
};

/** Επιπλέον χρόνος «ψαξίματος» ανά επιπλέον παίκτη στο τραπέζι (περισσότερες κάρτες να ελέγξει). */
export const SEARCH_MS_PER_PLAYER = 45;

export const BOT_FLIP_MS: [number, number] = [800, 1500];

export const between = (r: () => number, [a, b]: [number, number]) => a + (b - a) * r();
export const intBetween = (r: () => number, [a, b]: [number, number]) => Math.floor(a + (b - a + 1) * r());
