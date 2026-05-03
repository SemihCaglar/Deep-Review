'use client';

interface Props {
  workloadPct: number;
  openRounds: number;
  activeReviews: number;
  draftRounds: number;
  completedLastMonth: number;
}

export default function WorkloadBar({ workloadPct, openRounds, activeReviews, draftRounds, completedLastMonth }: Props) {
  const barColor =
    workloadPct <= 30
      ? 'bg-emerald-500'
      : workloadPct <= 60
      ? 'bg-amber-400'
      : 'bg-red-500';

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
        <span>Workload</span>
        <span>{workloadPct}%</span>
      </div>
      <div className="relative group">
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${workloadPct}%` }}
          />
        </div>
        {/* Hover tooltip */}
        <div className="pointer-events-none absolute bottom-full left-0 mb-2 invisible group-hover:visible z-10 w-52 rounded-lg border border-white/10 bg-slate-800 p-2.5 shadow-lg">
          <div className="space-y-1 text-xs text-slate-300">
            <div className="flex justify-between gap-2">
              <span>Open author rounds</span>
              <span className="font-medium text-white">{openRounds}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Active reviews</span>
              <span className="font-medium text-white">{activeReviews}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Draft author rounds</span>
              <span className="font-medium text-white">{draftRounds}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Completed last month</span>
              <span className="font-medium text-white">{completedLastMonth}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
