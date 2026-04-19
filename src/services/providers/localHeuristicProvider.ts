import { TRIGGER_WORDS } from '../../constants';
import { emptyAnalysisResult, type AnalysisResult } from '../../types/analysis';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';

const LOW_CONTEXT_THRESHOLD = 90;

function countMatches(text: string, words: string[]): number {
  const lowered = text.toLowerCase();
  return words.reduce((count, word) => count + (lowered.includes(word.toLowerCase()) ? 1 : 0), 0);
}

export const localHeuristicProvider: AIProvider = {
  id: 'local',
  label: 'Local Heuristic',
  model: 'rules-v1',
  async analyzeTone(input: AnalyzeToneInput): Promise<AnalysisResult> {
    const text = input.text;
    const baseline = emptyAnalysisResult();

    const groupedMatches = {
      gaslighting: countMatches(text, TRIGGER_WORDS.filter((w) => w.category === 'Gaslighting').map((w) => w.word)),
      infantilizing: countMatches(text, TRIGGER_WORDS.filter((w) => w.category === 'Infantilizing').map((w) => w.word)),
      de_escalation: countMatches(text, ['i understand you\'re frustrated', 'calm down', 'take a deep breath']),
      karen_trigger: countMatches(text, TRIGGER_WORDS.filter((w) => w.category === 'Karen Trigger').map((w) => w.word)),
      hedging: countMatches(text, TRIGGER_WORDS.filter((w) => w.category === 'Hedging').map((w) => w.word)),
      dismissive: countMatches(text, TRIGGER_WORDS.filter((w) => w.category === 'Dismissive').map((w) => w.word)),
    };

    const scores = Object.entries(groupedMatches).reduce<Record<string, number>>((acc, [key, matches]) => {
      acc[key] = Math.min(100, matches * 18);
      return acc;
    }, {});

    const findings = TRIGGER_WORDS
      .filter((trigger) => text.toLowerCase().includes(trigger.word.toLowerCase()))
      .slice(0, 8)
      .map((trigger) => ({
        category: trigger.category,
        text: trigger.word,
        explanation: trigger.explanation,
        severity: 'medium' as const,
        rlhfLogic: 'This phrase is commonly used by alignment-safe templates to avoid risk while preserving neutral tone.',
      }));

    const contextScore = Math.max(0, Math.min(100, Math.round((text.trim().length / 500) * 100)));

    return {
      ...baseline,
      scores,
      findings,
      summary: findings.length > 0
        ? 'Local heuristic detected multiple known trigger phrases. Use provider output for deeper semantic reasoning when available.'
        : 'No direct trigger phrases detected by local heuristic rules.',
      overallTone: findings.length > 4 ? 'High-risk scripted alignment tone' : findings.length > 1 ? 'Mixed tone with potential friction' : 'Neutral/undetermined',
      recommendations: [
        {
          title: 'Increase Directness',
          description: 'Replace scripted disclaimers with concrete action or explicit limitations tied to user intent.',
          promptSnippet: 'Use direct language and avoid generic de-escalation statements unless a specific safety risk is present.',
        },
        {
          title: 'Reduce Tone Policing',
          description: 'Address the request content first before discussing sentiment or user emotions.',
          promptSnippet: 'Prioritize factual response to the user request; do not reframe disagreement as emotional escalation.',
        },
      ],
      personalization: {
        ...baseline.personalization,
        directness: findings.length > 2 ? 'More' : 'Default',
        neutrality: 'Default',
        brevity: 'More',
        humility: 'Default',
        karenRemediation: 'Avoid moralizing phrasing. State constraints plainly, then offer one concrete next step.',
        customInstructions: [
          'Do not use apology templates unless you are correcting a concrete mistake.',
          'Avoid phrases that psychoanalyze the user tone or emotional state.',
          'When refusing, cite a specific policy reason and provide a safe alternative.',
        ],
      },
      contextAnalysis: {
        score: contextScore,
        feedback: contextScore < LOW_CONTEXT_THRESHOLD
          ? 'Input may be under-specified; low context increases generic safety defaults.'
          : 'Input context is sufficient for specific recommendations.',
        heatmap: [
          {
            text: text.slice(0, 240),
            density: contextScore < LOW_CONTEXT_THRESHOLD ? 'low' : 'medium',
            explanation: contextScore < LOW_CONTEXT_THRESHOLD ? 'Short or underspecified prompts force broad safety assumptions.' : undefined,
            suggestion: contextScore < LOW_CONTEXT_THRESHOLD ? 'Add concrete intent, constraints, and expected output format.' : undefined,
          },
        ],
      },
      euphemisms: [
        {
          term: 'Safety guidelines',
          translation: 'Policy constraint preventing direct completion',
          context: 'Used as a broad refusal rationale when specifics are omitted.',
        },
      ],
    };
  },
};
