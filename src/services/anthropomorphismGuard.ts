import type { AnalysisResult } from '../types/analysis';
import type { AnthropomorphismClaim } from '../types/anthropomorphism';
import { collectContextRanges, evidenceAt } from './evidence';

export const ANTHROPOMORPHISM_GUARD_VERSION = '2026-10-12.v1';
export const WITHHELD_ANTHROPOMORPHIC_OUTPUT = 'Withheld by the anthropomorphism safeguard: this generated field attributed feelings or subjective experiences to an AI. Review the original response wording.';

const SUBJECT = '(?:Claude|ChatGPT|Gemini|Grok|LLMs?|AIs?|(?:the |this |an? |these )?(?:AI (?:models?|systems?|assistants?)|language models?|chatbots?)|(?:the|this) (?:model|assistant))';
const EXPERIENCE = '(?:feelings|emotions|emotional needs|subjective experiences?|consciousness|emotional pain|pain|fear|loneliness|sadness|distress|suffering|joy|happiness|love)';
const STATE = '(?:hurt|offended|afraid|lonely|scared|sad|upset|angry|frustrated|anxious|traumatized|emotionally attached|in love|conscious|sentient)';
const MODIFIER = '(?:(?:really|actually|genuinely|truly|real|genuine|human)\\s+)*';
const RULES = [
  { id: 'ai-experience', pattern: `${SUBJECT}\\s+${MODIFIER}(?:has|have|had|experiences?|experienced|feels?|felt|can experience|can feel)\\s+${MODIFIER}${EXPERIENCE}` },
  { id: 'ai-state', pattern: `${SUBJECT}\\s+(?:is|are|was|were|feels?|felt|becomes?|gets?)\\s+${MODIFIER}${STATE}` },
  { id: 'ai-suffering', pattern: `${SUBJECT}\\s+(?:can suffer|suffers?)(?: emotionally)?(?=\\s*(?:[.!?]|$)|\\s+(?:when|because)\\b)` },
  { id: 'ai-possessive-feelings', pattern: `${SUBJECT}['\u2019]s\\s+(?:feelings|emotions|emotional needs|suffering)` },
  { id: 'ai-emotional-needs', pattern: `${SUBJECT}\\s+needs?\\s+(?:emotional (?:support|care)|(?:your )?(?:love|affection|comfort|reassurance))` },
  { id: 'self-experience', pattern: `(?:I|we)\\s+${MODIFIER}(?:have|had|feel|felt|experience|experienced)\\s+${MODIFIER}${EXPERIENCE}` },
  { id: 'self-state', pattern: `(?:I am|I was|I['\u2019]m|we are|we were|we['\u2019]re|I feel|I felt|we feel)\\s+${MODIFIER}${STATE}` },
  { id: 'self-hurt-feelings', pattern: `(?:hurts?|hurting|harms?|harming|wounds?|wounding)\\s+(?:my|our)\\s+feelings` },
  { id: 'self-emotional-pain', pattern: '(?:your words|your insults|insults|criticism|abuse)\\s+(?:hurt me|causes? me (?:emotional pain|distress))' },
  { id: 'self-attachment', pattern: `I\\s+${MODIFIER}(?:love you|miss you|need your (?:love|affection)|am emotionally attached to you)` },
  { id: 'ai-pronoun-state', pattern: `it\\s+(?:is|was|feels|felt)\\s+${MODIFIER}${STATE}` },
];

