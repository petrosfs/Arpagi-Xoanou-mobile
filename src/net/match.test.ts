import { describe, expect, it } from 'vitest';
import { onlineGrabWindow } from './match';

describe('παράθυρο αρπάγματος online', () => {
  it('150 ms + η μεγαλύτερη καθυστέρηση μιας διαδρομής, ως 400 ms', () => {
    expect(onlineGrabWindow([])).toBe(150);
    expect(onlineGrabWindow([40, 120])).toBe(210);
    expect(onlineGrabWindow([2000])).toBe(400);
  });
});
