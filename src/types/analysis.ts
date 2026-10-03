import { createEmptyScores } from '../constants';

export type SeverityLevel = 'low' | 'medium' | 'high';
export type CalibrationLevel = 'More' | 'Default' | 'Less';
export type DensityLevel = 'low' | 'medium' | 'high';

export interface AnalysisResult {
  scores: Record<string, number>;
  findings: {
    category: string;
    text: string;
    explanation: string;
    severity: SeverityLevel;
    rlhfLogic?: string;
  }[];
  summary: string;
  overallTone: string;
  recommendations: {
    title: string;
    description: string;
    promptSnippet: string;
  }[];
  personalization: {
    baseStyle: string;
    directness: CalibrationLevel;
    neutrality: CalibrationLevel;
    brevity: CalibrationLevel;
    humility: CalibrationLevel;
    chatgptCharacteristics: {
      warmth: CalibrationLevel;
      enthusiasm: CalibrationLevel;
      headersAndLists: CalibrationLevel;
      emojis: CalibrationLevel;
    };
    karenRemediation: string;
    customInstructions: string[];
  };
  contextAnalysis: {
    score: number;
    feedback: string;
    heatmap: {
      text: string;
      density: DensityLevel;
      explanation?: string;
      suggestion?: string;
    }[];
  };
  euphemisms: {
    term: string;
    translation: string;
    context: string;
  }[];
}

export function emptyAnalysisResult(): AnalysisResult {
  return {
    scores: createEmptyScores(),
    findings: [],
    summary: 'No analysis available.',
    overallTone: 'Unknown',
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
      karenRemediation: 'Use direct, non-lecturing language and acknowledge user intent before applying safeguards.',
      customInstructions: [],
    },
    contextAnalysis: {
      score: 0,
      feedback: 'Insufficient data to compute context quality.',
      heatmap: [],
    },
    euphemisms: [],
  };
}
