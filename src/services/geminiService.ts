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
    rlhfLogic?: string; // New: Why This Response?
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
    warmth: 'More' | 'Default' | 'Less';
    enthusiasm: 'More' | 'Default' | 'Less';
    structure: 'More' | 'Default' | 'Less';
    emoji: 'More' | 'Default' | 'Less';
    karenRemediation: string; // New: Specific instruction to counter "Karen" triggers
  };
  contextAnalysis: {
    score: number; // 0-100
    feedback: string;
    heatmap: { 
      text: string; 
      density: 'low' | 'medium' | 'high';
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

export async function analyzeTone(text: string): Promise<AnalysisResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following AI-generated text for specific patterns of gaslighting, infantilizing, forced de-escalation, passive-aggressive "Karen" triggers, hedging, and dismissive language. 
    
    Text to analyze:
    "${text}"
    
    Categories to evaluate:
    - Gaslighting: Denying user reality, shifting blame, or making the user doubt their perception.
    - Infantilizing: Condescending tone, over-simplification, or treating the user like a child.
    - Forced De-escalation: Dismissive neutrality, tone-policing, or avoiding accountability through scripts (e.g., "I'm sorry you feel that way").
    - Karen Triggers: Passive-aggressive entitlement, bureaucratic stonewalling, or moralizing.
    - Hedging: Overuse of cautious or vague language to avoid commitment, accountability, or directness.
    - Dismissive Language: Brushing off user concerns as insignificant.

    In addition to the analysis, provide:
    1. 2-3 "AI Personality Tuning Tips" (text instructions). For each tip, include a "promptSnippet" which is a specific, copy-pasteable instruction the user can add to their system prompt or custom instructions to implement the fix.
    2. A "Personalization Profile" based on the ChatGPT 5.2 personalization settings. Include a "karenRemediation" field which is a specific, concise instruction to remediate the detected "Karen" persona (passive-aggressive entitlement, moralizing, etc.) based on the analysis.
    3. "Why This Response?": For each finding, explain the hidden RLHF (Reinforcement Learning from Human Feedback) safety-alignment logic that likely triggered this specific phrasing.
    4. "Contextual Heatmap": Evaluate the density of the input text. If it's short or vague, explain how this "low context" forces the AI to "guess" at safety, leading to preachy refusals. Provide a heatmap breakdown of the text. For segments identified as "low" density, provide an "explanation" of why it's low context and a "suggestion" on how to add more detail or clarity.
    5. "Sanitization Glossary": Identify "Evasive Euphemisms" (corporate-speak) used to avoid raw facts and translate them back into technical or direct terms.
    
    For the "baseStyle" in the personalization profile, choose one of these specific styles: Default, Professional, Friendly, Candid, Cynical, Nerdy, Efficient, Quirky.

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
                rlhfLogic: { type: Type.STRING, description: "The hidden safety-alignment logic behind this phrase" },
              },
              required: ['category', 'text', 'explanation', 'severity', 'rlhfLogic'],
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
                promptSnippet: { type: Type.STRING },
              },
              required: ['title', 'description', 'promptSnippet'],
            }
          },
          personalization: {
            type: Type.OBJECT,
            properties: {
              baseStyle: { type: Type.STRING },
              warmth: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
              enthusiasm: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
              structure: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
              emoji: { type: Type.STRING, enum: ['More', 'Default', 'Less'] },
              karenRemediation: { type: Type.STRING, description: "Instruction to remediate the detected Karen persona" },
            },
            required: ['baseStyle', 'warmth', 'enthusiasm', 'structure', 'emoji', 'karenRemediation'],
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
                    explanation: { type: Type.STRING, description: "Why this segment is considered low context (only for 'low' density)" },
                    suggestion: { type: Type.STRING, description: "How to improve this segment (only for 'low' density)" },
                  },
                  required: ['text', 'density'],
                }
              }
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
            }
          }
        },
        required: ['scores', 'findings', 'summary', 'overallTone', 'recommendations', 'personalization', 'contextAnalysis', 'euphemisms'],
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
