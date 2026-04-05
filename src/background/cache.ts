/**
 * Response cache for Claude API results.
 *
 * Key:   SHA-256 hex of the input text (profile-agnostic; per-profile
 *         prompts are prepended so same text + different profile → different hash)
 * Store: chrome.storage.local (10 MB quota, local to device)
 * TTL:   24 hours (CACHE_TTL_MS from constants)
 *
 * Cache eviction:
 *   - Entries older than TTL are removed on read (lazy eviction).
 *   - chrome.alarms-based sweep runs every 6 hours to purge stale keys
 *     (alarm is registered in background/index.ts).
 */

import { CACHE_TTL_MS } from '@/shared/constants';

const KEY_PREFIX = 'ni_cache_';
const SWEEP_ALARM = 'ni_cache_sweep';
const SWEEP_INTERVAL_MINUTES = 360; // 6 hours

interface CacheEntry {
  value: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the cached simplified text for the given input, or null on miss/expiry.
 * `profile` is mixed into the cache key so the same text can have different
 * simplifications per profile.
 */
export async function getCached(input: string, profile: string): Promise<string | null> {
  const key = await makeKey(input, profile);
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as CacheEntry | undefined;

  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return entry.value;
}

/**
 * Stores a simplified result keyed by input + profile.
 */
export async function setCached(input: string, profile: string, value: string): Promise<void> {
  const key = await makeKey(input, profile);
  const entry: CacheEntry = { value, timestamp: Date.now() };
  await chrome.storage.local.set({ [key]: entry });
}

/**
 * Register the periodic cache sweep alarm. Safe to call multiple times.
 */
export function registerSweepAlarm(): void {
  chrome.alarms.get(SWEEP_ALARM, alarm => {
    if (!alarm) {
      chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: SWEEP_INTERVAL_MINUTES });
    }
  });
}

/**
 * Remove all cache entries older than TTL.
 * Called by the alarm listener in background/index.ts.
 */
export async function sweepExpiredEntries(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const toRemove: string[] = [];

  for (const [key, raw] of Object.entries(all)) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    const entry = raw as CacheEntry;
    if (now - entry.timestamp > CACHE_TTL_MS) {
      toRemove.push(key);
    }
  }

  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function makeKey(input: string, profile: string): Promise<string> {
  const hash = await sha256(`${profile}::${input}`);
  return `${KEY_PREFIX}${hash}`;
}

async function sha256(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
