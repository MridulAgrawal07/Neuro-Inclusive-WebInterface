import type { FeatureFlags, Profile } from '@/shared/types';

interface Props {
  features: FeatureFlags;
  profile: Profile;
  onChange: (features: FeatureFlags) => void;
}

interface ToggleDef {
  key: keyof FeatureFlags;
  label: string;
  profiles?: Profile[]; // undefined = show for all profiles
}

const TOGGLES: ToggleDef[] = [
  { key: 'removeAds', label: 'Remove ads & banners' },
  { key: 'removePopups', label: 'Remove popups & modals' },
  { key: 'removeAutoplay', label: 'Pause auto-play media' },
  { key: 'simplifyText', label: 'Simplify text (AI)' },
  { key: 'adjustFonts', label: 'Adjust fonts' },
  { key: 'adjustColors', label: 'Adjust colors' },
  { key: 'adjustSpacing', label: 'Adjust spacing' },
  { key: 'showScore', label: 'Show accessibility score' },
  { key: 'bionicReading', label: 'Bionic reading', profiles: ['dyslexia', 'custom'] },
  { key: 'dimUnfocused', label: 'Dim unfocused content', profiles: ['adhd', 'custom'] },
  { key: 'zenMode', label: 'Zen mode (Extract content)', profiles: ['adhd', 'custom'] },
  { key: 'stabilizeLayout', label: 'Stabilize layout', profiles: ['autism', 'custom'] },
];

export function FeatureToggles({ features, profile, onChange }: Props) {
  const visible = TOGGLES.filter(
    t => !t.profiles || t.profiles.includes(profile),
  );

  function toggle(key: keyof FeatureFlags) {
    onChange({ ...features, [key]: !features[key] });
  }

  return (
    <div className="px-4">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
        Features
      </h2>
      <ul className="bg-white rounded-xl shadow-sm ring-1 ring-slate-100 overflow-hidden text-[13px] font-medium text-slate-700">
        {visible.map(({ key, label }, idx) => (
          <li key={key} className={`flex items-center justify-between px-3 py-2.5 ${idx < visible.length - 1 ? 'border-b border-slate-50' : ''} hover:bg-slate-50/50 transition-colors`}>
            <span className="tracking-tight leading-none">{label}</span>
            <button
              role="switch"
              aria-checked={features[key]}
              onClick={() => toggle(key)}
              className={[
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none outline-none',
                features[key] ? 'bg-indigo-500 shadow-inner' : 'bg-slate-200 shadow-inner',
              ].join(' ')}
            >
              <span className="sr-only">Toggle {label}</span>
              <span
                className={[
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] ring-1 ring-black/5 transition duration-300 ease-in-out',
                  features[key] ? 'translate-x-[18px]' : 'translate-x-[2px]',
                ].join(' ')}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
