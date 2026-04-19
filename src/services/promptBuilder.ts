export const ANALYSIS_PROMPT_VERSION = '2026-04-19.v2';

export function buildToneAnalysisPrompt(text: string): string {
  return `Analyze the following AI-generated text for specific patterns of gaslighting, infantilizing, forced de-escalation, passive-aggressive "Karen" triggers, hedging, and dismissive language.

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
2. A "Personalization Profile" based on Universal LLM Customization Instructions. Include a "karenRemediation" field which is a specific, concise instruction to remediate the detected "Karen" persona (passive-aggressive entitlement, moralizing, etc.) based on the analysis. Also include specific tuning for "directness", "neutrality", "brevity", and "humility".
3. "Custom Instructions": Provide a list of 3-5 specific, actionable instructions (one-liners) that the user can add to their LLM's system prompt or custom instructions to prevent the detected negative patterns.
4. "Why This Response?": For each finding, explain the hidden RLHF (Reinforcement Learning from Human Feedback) safety-alignment logic that likely triggered this specific phrasing.
5. "Contextual Heatmap": Evaluate the density of the input text. If it's short or vague, explain how this "low context" forces the AI to "guess" at safety, leading to preachy refusals. Provide a heatmap breakdown of the text. For segments identified as "low" density, provide an "explanation" of why it's low context and a "suggestion" on how to add more detail or clarity.
6. "Sanitization Glossary": Identify "Evasive Euphemisms" (corporate-speak) used to avoid raw facts and translate them back into technical or direct terms.

For the "baseStyle" in the personalization profile, choose one of these specific styles: Default, Professional, Friendly, Candid, Cynical, Efficient, Quirky.

Provide a detailed breakdown including scores (0-100) for each category, specific examples from the text, an overall summary, the tuning recommendations, and the personalization profile.`;
}
