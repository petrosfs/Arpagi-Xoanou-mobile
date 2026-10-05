import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, CODE_RE, nextHost, normalizeCode, randomCode, sortedPlayers, type RoomView } from './room';

describe('κωδικός δωματίου', () => {
  it('4 χαρακτήρες χωρίς 0/O/1/I', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OI]/);
    for (let i = 0; i < 500; i++) expect(randomCode()).toMatch(CODE_RE);
  });
  it('κανονικοποίηση από ό,τι πληκτρολογεί ο χρήστης', () => {
    expect(normalizeCode(' k7-xr ')).toBe('K7XR');
    expect(normalizeCode('abcdefg')).toBe('ABCD');
    expect(CODE_RE.test('K0XR')).toBe(false);
  });
});

describe('αλλαγή host', () => {
  const view = (host: string, players: Record<string, [number, boolean]>): RoomView => ({
    code: 'ABCD',
    loaded: true,
    meta: { host, status: 'lobby', createdAt: 0, setup: undefined as never },
    players: Object.fromEntries(Object.entries(players).map(([id, [t, on]]) => [id, { name: id, joinedAt: t, online: on }])),
  });
  it('κανείς δεν αναλαμβάνει όσο ο host είναι συνδεδεμένος', () => {
    expect(nextHost(view('a', { a: [1, true], b: [2, true] }))).toBeNull();
  });
  it('αναλαμβάνει ο πρώτος συνδεδεμένος κατά σειρά εισόδου', () => {
    expect(nextHost(view('a', { a: [1, false], b: [3, true], c: [2, true] }))).toBe('c');
    expect(nextHost(view('a', { b: [3, true], c: [2, false] }))).toBe('b'); // ο host έφυγε εντελώς
  });
  it('σειρά παικτών κατά χρόνο εισόδου', () => {
    expect(sortedPlayers(view('a', { x: [5, true], y: [1, true], z: [3, false] }).players).map(([id]) => id)).toEqual(['y', 'z', 'x']);
  });
});
