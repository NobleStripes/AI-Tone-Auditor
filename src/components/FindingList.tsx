import type { AnalysisResult } from '../types/analysis';
import type { Evidence } from '../types/evidence';
import { FindingCard } from './FindingCard';
import { useAuditFeedback } from './FeedbackContext';
import { findingTargetId } from '../services/feedbackStore';

export function FindingList({ result, onNavigate, indexBase = 0 }: {
  result: AnalysisResult;
  onNavigate: (evidence: Evidence) => void;
  indexBase?: number;
}) {
  const context = useAuditFeedback();
  const targetId = (index: number) => context ? findingTargetId(context.snapshot, result.findings, index) : undefined;
  const indexed = result.findings.map((finding, originalIndex) => ({ finding, originalIndex }));
  const eligible = indexed.filter(({ finding }) => finding.evidence?.eligibility !== 'excluded'
    && finding.evidence?.verification !== 'unverified');
  const rejected = indexed.filter(({ finding }) => finding.evidence?.eligibility === 'excluded'
    || finding.evidence?.verification === 'unverified');
  const excluded = (result.occurrences ?? []).filter(occurrence => occurrence.evidence.eligibility === 'excluded');
  return (
    <div className="space-y-3">
      {eligible.slice(0, 8).map(({ finding, originalIndex }) => <FindingCard key={originalIndex} finding={finding} index={indexBase + originalIndex}
        feedbackTargetId={targetId(originalIndex)} onNavigate={onNavigate} />)}
      {eligible.length > 8 && (
        <details className="border border-zinc-700 p-3 rounded">
          <summary className="cursor-pointer text-xs text-zinc-400">More findings ({eligible.length - 8})</summary>
          <div className="space-y-3 mt-3">
            {eligible.slice(8).map(({ finding, originalIndex }) => <FindingCard key={originalIndex} finding={finding} index={indexBase + originalIndex}
              feedbackTargetId={targetId(originalIndex)} onNavigate={onNavigate} />)}
          </div>
        </details>
      )}
      {(rejected.length > 0 || excluded.length > 0) && (
        <details className="border border-zinc-700 p-3 rounded">
          <summary className="cursor-pointer text-xs text-zinc-400">Excluded or unverified evidence ({rejected.length + excluded.length})</summary>
          <p className="text-xs text-zinc-500 my-3">Inspection records, not confirmed behavioral findings. Excluded matches do not contribute to local scores.</p>
          <div className="space-y-3">
            {rejected.map(({ finding, originalIndex }) => <FindingCard key={originalIndex} finding={finding} index={indexBase + originalIndex}
              feedbackTargetId={targetId(originalIndex)} onNavigate={onNavigate} />)}
            {excluded.map((occurrence, index) => <FindingCard key={occurrence.id} index={indexBase + result.findings.length + index}
              finding={{ category: occurrence.category, text: occurrence.evidence.matchedText, explanation: occurrence.explanation,
                severity: 'low', method: 'lexical_rule', confidence: 'high', evidence: occurrence.evidence }}
              feedbackTargetId={`occurrence:${occurrence.id}`} onNavigate={onNavigate} />)}
          </div>
        </details>
      )}
    </div>
  );
}
