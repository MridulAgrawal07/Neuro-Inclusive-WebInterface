/**
 * Inline API key configuration widget shown in the popup.
 *
 * Displays a compact password input with show/hide toggle.
 * Shows a warning banner when text simplification (AI feature) is enabled
 * but no key has been entered.
 */

import { useState } from 'react';

interface Props {
  value: string;
  simplifyEnabled: boolean;
  onChange: (key: string) => void;
}

export function ApiKeyInput({ value, simplifyEnabled, onChange }: Props) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const missing = simplifyEnabled && !value.trim();

  return (
    <div className="px-4">
      {/* Warning banner */}
      {missing && (
        <div
          role="alert"
          className="flex items-start gap-2 bg-amber-50/80 border border-amber-200/60 rounded-xl px-3 py-2.5 mb-3 shadow-[0_2px_10px_rgba(245,158,11,0.1)]"
        >
          <span className="text-amber-500 text-[13px] leading-none mt-[1px]" aria-hidden="true">
            ⚠
          </span>
          <p className="text-[11px] text-amber-700 leading-snug tracking-tight">
            <strong className="font-bold">API key required</strong> — AI text simplification is enabled. Please set your Gemini API key below.
          </p>
        </div>
      )}

      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-controls="api-key-panel"
        className="flex items-center justify-between w-full text-left group bg-white/60 hover:bg-white px-3 py-2 rounded-xl transition-all shadow-sm ring-1 ring-slate-100"
      >
        <span
          className={[
            'text-[11px] font-bold uppercase tracking-widest leading-none flex items-center gap-1.5',
            missing ? 'text-amber-600' : 'text-slate-400',
          ].join(' ')}
        >
          {missing ? (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          ) : value.trim() ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-slate-300" />
          )}
          Gemini API Key
        </span>
        <span
          className="text-slate-300 text-[10px] uppercase font-bold group-hover:text-slate-500 transition-colors"
          aria-hidden="true"
        >
          {expanded ? 'Hide' : 'Edit'}
        </span>
      </button>

      {/* Key input panel */}
      {expanded && (
        <div id="api-key-panel" className="mt-2 bg-white rounded-xl shadow-sm ring-1 ring-slate-100 p-3 overflow-hidden">
          <div className="relative">
            <label htmlFor="popup-api-key" className="sr-only">
              Gemini API Key
            </label>
            <input
              id="popup-api-key"
              type={visible ? 'text' : 'password'}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              spellCheck={false}
              className={[
                'w-full px-3 py-2 pr-12 text-[12px] font-mono tracking-wide rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-400/50 shadow-inner transition-all',
                missing
                  ? 'border-amber-200 bg-amber-50/50 text-amber-900 focus:bg-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 focus:bg-white',
              ].join(' ')}
            />
            <button
              type="button"
              onClick={() => setVisible(v => !v)}
              aria-label={visible ? 'Hide API key' : 'Show API key'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 focus:outline-none transition-colors px-1"
            >
              {visible ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 leading-tight px-1">
            Stored locally. Get a key at{' '}
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-mono text-indigo-500 hover:text-indigo-600 hover:underline inline-block whitespace-nowrap"
            >
              aistudio.google.com
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
