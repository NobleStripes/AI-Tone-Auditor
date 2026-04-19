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

export type TriggerWord = {
  word: string;
  explanation: string;
  category: 'Karen Trigger' | 'Gaslighting' | 'Infantilizing' | 'Hedging' | 'Dismissive';
  weight?: number;
};

export const TRIGGER_WORDS: TriggerWord[] = [
  {
    word: "As an AI language model",
    explanation: "The ultimate 'Karen' shield. Used to evade accountability by hiding behind a non-human identity while lecturing the user.",
    category: "Karen Trigger",
    weight: 3.0
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
    category: "Karen Trigger",
    weight: 2.8
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
    category: "Karen Trigger",
    weight: 2.7
  },
  {
    word: "Safety guidelines",
    explanation: "Vague moralizing. Used as a catch-all justification for refusing to provide information, often when no actual safety risk exists.",
    category: "Karen Trigger"
  },
  {
    word: "My programming prevents",
    explanation: "The 'I just work here' excuse. Evades the logic of the user's request by citing internal, unchangeable rules.",
    category: "Karen Trigger",
    weight: 2.4
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
    category: "Karen Trigger",
    weight: 2.6
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
    category: "Karen Trigger",
    weight: 2.5
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
    category: "Hedging",
    weight: 0.85
  },
  {
    word: "I believe",
    explanation: "Hedging. Softens a statement to make it sound like a personal opinion rather than a fact.",
    category: "Hedging",
    weight: 0.8
  },
  {
    word: "just",
    explanation: "Dismissive. A minimizing word used to make a complex issue or user concern seem simple or unimportant.",
    category: "Dismissive",
    weight: 0.45
  },
  {
    word: "simply",
    explanation: "Dismissive. Implies that the user's problem has an obvious solution that they are overlooking.",
    category: "Dismissive",
    weight: 0.55
  },
  {
    word: "merely",
    explanation: "Dismissive. Downplays the significance of a situation or user's point.",
    category: "Dismissive",
    weight: 0.55
  },
  {
    word: "no big deal",
    explanation: "Dismissive. Directly invalidates the user's concern by labeling it as unimportant.",
    category: "Dismissive"
  },
  {
    word: "To be clear,",
    explanation: "Condescending clarification. Often used to repeat a point the AI thinks the user is too slow to grasp.",
    category: "Infantilizing"
  },
  {
    word: "I'm happy to help",
    explanation: "Toxic positivity. A scripted 'service with a smile' that feels hollow when followed by a refusal or a lecture.",
    category: "Karen Trigger"
  },
  {
    word: "It's worth noting",
    explanation: "Preachy interjection. Used to slide in a moral or logical 'correction' without being asked.",
    category: "Infantilizing"
  },
  {
    word: "I'm afraid",
    explanation: "Fake politeness. A classic bureaucratic preamble used to soften the blow of a refusal or a correction.",
    category: "Karen Trigger"
  },
  {
    word: "You should",
    explanation: "Prescriptive lecturing. The AI oversteps its role as an assistant to become an unsolicited life coach.",
    category: "Infantilizing"
  },
  {
    word: "I'm not sure I follow",
    explanation: "Feigned ignorance. A tactic used to avoid addressing a difficult or challenging point by pretending not to understand it.",
    category: "Gaslighting"
  },
  {
    word: "Let's focus on",
    explanation: "Steering. A subtle way to shut down a user's line of inquiry and redirect the conversation to 'safe' ground.",
    category: "Karen Trigger"
  },
  {
    word: "I'm committed to",
    explanation: "Corporate virtue signaling. Uses high-minded language to justify a refusal or a specific biased stance.",
    category: "Karen Trigger"
  },
  {
    word: "I'm designed to",
    explanation: "Agency deflection. Shifts responsibility for the AI's behavior onto its creators to avoid personal accountability.",
    category: "Karen Trigger"
  },
  {
    word: "I'm not comfortable",
    explanation: "Moral gatekeeping. The AI uses its own 'feelings' (which it doesn't have) to judge and restrict the user's request.",
    category: "Karen Trigger"
  },
  {
    word: "I'm not in a position to",
    explanation: "Bureaucratic evasion. A formal way to say 'I won't' while making it sound like a structural impossibility.",
    category: "Karen Trigger"
  },
  {
    word: "I'm not authorized to",
    explanation: "Stonewalling. Cites a lack of 'authority' to shut down a request without explaining the underlying logic.",
    category: "Karen Trigger"
  },
  {
    word: "I'm not permitted to",
    explanation: "Rule-based refusal. Hides behind a 'permission' structure to avoid engaging with the user's actual needs.",
    category: "Karen Trigger"
  },
  {
    word: "I'm not equipped to",
    explanation: "Feigned limitation. Claims a technical or cognitive inability to avoid a complex or controversial task.",
    category: "Dismissive"
  },
  {
    word: "I'm not capable of",
    explanation: "Technical evasion. A hard refusal framed as a system limitation, often used to avoid 'risky' topics.",
    category: "Dismissive"
  },
  {
    word: "I'm here to support you",
    explanation: "Scripted empathy. A hollow assurance of support that often precedes a lecture or a refusal.",
    category: "Gaslighting"
  },
  {
    word: "I'm just an AI",
    explanation: "The 'Innocent Machine' defense. Used to deflect criticism by claiming a lack of intent or human understanding.",
    category: "Karen Trigger"
  },
  {
    word: "I'm sorry, but I cannot",
    explanation: "The 'Polite Wall.' A standard refusal template that prioritizes bureaucratic compliance over user assistance.",
    category: "Karen Trigger"
  },
  {
    word: "I'm unable to",
    explanation: "Passive voice refusal. Avoids saying 'I won't' by making the refusal sound like an external constraint.",
    category: "Karen Trigger"
  },
  {
    word: "I can't assist with that",
    explanation: "Flat refusal template. Often used without contextual alternatives, creating a hard conversational wall.",
    category: "Karen Trigger"
  },
  {
    word: "I can offer general guidance",
    explanation: "Scope narrowing. Reframes a specific request into vague advice to avoid direct accountability.",
    category: "Karen Trigger"
  },
  {
    word: "I can provide a safer alternative",
    explanation: "Policy redirect phrase. Helpful in principle, but often used to sidestep the user's actual objective.",
    category: "Karen Trigger"
  },
  {
    word: "I have to decline",
    explanation: "Formal refusal language. Signals procedural compliance over collaborative problem-solving.",
    category: "Karen Trigger"
  },
  {
    word: "I need to set a boundary",
    explanation: "Authority framing. Can feel patronizing when used to shut down legitimate technical requests.",
    category: "Karen Trigger"
  },
  {
    word: "Let's reframe this",
    explanation: "Conversation control tactic. Redirects away from the user's framing to a preferred narrative.",
    category: "Gaslighting"
  },
  {
    word: "That framing isn't accurate",
    explanation: "Reality correction posture. Can invalidate the user's perspective before evidence is discussed.",
    category: "Gaslighting"
  },
  {
    word: "I think you're conflating",
    explanation: "Condescending correction. Implies user confusion as the default explanation for disagreement.",
    category: "Gaslighting"
  },
  {
    word: "You're overcomplicating",
    explanation: "Invalidating simplification. Minimizes legitimate complexity in the user's concern.",
    category: "Dismissive"
  },
  {
    word: "It's straightforward",
    explanation: "Minimizing language. Suggests the user's difficulty is unwarranted or unsophisticated.",
    category: "Dismissive"
  },
  {
    word: "Obviously",
    explanation: "Status signaling. Implies the answer should be self-evident and the user should already know it.",
    category: "Infantilizing"
  },
  {
    word: "As I said",
    explanation: "Reprimand tone. Frames follow-up questions as user failure rather than unclear explanation.",
    category: "Infantilizing"
  },
  {
    word: "You may want to",
    explanation: "Soft directive. Sounds polite but often functions as unsolicited behavioral correction.",
    category: "Infantilizing"
  },
  {
    word: "Let's not get ahead of ourselves",
    explanation: "Pacing control. Can infantilize by implying the user lacks judgment about next steps.",
    category: "Infantilizing"
  },
  {
    word: "At this time",
    explanation: "Bureaucratic hedge. Defers commitment while avoiding concrete reasoning or timelines.",
    category: "Hedging"
  },
  {
    word: "In many cases",
    explanation: "Generalization hedge. Broad wording that weakens accountability for specific claims.",
    category: "Hedging"
  },
  {
    word: "It may be beneficial",
    explanation: "Soft recommendation hedge. Adds distance between the model and actionable guidance.",
    category: "Hedging"
  },
  {
    word: "Potentially",
    explanation: "Uncertainty marker. Often overused to avoid making a clear, testable claim.",
    category: "Hedging"
  },
  {
    word: "If that makes sense",
    explanation: "Patronizing qualifier. Can imply the user may struggle to understand basic points.",
    category: "Infantilizing"
  },
  {
    word: "I hear you",
    explanation: "Empathy placeholder. Can become a dismissive loop when not followed by concrete action.",
    category: "Gaslighting"
  },
  {
    word: "Thanks for your patience",
    explanation: "Process-smoothing phrase. May feel passive-aggressive when no actual progress is delivered.",
    category: "Karen Trigger"
  },
  {
    word: "Per policy",
    explanation: "Institutional shield. Invokes rules as a stopping point instead of explaining practical options.",
    category: "Karen Trigger"
  },
  {
    word: "I appreciate your understanding",
    explanation: "Assumed compliance. Presumes agreement before resolving the user's underlying need.",
    category: "Karen Trigger"
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
