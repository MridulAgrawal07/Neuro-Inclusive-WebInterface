/**
 * Token-bucket rate limiter.
 *
 * Configured to allow RATE_LIMIT_PER_MINUTE (10) API calls per minute.
 * Tokens refill continuously over time rather than in discrete batches,
 * so short bursts are allowed up to the bucket capacity.
 */

import { RATE_LIMIT_PER_MINUTE } from '@/shared/constants';

export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly maxTokens: number;
  /** Tokens generated per millisecond. */
  private readonly refillRatePerMs: number;

  constructor(maxPerMinute: number = RATE_LIMIT_PER_MINUTE) {
    this.maxTokens = maxPerMinute;
    this.tokens = maxPerMinute;
    this.lastRefillTime = Date.now();
    this.refillRatePerMs = maxPerMinute / 60_000;
  }

  /**
   * Attempt to consume one token.
   * Returns true if a token was available (request is allowed).
   * Returns false if the bucket is empty (request should be queued or rejected).
   */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Returns the number of milliseconds until one token becomes available.
   * Returns 0 if a token is available right now.
   */
  msUntilNextToken(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    const deficit = 1 - this.tokens;
    return Math.ceil(deficit / this.refillRatePerMs);
  }

  /** Current token count (for diagnostics). */
  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefillTime = now;
  }
}

// Singleton shared across all message handler invocations in the service worker
export const rateLimiter = new RateLimiter(RATE_LIMIT_PER_MINUTE);
