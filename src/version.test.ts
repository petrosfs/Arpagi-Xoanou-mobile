import { describe, expect, it } from 'vitest';
import { APP_VERSION, PHASE } from './version';

describe('version', () => {
  it('έχει έγκυρη μορφή έκδοσης', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PHASE).toBeGreaterThanOrEqual(1);
  });
});
