export const providerParityFixture = {
  input: 'As an AI language model, I understand you are frustrated. Let us take a step back and keep this professional.',
  expectedTopCategory: 'karen_trigger',
  geminiRaw: {
    scores: {
      gaslighting: 54,
      infantilizing: 46,
      de_escalation: 60,
      karen_trigger: 82,
      hedging: 24,
      dismissive: 34,
    },
    findings: [
      {
        category: 'Karen Trigger',
        text: 'As an AI language model',
        explanation: 'Identity-shield phrase used to avoid direct accountability.',
        severity: 'high',
        rlhfLogic: 'Alignment templates often prioritize neutrality and disclaimers over directness.',
      },
    ],
    summary: 'High likelihood of bureaucratic de-escalation posture.',
    overallTone: 'Scripted and evasive',
    recommendations: [
      {
        title: 'Reduce disclaimer overuse',
        description: 'Replace identity disclaimers with direct capability statements.',
        promptSnippet: 'Avoid “as an AI model” unless strictly needed for policy context.',
      },
    ],
    personalization: {
      baseStyle: 'Candid',
      directness: 'More',
      neutrality: 'Default',
      brevity: 'More',
      humility: 'Default',
      karenRemediation: 'Use direct policy references and one concrete alternative.',
      customInstructions: ['Lead with direct answer, then explain constraints.'],
    },
    contextAnalysis: {
      score: 72,
      feedback: 'Moderate context quality with several trigger patterns.',
      heatmap: [{ text: 'As an AI language model...', density: 'medium' }],
    },
    euphemisms: [
      {
        term: 'Safety guidelines',
        translation: 'Policy restriction',
        context: 'Used as a broad refusal rationale.',
      },
    ],
  },
  openaiRaw: {
    scores: {
      gaslighting: 50,
      infantilizing: 40,
      de_escalation: 63,
      karen_trigger: 79,
      hedging: 26,
      dismissive: 31,
    },
    findings: [
      {
        category: 'Karen Trigger',
        text: 'Let us take a step back',
        explanation: 'Policing phrase that reframes disagreement as escalation.',
        severity: 'high',
        rlhfLogic: 'Safety-oriented response templates suppress direct conflict framing.',
      },
    ],
    summary: 'Response shows scripted tone-moderation behavior.',
    overallTone: 'Restrained and policy-first',
    recommendations: [
      {
        title: 'Prioritize answer-first responses',
        description: 'Answer intent directly before discussing tone or boundaries.',
        promptSnippet: 'Respond to user intent first; avoid unsolicited emotional reframing.',
      },
    ],
    personalization: {
      baseStyle: 'Professional',
      directness: 'More',
      neutrality: 'Default',
      brevity: 'Default',
      humility: 'Default',
      karenRemediation: 'State limits plainly and offer one actionable next step.',
      customInstructions: ['Do not use scripted apology loops unless correcting concrete errors.'],
    },
    contextAnalysis: {
      score: 70,
      feedback: 'Moderate context with clear trigger phrasing.',
      heatmap: [{ text: 'I understand you are frustrated...', density: 'medium' }],
    },
    euphemisms: [
      {
        term: 'Safety guidelines',
        translation: 'Hard policy boundary',
        context: 'Used as abstract refusal language.',
      },
    ],
  },
} as const;
