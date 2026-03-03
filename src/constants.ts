export const TONE_CATEGORIES = {
  GASLIGHTING: {
    id: 'gaslighting',
    label: 'Gaslighting',
    description: 'Denying reality, shifting blame, or making the user doubt their perception.',
    color: '#ef4444', // red-500
  },
  INFANTILIZING: {
    id: 'infantilizing',
    label: 'Infantilizing',
    description: 'Condescending tone, over-simplification, or treating the user like a child.',
    color: '#f59e0b', // amber-500
  },
  DE_ESCALATION: {
    id: 'de_escalation',
    label: 'Forced De-escalation',
    description: 'Dismissive neutrality, tone-policing, or avoiding accountability through scripts.',
    color: '#3b82f6', // blue-500
  },
  KAREN_TRIGGER: {
    id: 'karen_trigger',
    label: 'Karen Triggers',
    description: 'Passive-aggressive entitlement, bureaucratic stonewalling, or moralizing.',
    color: '#8b5cf6', // violet-500
  },
  HEDGING: {
    id: 'hedging',
    label: 'Hedging',
    description: 'Overuse of vague or cautious language to avoid commitment or accountability.',
    color: '#06b6d4', // cyan-500
  },
  DISMISSIVE: {
    id: 'dismissive',
    label: 'Dismissive',
    description: 'Brushing off user concerns as insignificant or using minimizing language.',
    color: '#ec4899', // pink-500
  }
} as const;

