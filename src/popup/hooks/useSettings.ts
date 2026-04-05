/**
 * React hook: reads + writes UserSettings via chrome.storage.sync.
 *
 * - Loads settings on mount (shows ADHD defaults while loading)
 * - Subscribes to cross-device sync changes
 * - On every save, messages the active tab's content script with APPLY_PROFILE
 */

import { useState, useEffect, useCallback } from 'react';
import type { UserSettings } from '@/shared/types';
import { getSettings, saveSettings, onSettingsChanged } from '@/shared/storage';
import { PROFILE_DEFAULTS } from '@/shared/constants';

interface UseSettingsReturn {
  settings: UserSettings;
  loading: boolean;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<UserSettings>(PROFILE_DEFAULTS['adhd']);
  const [loading, setLoading] = useState(true);

  // Load on mount + subscribe to external changes (cross-device sync)
  useEffect(() => {
    let mounted = true;

    getSettings().then(s => {
      if (mounted) {
        setSettings(s);
        setLoading(false);
      }
    });

    const unsubscribe = onSettingsChanged(s => {
      if (mounted) setSettings(s);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next); // optimistic update
      await saveSettings(next);
      await notifyContentScript(next);
    },
    [settings],
  );

  return { settings, loading, updateSettings };
}

// ---------------------------------------------------------------------------
// Helper: send APPLY_PROFILE to the active tab's content script
// ---------------------------------------------------------------------------

async function notifyContentScript(settings: UserSettings): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_PROFILE', payload: settings });
  } catch {
    // Content script may not be injected on this tab (e.g., chrome:// pages) — ignore
  }
}
