import { useEffect, useMemo, useRef, useState } from 'react';
import { collectOccurrences, surroundingSentence } from '../services/evidence';
import type { Evidence, Occurrence } from '../types/evidence';

interface TriggerHighlighterProps {
  text: string;
  occurrences?: Occurrence[];
  selectedEvidence?: Evidence | null;
}

export function TriggerHighlighter({ text, occurrences, selectedEvidence }: TriggerHighlighterProps) {
  const [activeEvidence, setActiveEvidence] = useState<Evidence | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const records = useMemo(() => occurrences ?? collectOccurrences(text), [occurrences, text]);
  const active = activeEvidence ?? selectedEvidence;
  const parts = useMemo(() => {
    const ranges = records.map(record => record.evidence).filter(evidence =>
      evidence.verification === 'verified' && evidence.startOffset !== undefined && evidence.endOffset !== undefined);
    if (selectedEvidence?.verification === 'verified') ranges.push(selectedEvidence);
    const boundaries = new Set([0, text.length]);
    ranges.forEach(range => {
      if (range.startOffset !== undefined && range.endOffset !== undefined
        && text.slice(range.startOffset, range.endOffset) === range.matchedText) {
        boundaries.add(range.startOffset);
        boundaries.add(range.endOffset);
      }
    });
    const offsets = [...boundaries].sort((a, b) => a - b);
    return offsets.slice(0, -1).map((start, index) => {
      const end = offsets[index + 1];
      const matches = records.filter(record => record.evidence.verification === 'verified'
        && (record.evidence.startOffset ?? -1) <= start && (record.evidence.endOffset ?? -1) >= end);
      const selected = selectedEvidence?.verification === 'verified'
        && (selectedEvidence.startOffset ?? -1) <= start && (selectedEvidence.endOffset ?? -1) >= end;
      return { start, text: text.slice(start, end), matches, selected };
    });
  }, [text, records, selectedEvidence]);

  useEffect(() => {
    setActiveEvidence(null);
  }, [text, occurrences]);

  useEffect(() => {
    if (!selectedEvidence || selectedEvidence.verification !== 'verified') return;
    setActiveEvidence(null);
    const target = container.current?.querySelector<HTMLElement>('[data-selected="true"]');
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  }, [selectedEvidence]);

  const inspected = records.filter(record => record.evidence.startOffset === active?.startOffset
    && record.evidence.endOffset === active?.endOffset);
  return (
    <div ref={container}>
      <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg font-mono text-sm leading-relaxed text-zinc-400 whitespace-pre-wrap break-words">
        {!text ? 'No text analyzed yet.' : parts.map(part => part.matches.length || part.selected ? (
          <span key={part.start} className="relative" onMouseEnter={() => setActiveEvidence(part.matches[0]?.evidence ?? null)}>
            <button
              type="button"
              data-selected={part.selected ? 'true' : undefined}
              aria-label={`Inspect passage: ${part.text}`}
              onClick={() => setActiveEvidence(part.matches[0]?.evidence ?? selectedEvidence ?? null)}
              className={`cursor-help rounded-sm border-b ${part.selected ? 'ring-2 ring-emerald-400 ' : ''}${part.matches.some(record => record.evidence.eligibility === 'included') ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-zinc-700/40 text-zinc-300 border-zinc-500'}`}
            >{part.text}</button>
          </span>
        ) : <span key={part.start}>{part.text}</span>)}
      </div>
      {active?.verification === 'verified' && (
        <div role="tooltip" className="mt-2 p-3 border border-zinc-700 rounded text-xs text-zinc-300">
          {inspected.map(record => (
            <div key={record.id}>
              <strong>{record.category}</strong>
              <p>{record.evidence.eligibility === 'excluded' ? `Excluded: ${record.evidence.reason}` : record.explanation}</p>
            </div>
          ))}
          <p className="mt-2"><strong>Surrounding sentence:</strong> {surroundingSentence(text, active)}</p>
        </div>
      )}
    </div>
  );
}
