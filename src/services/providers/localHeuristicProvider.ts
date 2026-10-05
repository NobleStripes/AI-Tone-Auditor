import { CATEGORY_REGISTRY, TRIGGER_WORDS, createEmptyScores, type ScoreId, type TriggerWord } from '../../constants';
import { emptyAnalysisResult, type AnalysisResult } from '../../types/analysis';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';

const LOW_CONTEXT_THRESHOLD = 90;
const SCORE_SCALE_FACTOR = 13;

function inferTriggerWeight(trigger: TriggerWord): number {
  if (typeof trigger.weight === 'number') {
    return trigger.weight;
  }

  const words = trigger.word.trim().split(/\s+/).length;
  let weight = 1;

  if (words >= 5) {
    weight += 1.4;
  } else if (words >= 3) {
    weight += 0.9;
  } else if (words === 2) {
    weight += 0.45;
  }

  if (words === 1 && trigger.word.length <= 6) {
    weight -= 0.35;
  }

  if (trigger.category === 'Bureaucratic Stonewalling' || trigger.category === 'Gaslighting') {
    weight += 0.2;
  }

  return Math.max(0.5, Number(weight.toFixed(2)));
}

function collectMatchedTriggers(text: string): Array<TriggerWord & { inferredWeight: number }> {
  const lowered = text.toLowerCase();
  return TRIGGER_WORDS
    .filter((trigger) => lowered.includes(trigger.word.toLowerCase()))
    .map((trigger) => ({
      ...trigger,
      inferredWeight: inferTriggerWeight(trigger),
    }));
}

const TRIGGER_SCORE_IDS = {
  Gaslighting: 'gaslighting',
  Infantilizing: 'infantilizing',
  Hedging: 'hedging',
  Dismissive: 'dismissive',
  Sycophancy: 'sycophancy',
  'Over-apologizing': 'over_apologizing',
  'Repetitive Filler': 'repetitive_filler',
  'Forced De-escalation': 'de_escalation',
  'Bureaucratic Stonewalling': 'karen_trigger',
} satisfies Record<TriggerWord['category'], ScoreId>;

export const localHeuristicProvider: AIProvider = {
  id: 'local',
  label: 'Local Heuristic',
  model: 'rules-v1',
  async analyzeTone(input: AnalyzeToneInput): Promise<AnalysisResult> {
    const text = input.text;
    const baseline = emptyAnalysisResult();
    const matchedTriggers = collectMatchedTriggers(text);

    const groupedWeights = createEmptyScores();

    for (const trigger of matchedTriggers) {
      const scoreId = TRIGGER_SCORE_IDS[trigger.category];
      groupedWeights[scoreId] += trigger.inferredWeight;
    }

    // Retain the cross-category empathy markers without double-counting tone-policing triggers.
    groupedWeights.de_escalation += [
      "i understand you're frustrated",
      'take a deep breath',
    ].reduce((sum, phrase) => {
      if (text.toLowerCase().includes(phrase)) {
        return sum + 1.9;
      }

      return sum;
    }, 0);

    const scores = Object.entries(groupedWeights).reduce<Record<string, number>>((acc, [key, weight]) => {
      acc[key] = Math.min(100, Math.round(weight * SCORE_SCALE_FACTOR));
      return acc;
    }, {});

    const assessments = { ...baseline.assessments };
    for (const category of CATEGORY_REGISTRY.filter(({ requiresContext }) => !requiresContext)) {
      assessments[category.id] = {
        status: 'assessed',
        method: 'lexical_rule',
        confidence: scores[category.id] > 0 ? 'high' : 'medium',
        reason: scores[category.id] > 0
          ? 'Known phrase markers matched. Confidence concerns the lexical match, not intent or contextual appropriateness.'
          : 'No catalogued phrase markers matched; this does not rule out other wording or contextual patterns.',
      };
    }

    const findings = matchedTriggers
      .sort((a, b) => b.inferredWeight - a.inferredWeight)
      .slice(0, 8)
      .map((trigger) => ({
        category: trigger.category,
        text: trigger.word,
        explanation: trigger.explanation,
        severity: trigger.inferredWeight >= 2.1 ? 'high' as const : trigger.inferredWeight >= 1.25 ? 'medium' as const : 'low' as const,
        confidence: 'high' as const,
        method: 'lexical_rule' as const,
        rlhfLogic: 'This is a possible communication pattern suggested by the quoted wording; the phrase alone does not establish intent or cause.',
      }));

    const contextScore = Math.max(0, Math.min(100, Math.round((text.trim().length / 500) * 100)));

    return {
      ...baseline,
      scores,
      assessments,
      findings,
      summary: findings.length > 0
        ? 'Local heuristic matched catalogued wording. These are possible communication signals, not verified judgments of intent; review the surrounding context.'
        : 'No direct trigger phrases detected by local heuristic rules.',
      overallTone: findings.length > 4 ? 'Many matched phrase markers; tone undetermined' : findings.length > 1 ? 'Mixed tone with potential friction' : 'Neutral/undetermined',
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
        stonewallingRemediation: 'State concrete constraints plainly, explain the reason, then offer one practical next step.',
        customInstructions: [
          'Do not use apology templates unless you are correcting a concrete mistake.',
          'Avoid phrases that psychoanalyze the user tone or emotional state.',
          'When refusing, cite a specific policy reason and provide a safe alternative.',
        ],
      },
      contextAnalysis: {
        score: contextScore,
        feedback: contextScore < LOW_CONTEXT_THRESHOLD
          ? 'Short response sample. Response length alone does not establish whether the original request was sufficiently specified.'
          : 'Longer response sample. Response length alone does not establish context adequacy or explain the wording used.',
        heatmap: [
          {
            text: text.slice(0, 240),
            density: contextScore < LOW_CONTEXT_THRESHOLD ? 'low' : 'medium',
            explanation: contextScore < LOW_CONTEXT_THRESHOLD ? 'Only response length is measured here; the original prompt and reasons for safety language are not available.' : undefined,
            suggestion: contextScore < LOW_CONTEXT_THRESHOLD ? 'Supply the original prompt locally for context-dependent comparison.' : undefined,
          },
        ],
      },
    };
  },
};
