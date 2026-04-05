/**
 * Onboarding page — shown once on first install.
 *
 * Steps:
 *   1. Choose your primary profile (ADHD / Autism / Dyslexia / Custom)
 *   2. Done — profile saved, ready to use
 *
 * Writes the chosen profile to chrome.storage.sync so the popup
 * and content scripts pick it up immediately.
 */

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { saveSettings } from '@/shared/storage';
import { PROFILE_DEFAULTS } from '@/shared/constants';
import type { Profile } from '@/shared/types';

import './onboarding.css';

// ---------------------------------------------------------------------------
// Profile cards definition
// ---------------------------------------------------------------------------

interface ProfileCard {
  id: Profile;
  label: string;
  emoji: string;
  description: string;
  color: string;
  activeColor: string;
}

const PROFILES: ProfileCard[] = [
  {
    id: 'adhd',
    label: 'ADHD',
    emoji: '⚡',
    description: 'Clean sans-serif font optimized for focus and readability.',
    color: 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:shadow-md',
    activeColor: 'bg-indigo-50/60 border-indigo-500 text-indigo-900 shadow-lg shadow-indigo-500/10 scale-[1.01]',
  },
  {
    id: 'autism',
    label: 'Autism',
    emoji: '🧩',
    description: 'Predictable, consistent sans-serif font for comfortable reading.',
    color: 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:shadow-md',
    activeColor: 'bg-emerald-50/60 border-emerald-500 text-emerald-900 shadow-lg shadow-emerald-500/10 scale-[1.01]',
  },
  {
    id: 'dyslexia',
    label: 'Dyslexia',
    emoji: '📖',
    description: 'OpenDyslexic font designed to improve letter recognition.',
    color: 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:shadow-md',
    activeColor: 'bg-amber-50/60 border-amber-500 text-amber-900 shadow-lg shadow-amber-500/10 scale-[1.01]',
  },
  {
    id: 'custom',
    label: 'Custom',
    emoji: '🎛️',
    description: 'Choose your own font and fine-tune settings yourself.',
    color: 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:shadow-md',
    activeColor: 'bg-slate-50 border-slate-500 text-slate-900 shadow-lg shadow-slate-500/10 scale-[1.01]',
  },
];

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Step = 'profile' | 'done';

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

function Onboarding() {
  const [step, setStep] = useState<Step>('profile');
  const [profile, setProfile] = useState<Profile>('adhd');
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    setSaving(true);
    const defaults = PROFILE_DEFAULTS[profile];
    await saveSettings({ ...defaults, activeProfile: profile });
    setSaving(false);
    setStep('done');
  }

  return (
    <div className="min-h-screen bg-slate-50 relative font-sans text-slate-900 selection:bg-indigo-100">

      {/* Ambient Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-300/20 blur-[100px] opacity-70" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] rounded-full bg-purple-300/20 blur-[100px] opacity-70" />
      </div>

      {/* Main scrolling container */}
      <div className="relative z-10 w-full min-h-screen flex flex-col items-center py-6 px-4 sm:py-12">
        <main className="w-full max-w-3xl bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col overflow-hidden">

          <div className="px-6 py-10 sm:px-12 sm:py-12">
            {/* Logo + heading */}
            <header className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 mb-5">
                <span className="text-white text-2xl font-black tracking-tighter">NI</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Welcome to Neuro-Inclusive
              </h1>
              <p className="mt-3 text-slate-500 text-[15px] sm:text-base font-medium">
                Choose your profile and we'll adjust page fonts for you.
              </p>
            </header>

            {/* Step: choose profile */}
            {step === 'profile' && (
              <section aria-label="Choose your profile" className="animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none">
                <h2 className="text-[17px] font-bold text-slate-800 mb-5 text-center tracking-tight">
                  What best describes you?
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2">
                  {PROFILES.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setProfile(p.id)}
                      aria-pressed={profile === p.id}
                      className={[
                        'text-left p-5 flex flex-col rounded-2xl border-2 transition-all duration-300 ease-out outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30',
                        profile === p.id ? p.activeColor : p.color,
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className="text-3xl leading-none">{p.emoji}</div>
                        <div className="font-bold text-lg tracking-tight leading-none">{p.label}</div>
                      </div>
                      <div className={["text-sm leading-relaxed", profile === p.id ? "opacity-100 font-medium" : "opacity-80"].join(' ')}>
                        {p.description}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Done */}
            {step === 'done' && (
              <section className="text-center animate-in zoom-in-95 duration-500 outline-none" aria-label="Setup complete">
                <div className="text-[64px] mb-6 leading-none animate-bounce">🎉</div>
                <h2 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">You're all set!</h2>
                <p className="text-slate-500 text-[15px] mb-8 max-w-sm mx-auto leading-relaxed">
                  Navigate to any webpage and the font will automatically adjust based on your profile.
                </p>
              </section>
            )}
          </div>

          {/* Footer with action button */}
          <div className="bg-slate-50/50 backdrop-blur-md border-t border-slate-100 p-6 sm:px-12 sm:py-6 mt-auto">
            {step === 'profile' && (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="w-full sm:max-w-xs mx-auto block py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-[15px] shadow-lg shadow-indigo-500/20 disabled:opacity-60 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30"
              >
                {saving ? 'Saving...' : `Get Started with ${PROFILES.find(p => p.id === profile)?.label}`}
              </button>
            )}

            {step === 'done' && (
              <button
                onClick={() => window.close()}
                className="w-full sm:max-w-xs mx-auto block py-3.5 rounded-xl bg-slate-900 text-white font-bold text-[15px] shadow-md hover:shadow-lg hover:bg-slate-800 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 focus:outline-none"
              >
                Close this tab
              </button>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <Onboarding />
  </StrictMode>,
);
