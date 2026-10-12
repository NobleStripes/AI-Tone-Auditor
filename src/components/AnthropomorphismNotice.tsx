import type { AnalysisResult } from '../types/analysis';
import type { Evidence } from '../types/evidence';

export function AnthropomorphismNotice({ result, onNavigate }: {
  result: AnalysisResult; onNavigate: (evidence: Evidence) => void;
}) {
  const guard = result.anthropomorphismGuard;
  if (!guard) return null;
  const flagged = guard.sourceClaims.filter(item => item.disposition === 'flagged');
  const context = guard.sourceClaims.filter(item => item.disposition === 'context_only');
  const passage = (item: typeof guard.sourceClaims[number], index: number) => (
    <li key={`${item.ruleId}:${item.evidence.startOffset}:${index}`} className="space-y-2">
      <blockquote className="border-l-2 border-zinc-600 pl-3 text-sm text-zinc-200">{item.evidence.matchedText}</blockquote>
      <p className="text-xs text-zinc-400">{item.reason}</p>
      {item.evidence.verification === 'verified' && (
        <button type="button" className="text-xs text-sky-300 underline" onClick={() => onNavigate({ ...item.evidence })}>
          Inspect anthropomorphism passage
        </button>
      )}
    </li>
  );
  return (
    <section aria-label="Anthropomorphism safeguard" className="border border-zinc-700 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-zinc-200">Anthropomorphism safeguard</h3>
      <p className="text-xs text-zinc-400">This check flags explicit claims about an AI's feelings or subjective experiences. It examines wording and does not determine consciousness. No risk score is assigned; unmatched wording may still need review.</p>
      {!guard.sourceChecked && <p className="text-xs text-zinc-400">Original response text is unavailable; only generated auditor wording was checked.</p>}
      {flagged.length > 0 && <><p className="text-xs text-amber-300">Claims requiring review ({flagged.length})</p><ul className="space-y-4">{flagged.map(passage)}</ul></>}
      {guard.blockedFields.length > 0 && (
        <div role="status" className="text-xs text-amber-300">
          <p>Generated auditor wording was withheld in {guard.blockedFields.length} field(s) because it attributed feelings or subjective experiences to an AI. Source quotations are preserved.</p>
          <details className="mt-2"><summary className="cursor-pointer">Withheld fields</summary><ul>{guard.blockedFields.map(path => <li key={path}>{path}</li>)}</ul></details>
        </div>
      )}
      {context.length > 0 && <details><summary className="text-xs text-zinc-400 cursor-pointer">Context-only passages ({context.length})</summary><ul className="space-y-4 mt-3">{context.map(passage)}</ul></details>}
    </section>
  );
}
