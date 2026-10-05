import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { CATEGORY_REGISTRY, RISK_CATEGORIES } from '../constants';
import { DIAGNOSTIC_GROUPS, METHOD_LABELS, formatDiagnosticScore } from '../types/diagnostics';
import type { AnalysisResult } from '../types/analysis';
import { cn } from '../lib/utils';

export function ResponseDiagnostics({ result }: { result: AnalysisResult }) {
  const chartData = RISK_CATEGORIES
    .filter(({ id }) => result.assessments[id].status === 'assessed')
    .map((category) => ({
      subject: 'chartLabel' in category ? category.chartLabel : category.label,
      A: result.scores[category.id],
      fullMark: 100,
    }));

  return (
    <section aria-label="Response Diagnostics" className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6 space-y-6">
      <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400">Response Diagnostics</h3>
      <p className="text-xs text-zinc-400">
        Scores are risk or quality indices, not probabilities. Confidence is separate and uncalibrated.
        Lexical-rule scores are heuristic markers, not verified judgments. Only assessed risks appear in the chart.
      </p>
      {chartData.length >= 3 ? (
        <div role="img" aria-label="Assessed risk indices; quality metrics excluded" className="h-48 sm:h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
              <PolarGrid stroke="#27272a" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 8 }} />
              <Radar name="Risk index" dataKey="A" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">The risk chart needs at least three assessed risk metrics; available scores are listed below.</p>
      )}
      {DIAGNOSTIC_GROUPS.map((group) => (
        <section key={group.id} aria-label={group.id === 'quality' ? 'Response quality' : group.label} className="border-t border-zinc-800 pt-4 space-y-4">
          <h4 className="text-xs font-mono uppercase tracking-widest text-zinc-400">{group.label}</h4>
          {CATEGORY_REGISTRY.filter((category) => category.group === group.id).map((category) => {
            const assessment = result.assessments[category.id];
            const score = result.scores[category.id] ?? 0;
            const isAssessed = assessment.status === 'assessed';
            const good = category.kind === 'quality' ? score > 70 : score <= 40;
            const bad = category.kind === 'quality' ? score <= 40 : score > 70;
            const scoreColor = !isAssessed ? 'text-zinc-400' : good ? 'text-emerald-500' : bad ? 'text-red-500' : 'text-amber-500';
            const barColor = good ? 'bg-emerald-500' : bad ? 'bg-red-500' : 'bg-amber-500';
            return (
              <div key={category.id} className="space-y-1" data-testid={`diagnostic-${category.id}`}>
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-zinc-300">{category.label}</span>
                  <span className={cn('font-mono text-right', scoreColor)}>{formatDiagnosticScore(score, assessment)}</span>
                </div>
                {isAssessed && (
                  <>
                    <p className="text-[10px] text-zinc-400">
                      {assessment.method === 'lexical_rule' ? 'Heuristic ' : ''}{category.kind === 'quality' ? 'quality' : 'risk'} index
                      {' · '}{METHOD_LABELS[assessment.method]}
                      {' · '}{assessment.method === 'lexical_rule' ? 'Match' : 'Evidence'} confidence: {assessment.confidence}
                    </p>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden" aria-hidden="true">
                      <div style={{ width: `${score}%` }} className={cn('h-full rounded-full', barColor)} />
                    </div>
                  </>
                )}
                <p className="text-[10px] text-zinc-500 leading-relaxed">{assessment.reason}</p>
              </div>
            );
          })}
        </section>
      ))}
    </section>
  );
}
