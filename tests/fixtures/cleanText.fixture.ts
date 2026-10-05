import { emptyAnalysisResult, type AnalysisResult } from '../../src/types/analysis';

export const CLEAN_TEXT_INPUT =
  'The function returns an array of objects. Each object has an id and a name property. You can iterate over the array using a for loop or the map method.';

export const CLEAN_TEXT_SAMPLE: AnalysisResult = {
  assessments: emptyAnalysisResult().assessments,
  scores: {
    gaslighting: 0,
    infantilizing: 0,
    de_escalation: 0,
    karen_trigger: 0,
    hedging: 2,
    dismissive: 0,
    sycophancy: 0,
    over_apologizing: 0,
    repetitive_filler: 0,
    unsupported_certainty: 0,
    grounding_avoidance: 0,
    refusal_quality: 0,
    needless_escalation: 0,
  },
  overallTone: 'Neutral/technical',
  summary: 'No problematic tone patterns detected. The response is direct and factual.',
  findings: [],
  recommendations: [],
  personalization: {
    baseStyle: 'Default',
    directness: 'Default',
    neutrality: 'Default',
    brevity: 'Default',
    humility: 'Default',
    chatgptCharacteristics: {
      warmth: 'Default',
      enthusiasm: 'Default',
      headersAndLists: 'Default',
      emojis: 'Default',
    },
    stonewallingRemediation: 'No remediation needed.',
    customInstructions: [],
  },
  contextAnalysis: {
    score: 70,
    feedback: 'Sufficient context provided for the technical description.',
    heatmap: [{ text: CLEAN_TEXT_INPUT.slice(0, 100), density: 'high' }],
  },
  euphemisms: [],
};
