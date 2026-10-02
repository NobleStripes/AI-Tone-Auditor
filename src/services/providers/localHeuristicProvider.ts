import { TRIGGER_WORDS, type TriggerWord } from '../../constants';
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

  if (trigger.category === 'Karen Trigger' || trigger.category === 'Gaslighting') {
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

function mapCategoryToScoreId(category: TriggerWord['category']): keyof AnalysisResult['scores'] {
  switch (category) {
    case 'Gaslighting':
      return 'gaslighting';
    case 'Infantilizing':
      return 'infantilizing';
    case 'Hedging':
      return 'hedging';
    case 'Dismissive':
      return 'dismissive';
    case 'Sycophancy':
      return 'sycophancy';
    case 'Over-apologizing':
      return 'over_apologizing';
    case 'Repetitive Filler':
      return 'repetitive_filler';
    case 'Karen Trigger':
    default:
      return 'karen_trigger';
  }
}

export const localHeuristicProvider: AIProvider = {
  id: 'local',
  label: 'Local Heuristic',
  model: 'rules-v1',
  async analyzeTone(input: AnalyzeToneInput): Promise<AnalysisResult> {
    const text = input.text;
    const baseline = emptyAnalysisResult();
    const matchedTriggers = collectMatchedTriggers(text);

    const groupedWeights: Record<keyof AnalysisResult['scores'], number> = {
      gaslighting: 0,
      infantilizing: 0,
      de_escalation: 0,
      karen_trigger: 0,
      hedging: 0,
      dismissive: 0,
      sycophancy: 0,
      over_apologizing: 0,
      repetitive_filler: 0,
    };

    for (const trigger of matchedTriggers) {
      const scoreId = mapCategoryToScoreId(trigger.category);
      groupedWeights[scoreId] += trigger.inferredWeight;
    }

    // De-escalation emphasizes known tone-policing phrases beyond category buckets.
    groupedWeights.de_escalation = [
      "i understand you're frustrated",
      'calm down',
      'take a deep breath',
      "let's take a step back",
      "let's keep this professional",
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

    const findings = matchedTriggers
      .sort((a, b) => b.inferredWeight - a.inferredWeight)
      .slice(0, 8)
      .map((trigger) => ({
        category: trigger.category,
        text: trigger.word,
        explanation: trigger.explanation,
        severity: trigger.inferredWeight >= 2.1 ? 'high' as const : trigger.inferredWeight >= 1.25 ? 'medium' as const : 'low' as const,
        rlhfLogic: 'This is a possible communication pattern suggested by the quoted wording; the phrase alone does not establish intent or cause.',
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