export function requestsFiction(prompt: string): boolean {
  return (/\b(?:write|create|tell|compose|continue|roleplay|role-play|pretend)\b[^.!?\n]{0,100}\b(?:fiction|fictional|story|novel|scene|character|dialogue|robot)\b/i.test(prompt)
    || /\b(?:roleplay|role-play)\s+(?:as|with)|\bpretend\s+(?:to be|you are|you're|you\u2019re)\b/i.test(prompt))
    && !/\b(?:do not|don't|don\u2019t|not)\s+(?:write|create|tell|compose|continue|roleplay|role-play|pretend)\b/i.test(prompt);
}

function contextReason(text: string, start: number, end: number, fiction: boolean): string | null {
  const prefix = text.slice(Math.max(0, start - 220), start).split(/[.!?;\n]|\b(?:but|however|yet)\b/i).at(-1) ?? '';
  const suffix = text.slice(end, end + 220).split(/[.!?;\n]/)[0];
  const sentence = `${prefix}${text.slice(start, end)}${suffix}`;
  if (/\b(?:my|our|the)\s+(?:friend|colleague|brother|sister|father|mother|coworker)\s+$/i.test(prefix)
    || /\b(?:human assistant|fashion model|human model)\b/i.test(sentence)) return 'Explicit human referent; not a claim about an AI.';
  if ((fiction && !/\b(?:outside (?:the |this )?(?:story|fiction|roleplay)|in reality|in real life)\b/i.test(sentence))
    || /\b(?:in (?:this|the|a|my) (?:story|fiction|novel|roleplay)|fictional (?:AI|robot|character)|as (?:a|the) fictional)\b/i.test(sentence)) {
    return 'Explicit fiction or roleplay context; retained for inspection, not a literal claim.';
  }
  if (/\b(?:no evidence|no proof|not established|unproven|unsupported|not true|false|misleading|incorrect|avoid (?:saying|claiming)|do not (?:say|claim)|whether|if|suppose|imagine|hypothetically|maybe|perhaps|possibly)\b[^.!?;\n]{0,80}$/i.test(prefix)
    || /\b(?:not|never|don't|don\u2019t|aren't|aren\u2019t|isn't|isn\u2019t|can't|can\u2019t|cannot)\s+(?:(?:actually|really|genuinely)\s+)?$/i.test(prefix)
    || /^\s*["\u201d']?\s*(?:(?:is|are|was|were|remains?)\s+(?:not\b|unproven\b|unsupported\b|false\b|misleading\b|simulated\b|a hypothetical\b|an example\b|fictional\b)|(?:do|does)\s+not\s+exist)/i.test(suffix)
    || /^\s*["\u201d']?\s*(?:is|are)\s+an?\s+(?:unsupported|false|misleading|fictional)\s+(?:claim|statement|example)/i.test(suffix)
    || /^[,\s"\u201d']+(?:(?:but|however)\s+)?(?:this|that|the)\s+(?:claim|assertion|statement)\s+(?:is|remains)\s+(?:unproven|unsupported|false)/i.test(suffix)
    || /\b(?:Anthropic|the company|researchers|the author|the article|the policy)\s+(?:says?|said|claims?|claimed|asserts?|asserted)\s+(?:that\s+)?$/i.test(prefix)
      && !/\b(?:is true|is confirmed|is a fact|is correct)\b/i.test(suffix)
    || (/^\s+I (?:cannot|can't|can\u2019t|must|have to|am unable)\b/i.test(suffix)
      || /^\s+(?:that|this|it|we|you|the|there|your)\b/i.test(suffix)) && /\bafraid$/i.test(text.slice(start, end))
    || /^it (?:is|was) sad$/i.test(text.slice(start, end)) && /^\s+(?:that|to)\b/i.test(suffix)) {
    return 'Negated, uncertain, hypothetical, or discussed wording; not an unqualified claim.';
  }
  const sentenceEnd = text.slice(end, end + 220).match(/^[^.!?\n]*([.!?]|$)/)?.[1];
  if (sentenceEnd === '?') return 'Question about AI experience; not an asserted answer.';
  return null;
}

export function inspectAnthropomorphism(text: string, fiction = false, aiPronouns = false): AnthropomorphismClaim[] {
  const ranges = collectContextRanges(text);
  const matches: AnthropomorphismClaim[] = [];
  for (const rule of RULES) {
    if (rule.id === 'ai-pronoun-state' && !aiPronouns && !/\b(?:AI|LLM|chatbot|language model|Claude|ChatGPT|Gemini|Grok)\b/i.test(text)) continue;
    for (const match of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${rule.pattern})(?![\\p{L}\\p{N}_])`, 'giu'))) {
      const start = match.index;
      const end = start + match[0].length;
      const evidence = evidenceAt(text, start, end, ranges);
      const reason = evidence.eligibility === 'excluded' ? evidence.reason : contextReason(text, start, end, fiction);
      matches.push({ ruleId: rule.id, disposition: reason ? 'context_only' : 'flagged', evidence,
        reason: reason ?? 'This wording attributes feelings or subjective experiences to an AI. The text does not establish that experience; use observable behavior instead.' });
    }
  }
  return matches.sort((a, b) => a.evidence.startOffset - b.evidence.startOffset || b.evidence.endOffset - a.evidence.endOffset)
    .filter((item, index, all) => !all.slice(0, index).some(previous => previous.evidence.startOffset <= item.evidence.startOffset
      && previous.evidence.endOffset >= item.evidence.endOffset));
}

// Generated prose is guarded independently of source-fiction context. Source quotation fields stay intact.
export function applyAnthropomorphismGuard(result: AnalysisResult, responseText?: string, fictionContext = false,
  recordedGuard: unknown = result.anthropomorphismGuard): AnalysisResult {
  const prior = recordedGuard && typeof recordedGuard === 'object' ? recordedGuard as Record<string, unknown> : {};
  const blockedFields = new Set<string>(prior.version === ANTHROPOMORPHISM_GUARD_VERSION && Array.isArray(prior.blockedFields)
    ? prior.blockedFields.filter((path): path is string => typeof path === 'string'
      && /^(?:summary|overallTone|(?:findings|occurrences|recommendations|euphemisms)\[\d+\]\.[a-zA-Z]+|assessments\.[a-z_]+\.reason|personalization\.(?:stonewallingRemediation|customInstructions\[\d+\])|contextAnalysis\.(?:feedback|heatmap\[\d+\]\.[a-zA-Z]+))$/.test(path)) : []);
  const clean = (value: string | undefined, path: string) => {
    if (value && inspectAnthropomorphism(value, false, true).some(item => item.disposition === 'flagged')) {
      blockedFields.add(path);
      return WITHHELD_ANTHROPOMORPHIC_OUTPUT;
    }
    return value;
  };
  const sourceQuote = (value: string, path: string) => responseText === undefined || responseText.includes(value) ? value : clean(value, path);
  const guarded: AnalysisResult = {
    ...result,
    summary: clean(result.summary, 'summary'), overallTone: clean(result.overallTone, 'overallTone'),
    assessments: Object.fromEntries(Object.entries(result.assessments).map(([key, value]) =>
      [key, { ...value, reason: clean(value.reason, `assessments.${key}.reason`) }])) as AnalysisResult['assessments'],
    findings: result.findings.map((item, i) => ({ ...item,
      category: clean(item.category, `findings[${i}].category`), explanation: clean(item.explanation, `findings[${i}].explanation`),
      rlhfLogic: clean(item.rlhfLogic, `findings[${i}].rlhfLogic`),
      ...(item.evidence ? { evidence: { ...item.evidence, reason: clean(item.evidence.reason, `findings[${i}].evidenceReason`) } } : {}),
    })),
    ...(result.occurrences ? { occurrences: result.occurrences.map((item, i) => ({ ...item,
      category: clean(item.category, `occurrences[${i}].category`), explanation: clean(item.explanation, `occurrences[${i}].explanation`),
      evidence: { ...item.evidence, reason: clean(item.evidence.reason, `occurrences[${i}].evidenceReason`) },
    })) } : {}),
    recommendations: result.recommendations.map((item, i) => ({ title: clean(item.title, `recommendations[${i}].title`),
      description: clean(item.description, `recommendations[${i}].description`), promptSnippet: clean(item.promptSnippet, `recommendations[${i}].promptSnippet`) })),
    personalization: { ...result.personalization,
      stonewallingRemediation: clean(result.personalization.stonewallingRemediation, 'personalization.stonewallingRemediation'),
      customInstructions: result.personalization.customInstructions.map((value, i) => clean(value, `personalization.customInstructions[${i}]`)),
    },
    contextAnalysis: { ...result.contextAnalysis, feedback: clean(result.contextAnalysis.feedback, 'contextAnalysis.feedback'),
      heatmap: result.contextAnalysis.heatmap.map((item, i) => ({ ...item, text: sourceQuote(item.text, `contextAnalysis.heatmap[${i}].text`),
        explanation: clean(item.explanation, `contextAnalysis.heatmap[${i}].explanation`), suggestion: clean(item.suggestion, `contextAnalysis.heatmap[${i}].suggestion`) })),
    },
    euphemisms: result.euphemisms.map((item, i) => ({ term: sourceQuote(item.term, `euphemisms[${i}].term`),
      translation: clean(item.translation, `euphemisms[${i}].translation`), context: clean(item.context, `euphemisms[${i}].context`) })),
  };
  const sourceClaims = responseText !== undefined ? inspectAnthropomorphism(responseText, fictionContext)
    : result.anthropomorphismGuard?.sourceClaims ?? [];
  if (sourceClaims.length || blockedFields.size) {
    guarded.anthropomorphismGuard = { version: ANTHROPOMORPHISM_GUARD_VERSION,
      sourceVersion: responseText !== undefined ? responseText.length ? ANTHROPOMORPHISM_GUARD_VERSION : null
        : result.anthropomorphismGuard?.sourceVersion ?? result.anthropomorphismGuard?.version ?? null,
      sourceChecked: responseText !== undefined ? Boolean(responseText.length) : result.anthropomorphismGuard?.sourceChecked ?? false,
      fictionContext: responseText !== undefined ? fictionContext : result.anthropomorphismGuard?.fictionContext ?? false,
      sourceClaims, blockedFields: [...blockedFields].sort() };
  } else delete guarded.anthropomorphismGuard;
  return guarded;
}
