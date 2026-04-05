/**
 * Visual Adjuster Agent — Simplified (font-only).
 *
 * Reads the active profile and sets the appropriate font-family
 * via a CSS custom property on :root. Nothing else.
 */

import type { UserSettings, Profile } from '@/shared/types';
import { setCSSProperties, removeCSSProperty } from '../mutator/style-injector';

// ---------------------------------------------------------------------------
// Font map per profile
// ---------------------------------------------------------------------------

const PROFILE_FONT: Record<Profile, string> = {
  adhd: 'system-ui, -apple-system, sans-serif',
  autism: 'system-ui, -apple-system, sans-serif',
  dyslexia: 'OpenDyslexic, Arial, sans-serif',
  custom: 'system-ui, -apple-system, sans-serif',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Apply the font for the selected profile. */
export function applyVisualProfile(settings: UserSettings): void {
  const { activeProfile, customCSS } = settings;

  // Remove previous profile classes, add current
  document.body.classList.remove('ni-active', 'ni-adhd', 'ni-autism', 'ni-dyslexia', 'ni-custom');
  document.body.classList.add('ni-active', `ni-${activeProfile}`);

  // Determine font
  const font =
    activeProfile === 'custom'
      ? customCSS.fontFamily || PROFILE_FONT.custom
      : PROFILE_FONT[activeProfile];

  setCSSProperties({ '--ni-font-family': font });
}

/** Remove all visual adjustments and restore the original page appearance. */
export function resetVisualProfile(): void {
  document.body.classList.remove('ni-active', 'ni-adhd', 'ni-autism', 'ni-dyslexia', 'ni-custom');
  removeCSSProperty('--ni-font-family');
}
