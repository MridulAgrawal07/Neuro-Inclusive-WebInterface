import { useCallback, useEffect, useState } from 'react';
import { ProfileSelector } from './components/ProfileSelector';
import { QuickActions } from './components/QuickActions';

// ---------------------------------------------------------------------------
// Toggle state — persisted in chrome.storage.local
// ---------------------------------------------------------------------------

type ProfileId = 'adhd' | 'autism' | 'dyslexia';

interface ToggleState {
  adhd: boolean;
  autism: boolean;
  dyslexia: boolean;
}

const STORAGE_KEY = 'ni-toggle-state';
const DEFAULT_STATE: ToggleState = { adhd: false, autism: false, dyslexia: false };

async function loadToggles(): Promise<ToggleState> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as ToggleState) ?? DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

async function saveToggles(state: ToggleState): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } catch {
    // storage unavailable — ignore
  }
}

async function sendMsg(type: string): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await chrome.tabs.sendMessage(tab.id, { type });
    }
  } catch {
    // Tab may not have a content script — ignore
  }
}

/**
 * Send a message to the active tab's content script and return the response.
 * Returns null if the tab has no content script or if the call fails.
 */
async function sendMsgWithResponse<T>(type: string): Promise<T | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      return (await chrome.tabs.sendMessage(tab.id, { type })) as T;
    }
  } catch {
    // Tab may not have a content script — ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cognitive score helpers
// ---------------------------------------------------------------------------

/**
 * Map a 0–100 cognitive load score to a human-readable label and Tailwind
 * colour that instantly communicates the sensory demand level to the user.
 */
function scoreAppearance(score: number): { label: string; color: string } {
  if (score <= 30) return { label: 'Calm',         color: '#4ADE80' }; // green-400
  if (score <= 70) return { label: 'Busy',         color: '#FBBF24' }; // amber-400
  return              { label: 'Overwhelming', color: '#F87171' }; // red-400
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const [toggles, setToggles] = useState<ToggleState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [cognitiveScore, setCognitiveScore] = useState<number | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  useEffect(() => {
    loadToggles().then(state => {
      setToggles(state);
      setLoading(false);
    });
  }, []);

  const handleToggle = useCallback(
    async (id: ProfileId) => {
      const turningOn = !toggles[id];
      const next = { ...toggles };

      if (id === 'adhd') {
        next.adhd = turningOn;
        await sendMsg(turningOn ? 'ENABLE_ADHD_MODE' : 'DISABLE_ADHD_MODE');
      } else if (id === 'autism') {
        if (turningOn) {
          // Autism and Dyslexia share CSS — mutually exclusive
          if (toggles.dyslexia) await sendMsg('DISABLE_DYSLEXIA_MODE');
          next.autism = true;
          next.dyslexia = false;
          await sendMsg('ENABLE_AUTISM_MODE');
        } else {
          next.autism = false;
          await sendMsg('DISABLE_AUTISM_MODE');
        }
      } else {
        if (turningOn) {
          if (toggles.autism) await sendMsg('DISABLE_AUTISM_MODE');
          next.autism = false;
          next.dyslexia = true;
          await sendMsg('ENABLE_DYSLEXIA_MODE');
        } else {
          next.dyslexia = false;
          await sendMsg('DISABLE_DYSLEXIA_MODE');
        }
      }

      setToggles(next);
      await saveToggles(next);
    },
    [toggles],
  );

  const handleReset = useCallback(async () => {
    setToggles(DEFAULT_STATE);
    await saveToggles(DEFAULT_STATE);
    await sendMsg('RESET_PAGE');
  }, []);

  const handleCognitiveScore = useCallback(async () => {
    setScoreLoading(true);
    const result = await sendMsgWithResponse<{ score: number }>('GET_COGNITIVE_SCORE');
    setCognitiveScore(result?.score ?? null);
    setScoreLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ width: 360, height: 320, backgroundColor: '#1E1E2E' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          <span className="text-sm font-medium tracking-wide" style={{ color: '#94A3B8' }}>Initializing...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ width: 360, backgroundColor: '#1E1E2E' }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <img src="/icon.png" alt="Neuro-Inclusive Logo" className="flex-shrink-0 aspect-square" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-[15px] font-bold tracking-tight" style={{ color: '#F1F5F9' }}>MindSpace</h1>
          <p style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#64748B', margin: 0 }}>Simplify Life.</p>
        </div>
      </header>

      {/* Divider */}
      <div className="mx-5 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />

      {/* Toggle rows */}
      <main className="px-5 pt-5 pb-4">
        <ProfileSelector
          adhdActive={toggles.adhd}
          autismActive={toggles.autism}
          dyslexiaActive={toggles.dyslexia}
          onToggle={handleToggle}
        />

        {/* ── Cognitive Score ──────────────────────────────────────────── */}
        <div className="mt-3">
          {/* Button — matches ProfileSelector row layout exactly */}
          <button
            onClick={handleCognitiveScore}
            disabled={scoreLoading}
            aria-label="Scan this page for cognitive load"
            className="flex items-center justify-between w-full px-5 py-3.5 rounded-2xl border shadow-sm hover:shadow-md active:scale-[0.99] transition-all duration-200 text-left"
            style={{
              backgroundColor: '#6366F1',
              borderColor: '#4338CA',
              opacity: scoreLoading ? 0.75 : 1,
              cursor: scoreLoading ? 'wait' : 'pointer',
            }}
          >
            <span
              className="text-[15px] tracking-tight leading-none"
              style={{ fontWeight: 600, color: '#F1F5F9' }}
            >
              Cognitive Score
            </span>

            {/* Right side — spinner while loading, chevron at rest */}
            {scoreLoading ? (
              <div
                className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin flex-shrink-0"
              />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5 flex-shrink-0"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v4.59L7.3 9.24a.75.75 0 0 0-1.1 1.02l3.25 3.5a.75.75 0 0 0 1.1 0l3.25-3.5a.75.75 0 1 0-1.1-1.02l-1.95 2.1V6.75Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>

          {/* Score readout — appears directly below the button, unified panel */}
          {cognitiveScore !== null && (() => {
            const { label, color } = scoreAppearance(cognitiveScore);
            return (
              <div
                className="flex items-center justify-between px-5 py-3 mt-1 rounded-2xl"
                style={{ backgroundColor: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
              >
                <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>
                  Cognitive Load
                </span>
                <div className="flex items-baseline gap-2">
                  <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
                    {cognitiveScore}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color, opacity: 0.85 }}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </main>

      {/* Reset button */}
      <div className="px-5 pb-6">
        <QuickActions onReset={handleReset} />
      </div>
    </div>
  );
}
