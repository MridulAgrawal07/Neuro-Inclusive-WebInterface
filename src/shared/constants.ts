/**
 * Application-wide constants and per-profile default settings.
 *
 * All thresholds and weights referenced in CLAUDE.md §4 live here so they
 * can be tuned in a single location without touching agent logic.
 */

import type { UserSettings } from './types';

/** Feature flags applied to every profile before profile-specific overrides. */
const BASE_FEATURES = {
  removeAds: false,
  removePopups: false,
  removeAutoplay: false,
  simplifyText: false,
  adjustFonts: true,
  adjustColors: false,
  adjustSpacing: false,
  showScore: false,
  bionicReading: false,
  dimUnfocused: false,
  stabilizeLayout: false,
  zenMode: false,
};

/** Baseline CSS values shared across all profiles (overridden per profile as needed). */
const BASE_CUSTOM_CSS = {
  fontFamily: 'system-ui',
  fontSize: '1rem',
  lineHeight: '1.6',
  letterSpacing: 'normal',
  bgColor: '#fefefe',
  textColor: '#1a1a1a',
  maxWidth: '680px',
};

/** Ready-to-use UserSettings for each profile, used as defaults on first install. */
export const PROFILE_DEFAULTS: Record<string, UserSettings> = {
  adhd: {
    activeProfile: 'adhd',
    intensity: 'full',
    features: { ...BASE_FEATURES },
    customCSS: { ...BASE_CUSTOM_CSS },
    apiKey: '',
    autoRun: true,
    cacheEnabled: true,
    showOriginalOnHover: false,
  },
  autism: {
    activeProfile: 'autism',
    intensity: 'full',
    features: { ...BASE_FEATURES },
    customCSS: { ...BASE_CUSTOM_CSS },
    apiKey: '',
    autoRun: true,
    cacheEnabled: true,
    showOriginalOnHover: false,
  },
  dyslexia: {
    activeProfile: 'dyslexia',
    intensity: 'full',
    features: { ...BASE_FEATURES },
    customCSS: {
      fontFamily: 'OpenDyslexic',
      fontSize: '1.15rem',
      lineHeight: '2.0',
      letterSpacing: '0.05em',
      bgColor: '#fefefe',
      textColor: '#1a1a1a',
      maxWidth: '640px',
    },
    apiKey: '',
    autoRun: true,
    cacheEnabled: true,
    showOriginalOnHover: false,
  },
  custom: {
    activeProfile: 'custom',
    intensity: 'light',
    features: { ...BASE_FEATURES },
    customCSS: { ...BASE_CUSTOM_CSS },
    apiKey: '',
    autoRun: false,
    cacheEnabled: true,
    showOriginalOnHover: false,
  },
};

/** Relative contribution of each dimension to the overall accessibility score (must sum to 1.0). */
export const SCORE_WEIGHTS = {
  visualComplexity: 0.25,
  textReadability: 0.25,
  distractionLevel: 0.20,
  navigationClarity: 0.15,
  sensoryLoad: 0.15,
} as const;

/** Heuristic score at or above which an element is definitively classified as noise. */
export const NOISE_SCORE_THRESHOLD = 0.7;

/** Heuristic score at or above which an element is sent to AI for final classification. */
export const NOISE_SCORE_BORDERLINE = 0.4;

/** Flesch-Kincaid grade level below which text is considered simple enough to skip AI rewriting. */
export const FLESCH_KINCAID_SIMPLE_THRESHOLD = 6;

/** Maximum number of tokens per text chunk sent to the AI (1 token ≈ 4 characters). */
export const MAX_CHUNK_TOKENS = 1000;

/** Maximum number of Gemini API requests permitted per minute (token-bucket limit). */
export const RATE_LIMIT_PER_MINUTE = 10;

/** Time-to-live for cached AI responses in milliseconds (24 hours). */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
