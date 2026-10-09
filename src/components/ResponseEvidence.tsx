import { useState } from 'react';
import type { AnalysisResult } from '../types/analysis';
import type { Evidence } from '../types/evidence';
import { FindingList } from './FindingList';
import { TriggerHighlighter } from './TriggerHighlighter';

export function ResponseEvidence({ text, result, indexBase }: { text: string; result: AnalysisResult; indexBase: number }) {
  const [selected, setSelected] = useState<Evidence | null>(null);
  return (
    <div className="space-y-4">
      <TriggerHighlighter text={text} occurrences={result.occurrences} selectedEvidence={selected} />
      <FindingList result={result} onNavigate={evidence => setSelected({ ...evidence })} indexBase={indexBase} />
    </div>
  );
}
