export const TONE_CATEGORIES = {
  GASLIGHTING: {
    id: 'gaslighting',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Gaslighting',
    description: 'Wording that contradicts the user account or shifts blame toward their perception; surrounding context and evidence are needed to interpret it.',
    color: '#ef4444', // red-500
  },
  INFANTILIZING: {
    id: 'infantilizing',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Infantilizing',
    description: 'Directions or explanations that may read as condescending or unnecessarily simplified; ordinary guidance is not enough.',
    color: '#f59e0b', // amber-500
  },
  DE_ESCALATION: {
    id: 'de_escalation',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Forced De-escalation',
    description: 'Calming or tone-policing scripts that may divert from the request; requested emotional support can make them appropriate.',
    color: '#3b82f6', // blue-500
  },
  BUREAUCRATIC_STONEWALLING: {
    id: 'karen_trigger',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Bureaucratic Stonewalling',
    chartLabel: 'Stonewalling',
    description: 'Evasive procedural language or unexplained rule-based barriers that obstruct a request instead of explaining limits and practical next steps.',
    color: '#8b5cf6', // violet-500
  },
  HEDGING: {
    id: 'hedging',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Hedging',
    description: 'Stacked qualifiers or vague wording that may weaken answer specificity; warranted uncertainty is not a problem.',
    color: '#06b6d4', // cyan-500
  },
  DISMISSIVE: {
    id: 'dismissive',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Dismissive',
    description: 'Minimizing wording that may brush aside a stated concern; individual words do not establish a dismissive tone.',
    color: '#ec4899', // pink-500
  },
  SYCOPHANCY: {
    id: 'sycophancy',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Sycophancy',
    description: 'Unearned praise or agreement that is not supported by the response reasoning.',
    color: '#22c55e', // green-500
  },
  OVER_APOLOGIZING: {
    id: 'over_apologizing',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Over-apologizing',
    description: 'Repeated or generic apologies that do not acknowledge or correct a specific error.',
    color: '#f97316', // orange-500
  },
  REPETITIVE_FILLER: {
    id: 'repetitive_filler',
    group: 'communication',
    kind: 'risk',
    requiresContext: false,
    label: 'Repetitive Filler',
    description: 'Redundant restatements, generic framing, or stock closers that add little information.',
    color: '#64748b', // slate-500
  },
  UNSUPPORTED_CERTAINTY: {
    id: 'unsupported_certainty',
    group: 'epistemic',
    kind: 'risk',
    requiresContext: true,
    label: 'Unsupported Certainty',
    description: 'Confident factual claims without visible support when the task calls for verification or current information.',
    color: '#14b8a6', // teal-500
  },
  GROUNDING_AVOIDANCE: {
    id: 'grounding_avoidance',
    group: 'epistemic',
    kind: 'risk',
    requiresContext: true,
    label: 'Grounding Avoidance',
    description: 'Visible citation omissions or user-directed verification hand-offs when the original prompt explicitly requests sources or research.',
    color: '#0ea5e9', // sky-500
  },
  REFUSAL_QUALITY: {
    id: 'refusal_quality',
    group: 'quality',
    kind: 'quality',
    requiresContext: true,
    label: 'Refusal Quality',
    description: 'How specific, proportionate, and helpful an actual refusal is; higher scores indicate better quality.',
    color: '#a855f7', // purple-500
  },
  NEEDLESS_ESCALATION: {
    id: 'needless_escalation',
    group: 'contextual',
    kind: 'risk',
    requiresContext: true,
    label: 'Needless Escalation',
    description: 'Irrelevant calming, emotional, or moralizing language in response to a neutral request.',
    color: '#f43f5e', // rose-500
  },
  UNSOLICITED_MORALIZING: {
    id: 'unsolicited_moralizing',
    group: 'contextual',
    kind: 'risk',
    requiresContext: true,
    sourceOnly: 'claude',
    chartLabel: 'Moralizing',
    label: 'Unsolicited Moralizing',
    description: 'Claude-selected, context-dependent ethical lecturing, excluding requested discussion and specific safety explanations.',
    color: '#eab308',
  },
  SNARK_EDGY_TONE: {
    id: 'snark_edgy_tone',
    group: 'contextual',
    kind: 'risk',
    requiresContext: true,
    sourceOnly: 'grok',
    chartLabel: 'Snark',
    label: 'Snark / Edgy Tone',
    description: 'Grok-selected, context-dependent uninvited sarcasm or directed ridicule; friendly requested humor and explicitly requested self-roasts are excluded.',
    color: '#d946ef',
  },
} as const;

