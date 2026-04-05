import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '@/background/rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with a full bucket', () => {
    const limiter = new RateLimiter(5);
    expect(limiter.available).toBe(5);
  });

  it('allows requests up to the bucket capacity', () => {
    const limiter = new RateLimiter(3);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false); // 4th must be rejected
  });

  it('refills tokens over time', () => {
    const limiter = new RateLimiter(2);
    limiter.tryConsume();
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);

    // Advance 1 full minute → 2 tokens should be available
    vi.advanceTimersByTime(60_000);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it('does not exceed maxTokens on refill', () => {
    const limiter = new RateLimiter(3);
    // Advance 10 minutes — bucket should not overflow past 3
    vi.advanceTimersByTime(10 * 60_000);
    expect(limiter.available).toBe(3);
  });

  it('msUntilNextToken returns 0 when tokens are available', () => {
    const limiter = new RateLimiter(5);
    expect(limiter.msUntilNextToken()).toBe(0);
  });

  it('msUntilNextToken returns a positive value when empty', () => {
    const limiter = new RateLimiter(1);
    limiter.tryConsume();
    expect(limiter.msUntilNextToken()).toBeGreaterThan(0);
  });

  it('msUntilNextToken decreases as time passes', () => {
    const limiter = new RateLimiter(1);
    limiter.tryConsume();

    const wait1 = limiter.msUntilNextToken();
    vi.advanceTimersByTime(10_000);
    const wait2 = limiter.msUntilNextToken();

    expect(wait2).toBeLessThan(wait1);
  });
});
