import type { Intensity } from '@/shared/types';

interface Props {
  value: Intensity;
  onChange: (value: Intensity) => void;
}

const LEVELS: { id: Intensity; label: string; description: string }[] = [
  { id: 'light', label: 'Light', description: 'Typography only' },
  { id: 'medium', label: 'Medium', description: 'Colors + layout' },
  { id: 'full', label: 'Full', description: 'All behaviors' },
];

export function IntensitySlider({ value, onChange }: Props) {
  return (
    <div className="px-4">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
        Intensity
      </h2>
      <div className="flex gap-1 p-1 bg-slate-200/50 rounded-xl relative">
        {LEVELS.map(level => {
          const isActive = value === level.id;
          return (
            <button
              key={level.id}
              onClick={() => onChange(level.id)}
              aria-pressed={isActive}
              className={[
                'relative flex-1 flex flex-col items-center py-2 rounded-lg text-center transition-all duration-300 ease-out z-10 outline-none',
                isActive
                  ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-indigo-600 ring-1 ring-black/5 scale-[1.02]'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50',
              ].join(' ')}
            >
              <span className="font-bold text-[12px]">{level.label}</span>
              <span className={['text-[10px] mt-0.5 leading-tight tracking-tight', isActive ? 'opacity-90' : 'opacity-60'].join(' ')}>
                {level.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
