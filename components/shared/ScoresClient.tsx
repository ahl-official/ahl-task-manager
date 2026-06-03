'use client';

import { cn } from '@/lib/utils';
import { Trophy, TrendingUp, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface Props {
  scores: any[];
  showAll?: boolean;
}

export default function ScoresClient({ scores, showAll }: Props) {
  const sorted = [...scores].sort((a, b) => b.monthlyScore - a.monthlyScore);

  function getScoreColor(score: number): string {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  }

  function getScoreBg(score: number): string {
    if (score >= 90) return 'bg-green-50 border-green-200';
    if (score >= 70) return 'bg-blue-50 border-blue-200';
    if (score >= 50) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 && (
        <div className="card p-10 text-center text-gray-400">No scores yet</div>
      )}

      {sorted.map((score, index) => (
        <div key={score.uid} className={cn('card p-4 border', getScoreBg(score.monthlyScore))}>
          <div className="flex items-center gap-4">
            {/* Rank */}
            <div className="w-8 text-center">
              {index === 0 && <Trophy size={20} className="text-yellow-500 mx-auto" />}
              {index === 1 && <Trophy size={20} className="text-gray-400 mx-auto" />}
              {index === 2 && <Trophy size={20} className="text-orange-400 mx-auto" />}
              {index > 2 && <span className="text-sm font-bold text-gray-400">#{index + 1}</span>}
            </div>

            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700 shrink-0">
              {score.name.slice(0, 2).toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{score.name}</p>
              <p className="text-xs text-gray-500">{score.department}</p>
            </div>

            {/* Stats */}
            <div className="hidden md:flex items-center gap-5 text-sm">
              <Stat icon={TrendingUp}   label="Assigned"  value={score.tasksAssigned} color="text-gray-600" />
              <Stat icon={CheckCircle2} label="Completed" value={score.tasksCompleted} color="text-green-600" />
              <Stat icon={Clock}        label="On Time"   value={score.onTimeCount}    color="text-blue-600" />
              <Stat icon={AlertTriangle}label="Late"      value={score.lateCount}      color="text-red-500" />
            </div>

            {/* Score */}
            <div className="text-right shrink-0">
              <p className={cn('text-2xl font-bold', getScoreColor(score.monthlyScore))}>
                {score.monthlyScore}%
              </p>
              <p className="text-[11px] text-gray-400">MIS Score</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', getScoreColor(score.monthlyScore).replace('text-', 'bg-'))}
              style={{ width: `${score.monthlyScore}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: number; color: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center gap-1">
        <Icon size={13} className={color} />
        <span className="font-semibold text-gray-700">{value}</span>
      </div>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}
