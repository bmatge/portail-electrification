import { describe, it, expect } from 'vitest';
import { SHARED_VERSION } from './index.js';

describe('@latelier/shared', () => {
  it('exporte la version du package', () => {
    expect(SHARED_VERSION).toBe('0.0.0');
  });
});
