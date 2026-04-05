/**
 * chrome.storage.sync helpers.
 *
 * All user settings are stored under a single key so they consume one
 * sync write operation instead of one per property (sync quota: 512 ops/min).
 */

import type { UserSettings } from './types';
import { PROFILE_DEFAULTS } from './constants';

const STORAGE_KEY = 'ni_settings';

/** Read settings from sync storage. Returns ADHD defaults on first install. */
export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as UserSettings | undefined) ?? PROFILE_DEFAULTS['adhd'];
}

/** Persist settings to sync storage. */
export async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

/**
 * Subscribe to settings changes (triggered by saves from any device).
 * Returns an unsubscribe function.
 */
export function onSettingsChanged(callback: (settings: UserSettings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
      callback(changes[STORAGE_KEY].newValue as UserSettings);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Convenience: merge a partial patch and save. */
export async function patchSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}
