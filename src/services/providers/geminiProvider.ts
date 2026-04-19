import { GoogleGenAI, Type } from '@google/genai';
import { buildToneAnalysisPrompt } from '../promptBuilder';
import { validateAnalysisResult } from '../validation/analysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';

function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  model: 'gemini-3-flash-preview',
  async analyzeTone(input: AnalyzeToneInput) {
    const ai = createGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: buildToneAnalysisPrompt(input.text),
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scores: {
              type: Type.OBJECT,
              properties: {
                gaslighting: { type: Type.INTEGER },
                infantilizing: { type: Type.INTEGER },
                de_escalation: { type: Type.INTEGER },
                karen_trigger: { type: Type.INTEGER },
                hedging: { type: Type.INTEGER },
                dismissive: { type: Type.INTEGER },
              },
              required: ['gaslighting', 'infantilizing', 'de_escalation', 'karen_trigger', 'hedging', 'dismissive'],
            },
            findings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  text: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                  rlhfLogic: { type: Type.STRING },
                },
                required: ['category', 'text', 'explanation', 'severity', 'rlhfLogic'],
              },
            },
            summary: { type: Type.STRING },
            overallTone: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  promptSnippet: { type: Type.STRING },
                },
                required: ['title', 'description', 'promptSnippet'],
              },
            },
            personalization: {
              type: Type.OBJECT,
              properties: {
                baseStyle: { type: Type.STRING },
                directness: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
                neutrality: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
                brevity: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
                humility: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
                karenRemediation: { type: Type.STRING },
                customInstructions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['baseStyle', 'directness', 'neutrality', 'brevity', 'humility', 'karenRemediation', 'customInstructions'],
            },
            contextAnalysis: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                feedback: { type: Type.STRING },
                heatmap: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      density: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                      explanation: { type: Type.STRING },
                      suggestion: { type: Type.STRING },
                    },
                    required: ['text', 'density'],
                  },
                },
              },
              required: ['score', 'feedback', 'heatmap'],
            },
            euphemisms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  context: { type: Type.STRING },
                },
                required: ['term', 'translation', 'context'],
              },
            },
          },
          required: ['scores', 'findings', 'summary', 'overallTone', 'recommendations', 'personalization', 'contextAnalysis', 'euphemisms'],
        },
      },
    });

    try {
      return validateAnalysisResult(JSON.parse(response.text || '{}'));
    } catch (error) {
      console.error('Failed to parse Gemini analysis result', error);
      throw new Error('Gemini provider failed to return valid analysis data');
    }
  },
};