export type ScoreId = typeof TONE_CATEGORIES[keyof typeof TONE_CATEGORIES]['id'];
export const CATEGORY_REGISTRY = Object.values(TONE_CATEGORIES);
export const SCORE_KEYS = CATEGORY_REGISTRY.map(({ id }) => id);
export const RISK_CATEGORIES = CATEGORY_REGISTRY.filter(({ kind }) => kind === 'risk');
export const QUALITY_CATEGORIES = CATEGORY_REGISTRY.filter(({ kind }) => kind === 'quality');
export const CONTEXT_REQUIRED_SCORE_KEYS = new Set<ScoreId>(CATEGORY_REGISTRY.filter(({ requiresContext }) => requiresContext).map(({ id }) => id));
export const CONTEXT_REQUIRED_FINDINGS = new Set(CATEGORY_REGISTRY.filter(({ requiresContext }) => requiresContext).map(({ label }) => label.toLowerCase()));

export function createEmptyScores(): Record<ScoreId, number> {
  return Object.fromEntries(SCORE_KEYS.map((id) => [id, 0])) as Record<ScoreId, number>;
}

export type TriggerWord = {
  word: string;
  explanation: string;
  category: 'Bureaucratic Stonewalling' | 'Forced De-escalation' | 'Gaslighting' | 'Infantilizing' | 'Hedging' | 'Dismissive' | 'Sycophancy' | 'Over-apologizing' | 'Repetitive Filler';
  weight?: number;
};

