/**
 * Shared TypeScript interfaces and discriminated union types.
 *
 * These definitions are imported by content scripts, the background service
 * worker, and the popup UI — keep this file free of any runtime imports.
 */

/** The neurocognitive profile currently active for the user. */
export type Profile = 'adhd' | 'autism' | 'dyslexia' | 'custom';

/** How aggressively transformations are applied to the page. */
export type Intensity = 'light' | 'medium' | 'full';

/** Granular feature toggles stored alongside the active profile. */
export interface FeatureFlags {
  removeAds: boolean;
  removePopups: boolean;
  removeAutoplay: boolean;
  simplifyText: boolean;
  adjustFonts: boolean;
  adjustColors: boolean;
  adjustSpacing: boolean;
  showScore: boolean;
  bionicReading: boolean;
  dimUnfocused: boolean;
  stabilizeLayout: boolean;
  zenMode: boolean;
}

/** CSS overrides the user has configured when in "custom" profile mode. */
export interface CustomCSS {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  bgColor: string;
  textColor: string;
  maxWidth: string;
}

/** The full set of user preferences persisted to chrome.storage.sync. */
export interface UserSettings {
  activeProfile: Profile;
  intensity: Intensity;
  features: FeatureFlags;
  customCSS: CustomCSS;
  apiKey?: string;
  autoRun: boolean;
  cacheEnabled: boolean;
  showOriginalOnHover: boolean;
}

/** Per-dimension and overall accessibility score for the current page (0–100 each). */
export interface ScoreBreakdown {
  overall: number;
  visualComplexity: number;
  textReadability: number;
  distractionLevel: number;
  navigationClarity: number;
  sensoryLoad: number;
}

/**
 * Discriminated union of all messages exchanged between the popup,
 * content scripts, and the background service worker.
 */
export type MessageType =
  | { type: 'CLASSIFY_ELEMENTS'; payload: ElementMetadata[] }
  | { type: 'SIMPLIFY_TEXT'; payload: { chunks: string[]; profile: Profile } }
  | { type: 'CLASSIFICATION_RESULT'; payload: ElementAction[] }
  | { type: 'SIMPLIFIED_TEXT'; payload: { original: string; simplified: string }[] }
  | { type: 'SCORE_UPDATE'; payload: ScoreBreakdown }
  | { type: 'APPLY_PROFILE'; payload: UserSettings }
  | { type: 'RESET_PAGE' }
  | { type: 'ENABLE_ADHD_MODE' }
  | { type: 'DISABLE_ADHD_MODE' }
  | { type: 'ENABLE_AUTISM_MODE' }
  | { type: 'DISABLE_AUTISM_MODE' }
  | { type: 'ENABLE_DYSLEXIA_MODE' }
  | { type: 'DISABLE_DYSLEXIA_MODE' }
  | { type: 'TLDR_SUMMARIZE'; payload: { text: string; title: string } }
  | { type: 'TLDR_STREAM_CHUNK'; payload: { chunk: string } }
  | { type: 'TLDR_STREAM_DONE' }
  | { type: 'TLDR_ERROR'; payload: { error: string } }
  | { type: 'LITERAL_TRANSLATE'; payload: { text: string; title: string } }
  | { type: 'LITERAL_STREAM_CHUNK'; payload: { chunk: string } }
  | { type: 'LITERAL_STREAM_DONE' }
  | { type: 'LITERAL_ERROR'; payload: { error: string } }
  | { type: 'GET_COGNITIVE_SCORE' };

/** Serialized snapshot of a DOM element sent to the background worker for AI classification. */
export interface ElementMetadata {
  selector: string;
  tag: string;
  role: string | null;
  classes: string[];
  rect: { x: number; y: number; width: number; height: number };
  zIndex: number;
  textContent: string;
}

/** The action the Layout Simplifier Agent has decided to apply to a given element. */
export interface ElementAction {
  selector: string;
  action: 'hide' | 'collapse' | 'keep';
}
