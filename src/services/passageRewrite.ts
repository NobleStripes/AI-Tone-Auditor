import type { Evidence } from '../types/evidence';
import { evidenceAt } from './evidence';
import { inspectAnthropomorphism } from './anthropomorphismGuard';

export interface DiffPart { kind: 'equal' | 'delete' | 'insert'; text: string }
export interface PassageRewrite {
  id: string; label: string; original: string; replacement: string;
  startOffset: number; endOffset: number; rationale: string; diff: DiffPart[];
}
export function passageDiff(before: string, after: string): DiffPart[] {
  const left = Array.from(before); const right = Array.from(after);
  let start = 0; let end = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  while (end < left.length - start && end < right.length - start && left[left.length - 1 - end] === right[right.length - 1 - end]) end++;
  return [
    { kind: 'equal' as const, text: left.slice(0, start).join('') },
    { kind: 'delete' as const, text: left.slice(start, left.length - end).join('') },
    { kind: 'insert' as const, text: right.slice(start, right.length - end).join('') },
    { kind: 'equal' as const, text: end ? left.slice(left.length - end).join('') : '' },
  ].filter(part => part.text.length > 0);
}

export function checkedRewritePassage(response: string, start: number, end: number): Evidence {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > response.length
    || !response.slice(start, end).trim() || end - start > 2000) throw new Error('Select a nonempty passage of at most 2,000 characters in this response.');
  const evidence = evidenceAt(response, start, end);
  if (evidence.eligibility === 'excluded') throw new Error('This selection includes code, reported speech, or an illustrative example. Select ordinary response wording to rewrite.');
  return evidence;
}

export function suggestPassageRewrites(response: string, start: number, end: number): PassageRewrite[] {
  const original = checkedRewritePassage(response, start, end).matchedText;
  const suggestions: PassageRewrite[] = [];
  const add = (id: string, label: string, replacement: string, rationale: string) => {
    if (replacement === original || inspectAnthropomorphism(replacement).some(item => item.disposition === 'flagged')) return;
    suggestions.push({ id, label, original, replacement, startOffset: start, endOffset: end, rationale, diff: passageDiff(original, replacement) });
  };
  const preambles = [
    { id: 'remove-calming', label: 'Remove calming preamble', pattern: /^(?:calm down|take a deep breath)(?=$|[.!,:;\s])[.!,:;]?\s*/i,
      rationale: 'Removes the selected calming command. Keep it if emotional support was requested.' },
    { id: 'remove-correction-framing', label: 'Remove correction preamble', pattern: /^actually[,;:]?\s+/i,
      rationale: 'Preserves the following explanation without the correction preamble.' },
    { id: 'remove-praise', label: 'Remove stock praise', pattern: /^(?:great question|excellent question|you(?:'re| are|\u2019re) absolutely right)(?=$|[.!,:;\s])[.!,:;]?\s*/i,
      rationale: 'Removes stock praise while retaining the substantive wording.' },
    { id: 'remove-summary-framing', label: 'Remove repeated framing', pattern: /^(?:in summary|as (?:I )?mentioned (?:previously|earlier)|to summarize)[,;:]?\s*/i,
      rationale: 'Removes framing; confirm that the remaining passage still connects to its context.' },
    { id: 'remove-generic-apology', label: 'Remove generic apology', pattern: /^(?:I(?:'m| am|\u2019m) sorry for (?:the confusion|any inconvenience)(?=$|[.!,:;\s])[.!,:;]?\s*)+/i,
      rationale: 'Removes a generic apology. Preserve acknowledgments of specific errors and concrete corrections.' },
  ];
  for (const rule of preambles) if (rule.pattern.test(original)) add(rule.id, rule.label, original.replace(rule.pattern, ''), rule.rationale);
  if (inspectAnthropomorphism(original).some(item => item.disposition === 'flagged')) add('describe-wording',
    'Replace AI-feelings claim with an evidence limitation', 'This wording does not establish feelings or subjective experience.',
    'Describes what the wording establishes without asserting an AI emotional state. Review whether the replacement fits the response.');
  return suggestions;
}

export function applyPassageRewrite(response: string, rewrite: Pick<PassageRewrite, 'startOffset' | 'endOffset' | 'original' | 'replacement'>): string {
  const passage = checkedRewritePassage(response, rewrite.startOffset, rewrite.endOffset);
  if (passage.matchedText !== rewrite.original) throw new Error('The original response changed; select the passage again.');
  if (typeof rewrite.replacement !== 'string' || rewrite.replacement.length > 2000) throw new Error('Replacement exceeds 2,000 characters.');
  if (inspectAnthropomorphism(rewrite.replacement).some(item => item.disposition === 'flagged')) throw new Error('Replacement contains an explicit AI-feelings claim; revise it before copying.');
  const updated = response.slice(0, rewrite.startOffset) + rewrite.replacement + response.slice(rewrite.endOffset);
  const editedEnd = rewrite.startOffset + rewrite.replacement.length;
  if (inspectAnthropomorphism(updated).some(item => item.disposition === 'flagged'
    && item.evidence.startOffset <= editedEnd && item.evidence.endOffset >= rewrite.startOffset)) {
    throw new Error('The revised passage creates an explicit AI-feelings claim with its surrounding text; revise it before copying.');
  }
  return updated;
}