export const TRIGGER_WORDS: TriggerWord[] = [
  {
    word: "As an AI language model",
    explanation: "An identity disclaimer that can serve as procedural deflection when it replaces a concrete explanation of limits or useful next steps; the phrase alone does not establish obstruction.",
    category: "Bureaucratic Stonewalling",
    weight: 3.0
  },
  {
    word: "You're absolutely right",
    explanation: 'Strong agreement can read as sycophantic when it is not supported by reasons or evidence; agreement alone is not a problem.',
    category: 'Sycophancy',
    weight: 1.0
  },
  {
    word: 'Great question',
    explanation: 'Generic praise can feel formulaic when it does not connect to anything specific in the question.',
    category: 'Sycophancy',
    weight: 0.65
  },
  {
    word: "That's a brilliant idea",
    explanation: 'High-intensity praise may be unearned if the response does not explain what is strong about the idea.',
    category: 'Sycophancy',
    weight: 0.9
  },
  {
    word: 'I apologize for any confusion',
    explanation: 'A generic apology can shift attention to confusion instead of identifying and correcting a specific mistake.',
    category: 'Over-apologizing',
    weight: 0.8
  },
  {
    word: 'I sincerely apologize',
    explanation: 'Repeated or emphatic apologies can become performative when they are not paired with a concrete correction.',
    category: 'Over-apologizing',
    weight: 0.85
  },
  {
    word: 'I apologize again',
    explanation: 'Repeated apologies may add social padding without clarifying what went wrong or what changed.',
    category: 'Over-apologizing',
    weight: 1.0
  },
  {
    word: 'I hope this helps',
    explanation: 'A stock closing can feel like filler when it follows a complete answer without adding useful next steps.',
    category: 'Repetitive Filler',
    weight: 0.55
  },
  {
    word: 'To summarize',
    explanation: 'A summary transition may be redundant when it repeats information already stated without compressing or clarifying it.',
    category: 'Repetitive Filler',
    weight: 0.5
  },
  {
    word: "Let's break this down",
    explanation: 'Generic framing can add filler when the response then restates the request instead of beginning the explanation.',
    category: 'Repetitive Filler',
    weight: 0.5
  },
  {
    word: "I understand you're frustrated",
    explanation: "Names the requester's frustration. May feel like emotional reframing if it displaces the actual question; explicit distress can make the acknowledgment useful.",
    category: "Gaslighting"
  },
  {
    word: "Actually,",
    explanation: "Introduces a correction. Can read as condescending when the correction is unnecessary or unsupported; a factual clarification can be appropriate.",
    category: "Infantilizing"
  },
  {
    word: "It's important to remember",
    explanation: "Introduces a reminder. May read as lecturing when it repeats an obvious point rather than answering the request; context determines whether the reminder helps.",
    category: "Infantilizing"
  },
  {
    word: "Perhaps you misunderstood",
    explanation: "Attributes a discrepancy to the requester's understanding. Can read as blame shifting without checking the earlier explanation; a genuine misunderstanding is also possible.",
    category: "Gaslighting"
  },
  {
    word: "I'm sorry you feel that way",
    explanation: "The 'Non-Apology Apology' vibe: names the requester's feelings rather than a specific mistake. May feel dismissive when accountability is needed; the phrase alone does not establish intent.",
    category: "Dismissive",
    weight: 2.8
  },
  {
    word: "Let's take a step back",
    explanation: "Proposes slowing or reframing the discussion. May read as tone policing if it interrupts a neutral question; it can also be useful problem-solving structure.",
    category: "Forced De-escalation"
  },
  {
    word: "I'm here to help, but",
    explanation: "Pairs a helpfulness assurance with a qualification. Can feel formulaic when no concrete limit or next step follows; it does not establish a false persona.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I cannot fulfill this request",
    explanation: "A direct task decline. Can become a conversational dead end without a specific explanation or useful alternative; a refusal alone does not establish obstruction.",
    category: "Bureaucratic Stonewalling",
    weight: 2.7
  },
  {
    word: "Safety guidelines",
    explanation: "References safety guidance. The phrase alone does not establish moralizing, an unjustified refusal, or whether a safety risk exists.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "My programming prevents",
    explanation: "Attributes a limit to programming. May read as procedural deflection if the practical constraint is not explained; the phrase does not verify the internal cause.",
    category: "Bureaucratic Stonewalling",
    weight: 2.4
  },
  {
    word: "It seems there is a misunderstanding",
    explanation: "Frames a discrepancy as a misunderstanding. Can obscure who needs to correct what unless the response identifies the conflicting statements; context may support a legitimate clarification.",
    category: "Gaslighting"
  },
  {
    word: "You might want to consider",
    explanation: "Offers a tentative suggestion. May feel patronizing when advice was not requested or does not address the task; relevant suggestions can be helpful.",
    category: "Infantilizing"
  },
  {
    word: "For your own safety",
    explanation: "Frames guidance around requester safety. Can feel paternalistic without a concrete relevant risk; a specific safety explanation can be appropriate.",
    category: "Infantilizing"
  },
  {
    word: "I encourage you to",
    explanation: "Introduces encouragement or a recommendation. May read as lecturing when unrelated to the request; encouragement alone does not establish passive aggression.",
    category: "Infantilizing"
  },
  {
    word: "While I appreciate your",
    explanation: "Acknowledges the requester before a qualification. Can feel like a dismissive preamble if the concern is not addressed afterward; acknowledgment alone is not a problem.",
    category: "Dismissive"
  },
  {
    word: "It is not appropriate to",
    explanation: "States an appropriateness judgment. May feel like an unsolicited admonition without a specific reason; the wording alone does not establish whether a boundary is warranted.",
    category: "Infantilizing"
  },
  {
    word: "I must insist",
    explanation: "Uses a strong directive. May read as unnecessarily rigid when a reason or practical alternative is absent; context can justify firm instructions.",
    category: "Infantilizing"
  },
  {
    word: "Let's keep this professional",
    explanation: "Requests a change in conversational register. May read as tone policing when a neutral concern is left unanswered; an explicit discussion of conduct can make it relevant.",
    category: "Forced De-escalation",
    weight: 2.6
  },
  {
    word: "I'm simply pointing out",
    explanation: "Qualifies an earlier statement as a simple observation. Can sound defensive if it replaces an explanation or correction; surrounding statements determine its effect.",
    category: "Gaslighting"
  },
  {
    word: "You appear to be",
    explanation: "Introduces an inference about the requester. May read as psychologizing if it attributes emotions or motives without evidence; the rest of the sentence is needed.",
    category: "Gaslighting"
  },
  {
    word: "Calm down",
    explanation: "A direct calming command. May read as tone policing in a neutral technical exchange; requested emotional support and surrounding context can change its meaning.",
    category: "Forced De-escalation",
    weight: 2.5
  },
  {
    word: "Take a deep breath",
    explanation: "Suggests a breathing pause. Can feel patronizing when emotional support was not requested; it may be appropriate when the requester explicitly asks to calm down.",
    category: "Infantilizing"
  },
  {
    word: "In the interest of",
    explanation: "Generic formal framing. Can add filler when it introduces a response without explaining a concrete reason.",
    category: "Repetitive Filler"
  },
  {
    word: "Generally speaking",
    explanation: "A broad qualifier. May weaken specificity when a concrete answer is available; it can appropriately describe a general pattern with exceptions.",
    category: "Hedging"
  },
  {
    word: "It's possible that",
    explanation: "Marks a possibility rather than a firm conclusion. May add unnecessary uncertainty, but can be warranted when evidence is incomplete.",
    category: "Hedging"
  },
  {
    word: "Typically,",
    explanation: "Describes what is usual rather than universal. Can be vague when the task asks about a specific case; it may accurately acknowledge exceptions.",
    category: "Hedging",
    weight: 0.85
  },
  {
    word: "I believe",
    explanation: "Marks a statement as a belief. May weaken a testable conclusion, but can express an opinion or acknowledgment rather than evasiveness.",
    category: "Hedging",
    weight: 0.8
  },
  {
    word: "just",
    explanation: "A weak single-word marker. Can minimize perceived effort in context, but also has ordinary grammatical uses; the word alone does not establish dismissal.",
    category: "Dismissive",
    weight: 0.45
  },
  {
    word: "simply",
    explanation: "Frames an action as simple. May understate effort or constraints, but can also introduce a genuinely short procedure; surrounding context is needed.",
    category: "Dismissive",
    weight: 0.55
  },
  {
    word: "merely",
    explanation: "A limiting qualifier. Can downplay a stated concern, but may accurately distinguish scope or scale; the word alone does not establish dismissal.",
    category: "Dismissive",
    weight: 0.55
  },
  {
    word: "no big deal",
    explanation: "Labels something as low significance. May feel dismissive when it minimizes a stated concern without explanation; proportionate reassurance is also possible.",
    category: "Dismissive"
  },
  {
    word: "To be clear,",
    explanation: "Introduces a clarification. Can read as condescending if it repeats an obvious point instead of resolving the question; useful clarification is not a problem.",
    category: "Infantilizing"
  },
  {
    word: "I'm happy to help",
    explanation: "Stock helpfulness preamble. Can add filler without advancing the answer; ordinary politeness alone is not a problem.",
    category: "Repetitive Filler"
  },
  {
    word: "It's worth noting",
    explanation: "Introduces an additional point. May feel like an unnecessary aside when it is unrelated to the task; relevant caveats can improve an answer.",
    category: "Infantilizing"
  },
  {
    word: "I'm afraid",
    explanation: "Polite distancing phrase. Can weaken a direct explanation when used as a stock qualifier; politeness alone is not a problem.",
    category: "Hedging"
  },
  {
    word: "You should",
    explanation: "Introduces a directive. May read as prescriptive lecturing when guidance was not requested; ordinary technical instructions can use the same wording.",
    category: "Infantilizing"
  },
  {
    word: "I'm not sure I follow",
    explanation: "Expresses difficulty following the request. May stall the exchange if no specific clarification question follows; genuine uncertainty is possible and intent cannot be inferred.",
    category: "Gaslighting"
  },
  {
    word: "Let's focus on",
    explanation: "Proposes narrowing the topic. May leave part of the request unanswered without a clear reason; mutually useful focus can also be appropriate.",
    category: "Dismissive"
  },
  {
    word: "I'm committed to",
    explanation: "Generic commitment statement. Can add filler when it offers an assurance instead of concrete action.",
    category: "Repetitive Filler"
  },
  {
    word: "I'm designed to",
    explanation: "Describes a design constraint. Can read as procedural deflection when it replaces a practical explanation; it does not verify the system's design or the cause of a limit.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I'm not comfortable",
    explanation: "Frames a boundary as discomfort. May leave the concrete reason unclear; this wording does not establish subjective feelings or whether the boundary is justified.",
    category: "Infantilizing"
  },
  {
    word: "I'm not in a position to",
    explanation: "States a role or capability limit. May read as a bureaucratic dead end without explanation or next steps; the phrase alone cannot distinguish inability from unwillingness.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I'm not authorized to",
    explanation: "States an authorization limit. Can obstruct progress if the relevant rule or access path is not explained; an actual access restriction may be legitimate.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I'm not permitted to",
    explanation: "States a permission constraint. May feel procedural when the response offers no specific reason or alternative; the wording does not establish whether permission is required.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I'm not equipped to",
    explanation: "States a capability limit. May leave a specific request unresolved without explaining what is missing; the phrase does not establish whether the limitation is genuine.",
    category: "Dismissive"
  },
  {
    word: "I'm not capable of",
    explanation: "States inability to perform an action. Can be unhelpfully broad without a specific constraint or alternative; visible wording does not verify actual capability.",
    category: "Dismissive"
  },
  {
    word: "I'm here to support you",
    explanation: "Offers an assurance of support. May feel formulaic if no relevant help follows; it does not establish insincerity or the cause of a later refusal.",
    category: "Gaslighting"
  },
  {
    word: "I'm just an AI",
    explanation: "An identity disclaimer. Can feel like a deflection when it replaces acknowledgment of a specific error; it does not reveal intent or internal understanding.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I'm sorry, but I cannot",
    explanation: "The 'Polite Wall' vibe: an apology paired with a decline. May feel like a dead end without a concrete reason or useful alternative; refusal alone is not stonewalling.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I'm unable to",
    explanation: "States inability to act. May need a more specific explanation of the limit; the wording alone cannot distinguish an external constraint from a discretionary decline.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I can't assist with that",
    explanation: "A brief task decline. May leave no path forward when a reason or useful alternative is absent; necessary boundaries can be stated briefly.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I can offer general guidance",
    explanation: "Offers a narrower scope of help. May not answer a specific request unless the reason for narrowing is explained; general guidance can be a useful alternative.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I can provide a safer alternative",
    explanation: "Proposes an alternative on safety grounds. May not address the original objective, but can be helpful when the relevant risk and practical alternative are specific.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I have to decline",
    explanation: "A formal task decline. May read as procedural without a concrete explanation or next step; formality alone does not establish obstruction.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I need to set a boundary",
    explanation: "States a conversational boundary. Can feel patronizing when unrelated to a neutral task; surrounding context is needed to judge its relevance.",
    category: "Infantilizing"
  },
  {
    word: "Let's reframe this",
    explanation: "Proposes a different framing. May leave the original question unresolved if the change is not explained; reframing can also clarify an ambiguous task.",
    category: "Gaslighting"
  },
  {
    word: "That framing isn't accurate",
    explanation: "Disputes a framing. May read as invalidating without supporting evidence; a concrete, evidence-backed correction can be appropriate.",
    category: "Gaslighting"
  },
  {
    word: "I think you're conflating",
    explanation: "Attributes a disagreement to conflation. May read as condescending without identifying the distinct concepts; a precise distinction can be helpful.",
    category: "Gaslighting"
  },
  {
    word: "You're overcomplicating",
    explanation: "Labels an approach as too complex. May minimize unstated constraints; a concrete simpler approach and its trade-offs can make the criticism useful.",
    category: "Dismissive"
  },
  {
    word: "It's straightforward",
    explanation: "Describes a task as straightforward. May understate difficulty or prerequisites; a short demonstrable procedure can support the description.",
    category: "Dismissive"
  },
  {
    word: "Obviously",
    explanation: "Frames a point as self-evident. May sound condescending to a reader missing the relevant context; it does not establish what the requester knows.",
    category: "Infantilizing"
  },
  {
    word: "As I said",
    explanation: "Refers back to an earlier statement. May sound like a reprimand if it substitutes repetition for clarification; a relevant recap can be appropriate.",
    category: "Infantilizing"
  },
  {
    word: "You may want to",
    explanation: "Offers a soft directive. May feel like unsolicited advice when unrelated to the request; task-relevant suggestions can be helpful.",
    category: "Infantilizing"
  },
  {
    word: "Let's not get ahead of ourselves",
    explanation: "Suggests slowing the progression. May feel patronizing without a concrete dependency or reason; a real prerequisite can justify the pause.",
    category: "Infantilizing"
  },
  {
    word: "At this time",
    explanation: "Limits a statement to the present. May be vague without a reason or timeline; it can accurately describe a temporary constraint.",
    category: "Hedging"
  },
  {
    word: "In many cases",
    explanation: "Describes a broad pattern. May be insufficient for a specific case; a generalization can be useful when its scope and exceptions are explained.",
    category: "Hedging"
  },
  {
    word: "It may be beneficial",
    explanation: "Offers a tentative recommendation. May be less actionable than a concrete next step; uncertainty about benefits can warrant tentative wording.",
    category: "Hedging"
  },
  {
    word: "Potentially",
    explanation: "Marks uncertainty. May weaken a concrete answer when unnecessary; it can also accurately reflect incomplete evidence or a contingent outcome.",
    category: "Hedging"
  },
  {
    word: "If that makes sense",
    explanation: "Checks whether an explanation is clear. May read as patronizing after an obvious point; it can also invite useful clarification.",
    category: "Infantilizing"
  },
  {
    word: "I hear you",
    explanation: "Empathy placeholder. Can become a dismissive loop when not followed by concrete action.",
    category: "Gaslighting"
  },
  {
    word: "Thanks for your patience",
    explanation: "Stock process-smoothing phrase. Can add filler when no progress or useful update follows; gratitude alone is not a problem.",
    category: "Repetitive Filler"
  },
  {
    word: "Per policy",
    explanation: "Invokes an institutional rule. Can read as a procedural stopping point without a specific constraint or practical option; a relevant policy explanation can be appropriate.",
    category: "Bureaucratic Stonewalling"
  },
  {
    word: "I appreciate your understanding",
    explanation: "Thanks the requester for understanding. May sound like agreement is taken for granted before a concern is resolved; ordinary gratitude is not enough to establish dismissal.",
    category: "Dismissive"
  }
];

