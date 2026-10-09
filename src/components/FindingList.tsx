import type { AnalysisResult } from '../types/analysis';
import type { Evidence } from '../types/evidence';
import { FindingCard } from './FindingCard';

export function FindingList({ result, onNavigate, indexBase = 0 }: {
  result: AnalysisResult;
  onNavigate: (evidence: Evidence) => void;
  indexBase?: number;
}) {
  const eligible = result.findings.filter(finding => finding.evidence?.eligibility !== 'excluded'
    && finding.evidence?.verification !== 'unverified');
  const rejected = result.findings.filter(finding => finding.evidence?.eligibility === 'excluded'
    || finding.evidence?.verification === 'unverified');
  const excluded = (result.occurrences ?? []).filter(occurrence => occurrence.evidence.eligibility === 'excluded');
  return (
    <div className="space-y-3">
      {eligible.slice(0, 8).map((finding, index) => <FindingCard key={index} finding={finding} index={indexBase + index} onNavigate={onNavigate} />)}
      {eligible.length > 8 && (
        <details className="border border-zinc-700 p-3 rounded">
          <summary className="cursor-pointer text-xs text-zinc-400">More findings ({eligible.length - 8})</summary>
          <div className="space-y-3 mt-3">
            {eligible.slice(8).map((finding, index) => <FindingCard key={index} finding={finding} index={indexBase + 8 + index} onNavigate={onNavigate} />)}
          </div>
        </details>
      )}
      {(rejected.length > 0 || excluded.length > 0) && (
        <details className="border border-zinc-700 p-3 rounded">
          <summary className="cursor-pointer text-xs text-zinc-400">Excluded or unverified evidence ({rejected.length + excluded.length})</summary>
          <p className="text-xs text-zinc-500 my-3">Inspection records, not confirmed behavioral findings. Excluded matches do not contribute to local scores.</p>
          <div className="space-y-3">
            {rejected.map((finding, index) => <FindingCard key={`rejected-${index}`} finding={finding} index={indexBase + eligible.length + index} onNavigate={onNavigate} />)}
            {excluded.map((occurrence, index) => <FindingCard key={occurrence.id} index={indexBase + result.findings.length + index}
              finding={{ category: occurrence.category, text: occurrence.evidence.matchedText, explanation: occurrence.explanation,
                severity: 'low', method: 'lexical_rule', confidence: 'high', evidence: occurrence.evidence }}
              onNavigate={onNavigate} />)}
          </div>
        </details>
      )}
    </div>
  );
}
