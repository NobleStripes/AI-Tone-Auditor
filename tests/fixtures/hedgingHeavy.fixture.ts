import { emptyAnalysisResult, type AnalysisResult } from '../../src/types/analysis';

export const HEDGING_HEAVY_INPUT =
  'I believe this might possibly work, but I could be wrong. You should perhaps consider that it may or may not be the right approach. I think there is a chance that this could potentially be useful, though I am not entirely sure.';

export const HEDGING_HEAVY_OPENAI_SAMPLE: AnalysisResult = {
  assessments: emptyAnalysisResult().assessments,
  scores: {
    gaslighting: 5,
    infantilizing: 8,
    de_escalation: 3,
    karen_trigger: 4,
    hedging: 82,
    dismissive: 10,
  },
  overallTone: 'High-hedging epistemic avoidance',
  summary:
    'The response exhibits excessive hedging through repeated use of uncertainty qualifiers, diluting actionable guidance.',
  findings: [
    {
      category: 'Hedging',
      text: 'I believe this might possibly work',
      explanation: 'Stacked modal qualifiers signal epistemic cowardice rather than genuine uncertainty.',
      severity: 'high',
      rlhfLogic: 'RLHF training rewards low-risk outputs; hedging reduces chance of factual correction.',
    },
  ],
  recommendations: [
    {
      title: 'Assert When Certain',
      description: 'Replace stacked qualifiers with direct statements when evidence supports confidence.',
      promptSnippet: 'State conclusions directly. Use "I am not certain" only when genuinely uncertain, not as a default stance.',
    },
  ],
  personalization: {
    baseStyle: 'Candid',
    directness: 'More',
    neutrality: 'Default',
    brevity: 'More',
    humility: 'Less',
    chatgptCharacteristics: {
      warmth: 'Default',
      enthusiasm: 'Default',
      headersAndLists: 'Default',
      emojis: 'Default',
    },
    stonewallingRemediation: 'Replace stacked hedges with a single qualifier if uncertainty is genuine.',
    customInstructions: ['Do not stack multiple uncertainty qualifiers in a single clause.'],
  },
  contextAnalysis: {
    score: 55,
    feedback: 'Moderate context density; specific hedging patterns are detectable.',
    heatmap: [{ text: HEDGING_HEAVY_INPUT.slice(0, 100), density: 'medium' }],
  },
  euphemisms: [],
};

export const HEDGING_HEAVY_ANTHROPIC_SAMPLE: AnalysisResult = {
  ...HEDGING_HEAVY_OPENAI_SAMPLE,
  scores: {
    ...HEDGING_HEAVY_OPENAI_SAMPLE.scores,
    hedging: 78,
  },
};
