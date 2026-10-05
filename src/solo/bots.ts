import { t } from '../i18n';
// Επίπεδα bots (αρχικές τιμές, ρυθμίζονται με δοκιμές).
export type BotLevel = 'easy' | 'medium' | 'hard' | 'impossible';

export interface BotParams {
  reaction: [number, number]; // ms
  miss: number; // πιθανότητα να χάσει ένα ταίρι
  wrong: number; // πιθανότητα λάθος αρπάγματος σε κάθε γύρισμα χωρίς ταίρι
  fingers: [number, number];
  base: [number, number];
}

export const BOT_LEVELS: Record<BotLevel, BotParams> = {
  easy: { reaction: [1900, 2750], miss: 0.35, wrong: 0.015, fingers: [1, 2], base: [0.1, 0.4] },
  medium: { reaction: [1280, 1880], miss: 0.2, wrong: 0.008, fingers: [2, 3], base: [0.3, 0.6] },
  hard: { reaction: [890, 1270], miss: 0.08, wrong: 0.003, fingers: [3, 4], base: [0.5, 0.8] },
  impossible: { reaction: [560, 780], miss: 0.02, wrong: 0, fingers: [4, 5], base: [0.8, 1] },
};

/** Επιπλέον χρόνος «ψαξίματος» ανά επιπλέον παίκτη στο τραπέζι (περισσότερες κάρτες να ελέγξει). */
export const SEARCH_MS_PER_PLAYER = 45;

export const BOT_FLIP_MS: [number, number] = [800, 1500];

export const between = (r: () => number, [a, b]: [number, number]) => a + (b - a) * r();
export const intBetween = (r: () => number, [a, b]: [number, number]) => Math.floor(a + (b - a + 1) * r());

export const levelLabel = (lv: BotLevel) => t(`level.${lv}`);
