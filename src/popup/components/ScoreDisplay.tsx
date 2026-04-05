import type { ScoreBreakdown } from '@/shared/types';

interface Props {
  score: ScoreBreakdown | null;
}

interface DimensionDef {
  key: keyof Omit<ScoreBreakdown, 'overall'>;
  label: string;
  weight: string;
}

const DIMENSIONS: DimensionDef[] = [
  { key: 'visualComplexity',  label: 'Visual Complexity',  weight: '25%' },
  { key: 'textReadability',   label: 'Text Readability',   weight: '25%' },
  { key: 'distractionLevel',  label: 'Distraction Level',  weight: '20%' },
  { key: 'navigationClarity', label: 'Navigation Clarity', weight: '15%' },
  { key: 'sensoryLoad',       label: 'Sensory Load',       weight: '15%' },
];

function scoreColorClass(s: number): string {
  if (s >= 80) return 'text-green-600';
  if (s >= 50) return 'text-yellow-500';
  return 'text-red-500';
}

// Removed barColorClass

function scoreMessage(overall: number): string {
  if (overall >= 80) return 'This page is accessible';
  if (overall >= 50) return 'Some issues detected';
  return 'Significant barriers found';
}

export function ScoreDisplay({ score }: Props) {
  if (!score) {
    return (
      <div className="px-3 py-2 border-t border-gray-100">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          Accessibility Score
        </h2>
        <p className="text-xs text-gray-400 italic">Analysing page…</p>
      </div>
    );
  }

  const overallColor = scoreColorClass(score.overall);

  return (
    <div className="px-4">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
        Accessibility Score
      </h2>

      <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] ring-1 ring-slate-100 p-4 relative overflow-hidden">
        {/* Subtle background glow based on overall score */}
        <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none ${
          score.overall >= 80 ? 'bg-emerald-500' : score.overall >= 50 ? 'bg-amber-500' : 'bg-rose-500'
        }`} />

        {/* Overall score */}
        <div className="flex items-center gap-3 mb-4 relative z-10">
          <div className={`text-[40px] font-black tracking-tighter leading-none ${overallColor}`}>
            {score.overall}
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 leading-tight">out of 100</span>
            <span className={`text-[13px] font-bold leading-tight mt-0.5 ${overallColor}`}>
              {scoreMessage(score.overall)}
            </span>
          </div>
        </div>

        {/* Dimension bars */}
        <ul className="space-y-2.5 relative z-10">
          {DIMENSIONS.map(dim => {
            const s = score[dim.key];
            const isGood = s >= 80;
            const isOk = s >= 50;
            
            return (
              <li key={dim.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-600 tracking-tight">
                    {dim.label}
                    <span className="text-slate-400 ml-1 font-normal opacity-70">({dim.weight})</span>
                  </span>
                  <span className={`text-[11px] font-bold ${scoreColorClass(s)}`}>{s}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100/80 rounded-full overflow-hidden shrink-0 shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out shadow-sm ${
                      isGood 
                        ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' 
                        : isOk 
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500' 
                          : 'bg-gradient-to-r from-rose-400 to-rose-500'
                    }`}
                    style={{ width: `${s}%` }}
                    role="progressbar"
                    aria-valuenow={s}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={dim.label}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