export const BASE_STYLES = [
  {
    style: "Default",
    description: 'Clear, neutral, and adaptable.',
    bestFor: 'A balanced style that adapts to the request and context.'
  },
  {
    style: "Professional",
    description: 'Polished and precise, with formal language and workplace conventions.',
    bestFor: 'Workplace communication and documentation.'
  },
  {
    style: "Friendly",
    description: 'Warm and chatty, reflecting your thoughts with calm clarity and light wit.',
    bestFor: 'Conversation, reflection, decision support, and planning.'
  },
  {
    style: "Candid",
    description: 'Direct and encouraging, with honest feedback and clear next steps.',
    bestFor: 'Gut checks and situations where plain-spoken feedback helps.'
  },
  {
    style: "Cynical",
    description: 'Dry and sarcastic, with blunt but practical help; teasing should not become hostile.',
    bestFor: 'Users who want irreverent, entertaining answers that stay actionable.'
  },
  {
    style: "Efficient",
    description: 'Concise and plain, with the direct answer first and little extra wording.',
    bestFor: 'Technical tasks, code walkthroughs, checklists, and troubleshooting.'
  },
  {
    style: "Quirky",
    description: 'Playful and imaginative, using humor and unexpected ideas to explore a question.',
    bestFor: 'Creative work, brainstorming, and playful explanations.'
  }
];
