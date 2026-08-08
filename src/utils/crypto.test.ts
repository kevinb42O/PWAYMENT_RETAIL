import { describe, expect, it } from 'vitest';
import { generateHash } from './crypto';

describe('generateHash', () => {
  it('returns a 64-char hex string', async () => {
    const h = await generateHash('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await generateHash('pwayment');
    const b = await generateHash('pwayment');
    expect(a).toBe(b);
  });

  it('changes when input changes', async () => {
    const a = await generateHash('pwayment');
    const b = await generateHash('pwaymen7');
    expect(a).not.toBe(b);
  });

  it('matches a known SHA-256 vector for the empty string', async () => {
    const h = await generateHash('');
    expect(h).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
