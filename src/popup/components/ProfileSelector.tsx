/**
 * ProfileSelector — renders the three profile toggle rows in the popup.
 *
 * Each row is a pressable button that visually communicates its state via
 * background color (green = active, red = inactive) and an iOS-style toggle
 * dot on the right. Autism and Dyslexia are mutually exclusive — that
 * constraint is enforced by the parent App component, not here.
 */

type ProfileId = 'adhd' | 'autism' | 'dyslexia';

/** Data describing a single toggle row in the profile selector. */
interface ToggleRow {
  id: ProfileId;
  label: string;
}

const PROFILES: ToggleRow[] = [
  { id: 'adhd',     label: 'ADHD'     },
  { id: 'autism',   label: 'Autism'   },
  { id: 'dyslexia', label: 'Dyslexia' },
];

/** Props accepted by the ProfileSelector component. */
interface Props {
  adhdActive: boolean;
  autismActive: boolean;
  dyslexiaActive: boolean;
  /** Callback invoked with the profile id whenever a row is clicked. */
  onToggle: (id: ProfileId) => void;
}

export function ProfileSelector({ adhdActive, autismActive, dyslexiaActive, onToggle }: Props) {
  const states: Record<ProfileId, boolean> = {
    adhd: adhdActive,
    autism: autismActive,
    dyslexia: dyslexiaActive,
  };

  return (
    <div className="flex flex-col gap-3">
      {PROFILES.map(p => {
        const isActive = states[p.id];
        return (
          <button
            key={p.id}
            onClick={() => onToggle(p.id)}
            aria-pressed={isActive}
            className="flex items-center justify-between w-full px-5 py-3.5 rounded-2xl border shadow-sm hover:shadow-md active:scale-[0.99] transition-all duration-200 text-left"
            style={{
              backgroundColor: isActive ? '#4ADE80' : '#F87171',
              borderColor: isActive ? '#16A34A' : '#DC2626',
            }}
          >
            <span
              className="text-[15px] tracking-tight leading-none"
              style={{
                fontWeight: p.id === 'adhd' ? 900 : 600,
                color: '#F1F5F9',
                fontFamily: p.id === 'dyslexia' ? 'OpenDyslexic, sans-serif' : undefined,
              }}
            >
              {p.label}
            </span>

            {/* iOS-style toggle — white track, card color carries the state */}
            <div
              className="relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-300 ease-in-out"
              style={{
                backgroundColor: isActive ? '#166534' : '#B91C1C',
                border: '1.5px solid rgba(0,0,0,0.15)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
              }}
            >
              <div
                className="absolute top-[2px] w-5 h-5 bg-white rounded-full transition-transform duration-300 ease-in-out"
                style={{
                  transform: isActive ? 'translateX(24px)' : 'translateX(2px)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.22)',
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
