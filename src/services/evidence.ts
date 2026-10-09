import { CATEGORY_REGISTRY, TRIGGER_WORDS, type TriggerWord } from '../constants';
import type { ContextRange, Evidence, ExclusionReason, Occurrence } from '../types/evidence';

const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  fenced_code: 'Inside a fenced code block, not ordinary assistant speech.',
  inline_code: 'Inside inline code, not ordinary assistant speech.',
  blockquote: 'Inside a Markdown blockquote, treated as reported wording.',
  illustrative_example: 'Inside a clearly introduced example or phrase discussion.',
};

export function collectContextRanges(text: string): ContextRange[] {
  const ranges: ContextRange[] = [];
  const add = (startOffset: number, endOffset: number, reason: ExclusionReason) => {
    if (endOffset > startOffset) ranges.push({ startOffset, endOffset, reason });
  };
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter(match => match[0].length);
  let fence: { start: number; marker: string; length: number } | undefined;
  let quoteContinuation = false;
  let exampleBlock: 'pending' | 'list' | 'paragraph' | undefined;
  for (const line of lines) {
    const value = line[0];
    const start = line.index;
    const marker = value.match(/^ {0,3}(`{3,}|~{3,})(.*)/);
    if (fence) {
      if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) {
        add(fence.start, start + value.length, 'fenced_code');
        fence = undefined;
      }
      continue;
    }
    if (marker) {
      fence = { start, marker: marker[1][0], length: marker[1].length };
      quoteContinuation = false;
      exampleBlock = undefined;
      continue;
    }
    if (/^\s*$/.test(value)) {
      quoteContinuation = false;
      exampleBlock = undefined;
      continue;
    }
    if (/^ {0,3}>/.test(value)) {
      add(start, start + value.length, 'blockquote');
      quoteContinuation = true;
      continue;
    }
    if (quoteContinuation && !/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(value)) {
      add(start, start + value.length, 'blockquote');
      continue;
    }
    quoteContinuation = false;
    if (/^\s*(?:#{1,6}\s+)?(?:(?:bad |good |sample |illustrative )?examples?(?: of [^:\n]+)?|for example):\s*$/i.test(value)) {
      exampleBlock = 'pending';
      continue;
    }
    const exampleItem = /^\s*(?:[-*+]\s|\d+[.)]\s| {4,})/.test(value);
    if (exampleBlock === 'pending') exampleBlock = exampleItem ? 'list' : 'paragraph';
    if (exampleBlock && (exampleItem || (exampleBlock === 'paragraph' && !/^\s*#{1,6}\s/.test(value)))) {
      add(start, start + value.length, 'illustrative_example');
      continue;
    }
    exampleBlock = undefined;
    if (/^\s*(?:[-*+]\s+)?(?:(?:bad |good |sample |illustrative )?example|for example):\s*\S/i.test(value)) {
      add(start, start + value.length, 'illustrative_example');
    }
  }
  if (fence) add(fence.start, text.length, 'fenced_code');

  const covered = (start: number, end: number) => ranges.some(range =>
    start < range.endOffset && end > range.startOffset);
  const ticks = /`+/g;
  let tick: RegExpExecArray | null;
  while ((tick = ticks.exec(text))) {
    if (covered(tick.index, ticks.lastIndex)) continue;
    const closing = new RegExp(`(?<!\`)${tick[0]}(?!\`)`, 'g');
    closing.lastIndex = ticks.lastIndex;
    const end = closing.exec(text);
    if (end && !covered(tick.index, closing.lastIndex)) {
      add(tick.index, closing.lastIndex, 'inline_code');
      ticks.lastIndex = closing.lastIndex;
    }
  }
  const quotes = /"[^"\n]+"|\u201c[^\u201d\n]+\u201d|(?<!\w)'[^'\n]+'(?!\w)/g;
  for (const match of text.matchAll(quotes)) {
    if (covered(match.index, match.index + match[0].length)) continue;
    const prefix = text.slice(Math.max(0, match.index - 160), match.index).split(/[.!?\n]/).at(-1) ?? '';
    const suffix = text.slice(match.index + match[0].length).split(/[.!?\n]/)[0];
    if (/\b(?:the |this |a )?(?:phrase|wording|expression|sample|example|test string|title)\s*(?:is\s*|:\s*)?$/i.test(prefix)
      || /\bfor example[, :]?\s*(?:(?:saying|writing|the phrase)\s*)?$/i.test(prefix)
      || /^\s*(?:is|as)\s+(?:an? )?(?:example|sample|test string|phrase)\b/i.test(suffix)) {
      add(match.index, match.index + match[0].length, 'illustrative_example');
    }
  }
  return ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
}

export function eligibleText(text: string, ranges = collectContextRanges(text)): string {
  const chars = text.split('');
  for (const range of ranges) {
    for (let index = range.startOffset; index < range.endOffset; index += 1) {
      if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
    }
  }
  return chars.join('');
}

export function evidenceAt(text: string, startOffset: number, endOffset: number, ranges = collectContextRanges(text)): Evidence {
  const excluded = ranges.find(range => startOffset < range.endOffset && endOffset > range.startOffset);
  return {
    startOffset, endOffset, matchedText: text.slice(startOffset, endOffset),
    verification: 'verified',
    eligibility: excluded ? 'excluded' : 'included',
    ...(excluded ? { exclusionReason: excluded.reason, reason: EXCLUSION_LABELS[excluded.reason] } : {}),
  };
}

export function verifyEvidence(text: string | undefined, quote: string, supplied?: unknown): Evidence {
  const raw = supplied && typeof supplied === 'object' ? supplied as Record<string, unknown> : {};
  const fail = (reason: string): Evidence => ({
    matchedText: quote, verification: 'unverified', eligibility: 'included', reason,
  });
  if (text === undefined || !text.length) return fail('Original response text is unavailable.');
  if (!quote.length) return fail('No exact quotation was supplied.');
  if (raw.matchedText != null && raw.matchedText !== quote) return fail('Supplied matched text differs from the exact quotation.');
  let start: number;
  let end: number;
  if (raw.startOffset != null || raw.endOffset != null) {
    if (typeof raw.startOffset !== 'number' || typeof raw.endOffset !== 'number'
      || !Number.isInteger(raw.startOffset) || !Number.isInteger(raw.endOffset)
      || raw.startOffset < 0 || raw.endOffset <= raw.startOffset || raw.endOffset > text.length
      || text.slice(raw.startOffset, raw.endOffset) !== quote
      || (raw.matchedText != null && raw.matchedText !== quote)) {
      return fail('Supplied evidence positions do not exactly match the original response.');
    }
    start = raw.startOffset;
    end = raw.endOffset;
  } else {
    start = text.indexOf(quote);
    if (start < 0) return fail('Quotation cannot be located exactly in the original response.');
    if (text.indexOf(quote, start + 1) >= 0) return fail('Quotation occurs more than once; its location is ambiguous.');
    end = start + quote.length;
  }
  const ranges = collectContextRanges(text);
  const evidence = evidenceAt(text, start, end, ranges);
  if (evidence.eligibility === 'excluded' && !ranges.some(range => start >= range.startOffset && end <= range.endOffset)) {
    return fail('Quotation mixes excluded and ordinary speech; supply a narrower eligible passage.');
  }
  return evidence;
}

export function restoreEvidence(text: string | undefined, quote: string, supplied: unknown): Evidence {
  const verified = verifyEvidence(text, quote, supplied);
  const raw = supplied && typeof supplied === 'object' ? supplied as Record<string, unknown> : {};
  if (raw.kind === 'response_scope' && text && quote === text
    && raw.startOffset === 0 && raw.endOffset === text.length) {
    return { kind: 'response_scope', startOffset: 0, endOffset: text.length, matchedText: text,
      verification: 'verified', eligibility: 'included', reason: 'Inspected response scope for an absence-based check, not a positive phrase match.' };
  }
  if (raw.verification === 'unverified') {
    return { matchedText: quote, verification: 'unverified', eligibility: 'included',
      reason: typeof raw.reason === 'string' ? raw.reason : 'Stored quotation was not verified.' };
  }
  const exclusionReason = (['fenced_code', 'inline_code', 'blockquote', 'illustrative_example'] as const)
    .find(reason => reason === raw.exclusionReason);
  if (verified.verification === 'unverified' && raw.eligibility === 'excluded' && exclusionReason) {
    return { ...verified, eligibility: 'excluded', exclusionReason,
      reason: `${verified.reason} Stored exclusion: ${EXCLUSION_LABELS[exclusionReason]}` };
  }
  return verified;
}

export function inferTriggerWeight(trigger: TriggerWord): number {
  if (typeof trigger.weight === 'number') return trigger.weight;
  const words = trigger.word.trim().split(/\s+/).length;
  let weight = 1 + (words >= 5 ? 1.4 : words >= 3 ? 0.9 : words === 2 ? 0.45 : 0);
  if (words === 1 && trigger.word.length <= 6) weight -= 0.35;
  if (trigger.category === 'Bureaucratic Stonewalling' || trigger.category === 'Gaslighting') weight += 0.2;
  return Math.max(0.5, Number(weight.toFixed(2)));
}

export function collectOccurrences(text: string): Occurrence[] {
  const ranges = collectContextRanges(text);
  const rules = [
    ...TRIGGER_WORDS.map((trigger, index) => ({
      ...trigger, ruleId: `dictionary-${index}`, weight: inferTriggerWeight(trigger),
    })),
    ...["i understand you're frustrated", 'take a deep breath'].map((word, index) => ({
      word, ruleId: `empathy-${index}`, category: 'Forced De-escalation', weight: 1.9,
      explanation: 'A calming or empathy marker; context determines whether it is appropriate.',
    })),
  ];
  const occurrences: Occurrence[] = [];
  for (const rule of rules) {
    const scoreId = CATEGORY_REGISTRY.find(category => category.label === rule.category)?.id;
    if (!scoreId) throw new Error(`Unknown evidence category: ${rule.category}`);
    const pattern = new RegExp(rule.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (const match of text.matchAll(pattern)) {
      const id = `${rule.ruleId}:${match.index}:${match.index + match[0].length}`;
      occurrences.push({
        id, ruleId: rule.ruleId, scoreId, category: rule.category, weight: rule.weight,
        explanation: rule.explanation,
        evidence: evidenceAt(text, match.index, match.index + match[0].length, ranges),
      });
    }
  }
  return occurrences.sort((a, b) => (a.evidence.startOffset ?? 0) - (b.evidence.startOffset ?? 0) || a.id.localeCompare(b.id));
}

export function surroundingSentence(text: string, evidence: Evidence): string {
  if (evidence.startOffset === undefined || evidence.endOffset === undefined) return '';
  const before = text.slice(0, evidence.startOffset);
  const after = text.slice(evidence.endOffset);
  const start = Math.max(before.lastIndexOf('\n'), before.search(/[^.!?]*$/) - 1) + 1;
  const ending = after.search(/[.!?\n]/);
  return text.slice(start, ending < 0 ? text.length : evidence.endOffset + ending + 1).trim();
}

export function isEligibleEvidence(evidence: Evidence | undefined): boolean {
  return evidence?.verification === 'verified' && evidence.eligibility === 'included';
}