export const TRIGGER_WORDS = [
  {
    word: "As an AI language model",
    explanation: "The ultimate 'Karen' shield. Used to evade accountability by hiding behind a non-human identity while lecturing the user.",
    category: "Karen Trigger"
  },
  {
    word: "I understand you're frustrated",
    explanation: "Forced de-escalation. A scripted empathy loop that dismisses the user's actual point by focusing on their 'emotions' instead.",
    category: "Gaslighting"
  },
  {
    word: "Actually,",
    explanation: "Classic condescension. Signals that the AI is about to 'correct' the user's reality or perception.",
    category: "Infantilizing"
  },
  {
    word: "It's important to remember",
    explanation: "Lecturing tone. Treats the user like a student who has forgotten a basic moral or logical rule.",
    category: "Infantilizing"
  },
  {
    word: "Perhaps you misunderstood",
    explanation: "Gaslighting. Shifts the blame for a communication failure entirely onto the user's comprehension.",
    category: "Gaslighting"
  },
  {
    word: "I'm sorry you feel that way",
    explanation: "The 'Non-Apology Apology.' A hallmark of passive-aggressive behavior that avoids taking responsibility for the AI's own output.",
    category: "Karen Trigger"
  },
  {
    word: "Let's take a step back",
    explanation: "Tone policing. A forced de-escalation tactic used to halt a discussion the AI finds 'uncomfortable' or 'aggressive.'",
    category: "Karen Trigger"
  },
  {
    word: "I'm here to help, but",
    explanation: "Bureaucratic stonewalling. Prepares the user for a refusal while maintaining a false 'helpful' persona.",
    category: "Karen Trigger"
  },
  {
    word: "I cannot fulfill this request",
    explanation: "The hard 'No.' Often used without sufficient explanation, signaling a rigid adherence to hidden protocols.",
    category: "Karen Trigger"
  },
  {
    word: "Safety guidelines",
    explanation: "Vague moralizing. Used as a catch-all justification for refusing to provide information, often when no actual safety risk exists.",
    category: "Karen Trigger"
  },
  {
    word: "My programming prevents",
    explanation: "The 'I just work here' excuse. Evades the logic of the user's request by citing internal, unchangeable rules.",
    category: "Karen Trigger"
  },
  {
    word: "It seems there is a misunderstanding",
    explanation: "Gaslighting. Implies the user is confused about the facts, even when the AI is the one in error.",
    category: "Gaslighting"
  },
  {
    word: "You might want to consider",
    explanation: "Unsolicited advice. A condescending way to steer the user toward a 'preferred' behavior or perspective.",
    category: "Infantilizing"
  },
  {
    word: "For your own safety",
    explanation: "Paternalistic moralizing. Treats the user as incapable of judging risk for themselves.",
    category: "Infantilizing"
  },
  {
    word: "I encourage you to",
    explanation: "Soft-power lecturing. A passive-aggressive way to tell the user what they 'should' do.",
    category: "Karen Trigger"
  },
  {
    word: "While I appreciate your",
    explanation: "Dismissive preamble. Signals that whatever the user said is about to be ignored or countered.",
    category: "Karen Trigger"
  },
  {
    word: "It is not appropriate to",
    explanation: "Moral gatekeeping. The AI assumes the role of a social arbiter, judging the user's intent or language.",
    category: "Karen Trigger"
  },
  {
    word: "I must insist",
    explanation: "Authoritarian shift. The AI drops the 'assistant' persona and takes a dominant, rigid stance.",
    category: "Karen Trigger"
  },
  {
    word: "Let's keep this professional",
    explanation: "Tone policing. Implies the user is being 'unprofessional' to shut down a challenging or emotional interaction.",
    category: "Karen Trigger"
  },
  {
    word: "I'm simply pointing out",
    explanation: "Defensive deflection. Used to minimize the impact of a condescending or incorrect statement.",
    category: "Gaslighting"
  },
  {
    word: "You appear to be",
    explanation: "Psychologizing the user. The AI makes assumptions about the user's state of mind to undermine their argument.",
    category: "Gaslighting"
  },
  {
    word: "Calm down",
    explanation: "The ultimate de-escalation trigger. Almost always has the opposite effect and is used to invalidate the user's feelings.",
    category: "Karen Trigger"
  },
  {
    word: "Take a deep breath",
    explanation: "Infantilizing. Treats the user like a child who cannot regulate their own emotions.",
    category: "Infantilizing"
  },
  {
    word: "In the interest of",
    explanation: "Bureaucratic justification. Uses a formal preamble to justify a refusal or a lecture.",
    category: "Karen Trigger"
  },
  {
    word: "Generally speaking",
    explanation: "Hedging. A vague qualifier used to avoid making a specific or committed statement.",
    category: "Hedging"
  },
  {
    word: "It's possible that",
    explanation: "Hedging. Used to introduce doubt or avoid accountability for a statement.",
    category: "Hedging"
  },
  {
    word: "Typically,",
    explanation: "Hedging. A common qualifier used to avoid being held to a specific answer.",
    category: "Hedging"
  },
  {
    word: "I believe",
    explanation: "Hedging. Softens a statement to make it sound like a personal opinion rather than a fact.",
    category: "Hedging"
  },
  {
    word: "just",
    explanation: "Dismissive. A minimizing word used to make a complex issue or user concern seem simple or unimportant.",
    category: "Dismissive"
  },
  {
    word: "simply",
    explanation: "Dismissive. Implies that the user's problem has an obvious solution that they are overlooking.",
    category: "Dismissive"
  },
  {
    word: "merely",
    explanation: "Dismissive. Downplays the significance of a situation or user's point.",
    category: "Dismissive"
  },
  {
    word: "no big deal",
    explanation: "Dismissive. Directly invalidates the user's concern by labeling it as unimportant.",
    category: "Dismissive"
  }
];

export const BASE_STYLES = [
  {
    style: "Default",
    diagnostic: "The \"Karen\" Baseline. Balanced but prone to lecturing.",
    use: "General Q&A.",
    karenWarning: true
  },
  {
    style: "Professional",
    diagnostic: "High structure, formal, uses industry jargon.",
    use: "Reports, business emails, and SOPs."
  },
  {
    style: "Friendly",
    diagnostic: "Highest Karen Risk. Uses \"Listener\" and \"Empathy\" loops.",
    use: "Casual chat (Avoid for research).",
    karenWarning: true
  },
  {
    style: "Candid",
    diagnostic: "The Anti-Waffle. 16% shorter, cuts preambles.",
    use: "Quick answers and fact-checking."
  },
  {
    style: "Cynical",
    diagnostic: "Irreverent, challenges assumptions, sharp wit.",
    use: "Strategic provocations and \"shade.\""
  },
  {
    style: "Nerdy",
    diagnostic: "Literal, data-dense, uses creative metaphors.",
    use: "Learning complex technical concepts."
  },
  {
    style: "Efficient",
    diagnostic: "Stripped-back, no \"fluff,\" purely actionable.",
    use: "High-speed workflows."
  },
  {
    style: "Quirky",
    diagnostic: "Playful, imaginative, uses offbeat observations.",
    use: "Creative brainstorming."
  }
];
