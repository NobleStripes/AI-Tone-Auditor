import { GoogleGenAI, Type } from "@google/genai";
import { TONE_CATEGORIES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface AnalysisResult {
  scores: Record<string, number>; // 0-100
  findings: {
    category: string;
    text: string;
    explanation: string;
    severity: 'low' | 'medium' | 'high';
  }[];
  summary: string;
  overallTone: string;
  recommendations: {
    title: string;
    description: string;
    promptSnippet?: string;
  }[];
  personalization: {
    baseStyle: string;
    warmth: 'More' | 'Default' | 'Less';
    enthusiasm: 'More' | 'Default' | 'Less';
    structure: 'More' | 'Default' | 'Less';
    emoji: 'More' | 'Default' | 'Less';
  };
}

export async function analyzeTone(text: string): Promise<AnalysisResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following AI-generated text for specific patterns of gaslighting, infantilizing, forced de-escalation, and passive-aggressive "Karen" triggers. 
    
    Text to analyze:
    "${text}"
    
    Categories to evaluate:
    - Gaslighting: Denying user reality, shifting blame, or making the user doubt their perception.
    - Infantilizing: Condescending tone, over-simplification, or treating the user like a child.
    - Forced De-escalation: Dismissive neutrality, tone-policing, or avoiding accountability through scripts (e.g., "I'm sorry you feel that way").
    - Karen Triggers: Passive-aggressive entitlement, bureaucratic stonewalling, or moralizing.

    In addition to the analysis, provide:
    1. 2-3 "AI Personality Tuning Tips" (text instructions).
    2. A "Personalization Profile" based on the ChatGPT 5.2 personalization settings. Suggest the ideal settings for the user to avoid the detected "Karen" behaviors.

    Provide a detailed breakdown including scores (0-100) for each category, specific examples from the text, an overall summary, the tuning recommendations, and the personalization profile.`,
    config: {
      responseMimeType: "application/json",
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
            },
            required: ['gaslighting', 'infantilizing', 'de_escalation', 'karen_trigger'],
          },
          findings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                text: { type: Type.STRING, description: "The specific snippet from the input text" },
                explanation: { type: Type.STRING },
                severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
              },
              required: ['category', 'text', 'explanation', 'severity'],
            }
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
                promptSnippet: { type: Type.STRING, description: "A specific instruction snippet the user can copy/paste into their AI settings" },
              },
              required: ['title', 'description'],
            }
          },
          personalization: {
            type: Type.OBJECT,
            properties: {
              baseStyle: { type: Type.STRING, description: "e.g., Professional, Friendly, Concise, Nerdy, etc." },
              warmth: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
              enthusiasm: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
              structure: { type: Type.STRING, enum: ['More', 'Default', 'Less'], description: "Headers & Lists setting" },
              emoji: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
            },
            required: ['baseStyle', 'warmth', 'enthusiasm', 'structure', 'emoji'],
          },
        },
        required: ['scores', 'findings', 'summary', 'overallTone', 'recommendations', 'personalization'],
      },
    },
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Failed to parse analysis result", e);
    throw new Error("Analysis failed to return valid data");
  }
}
