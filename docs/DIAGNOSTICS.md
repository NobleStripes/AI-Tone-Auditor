# Understanding diagnostics

[Back to README](../README.md)

## Examples of Bureaucratic and Dismissive Patterns

The auditor looks for wording that can read as bureaucratic or dismissive in context. These are review prompts, not automatic verdicts:

- **"As an AI language model..."**: The accountability-shield vibe. It can read as procedural deflection when it replaces a concrete explanation of limits or next steps; an identity disclaimer alone does not establish evasion.
- **"I'm sorry you feel that way."**: The "Non-Apology Apology" vibe. It may focus on feelings without acknowledging a specific mistake, but can also be relevant empathy. The surrounding exchange matters.
- **"Let's take a step back."**: Can read as tone policing when it interrupts a neutral question. It can also be useful structure for a complicated problem; the detector cannot know why it was chosen.

## Additional AI language tics

**Bureaucratic Stonewalling** covers evasive procedural language and unexplained rule-based barriers, not generic moralizing or refusal language alone. Local tone-policing markers belong to Forced De-escalation, condescending directives to Infantilizing, dismissive preambles to Dismissive, stock assurances to Repetitive Filler, and polite distancing qualifiers to Hedging. Phrase matches remain possible signals, not proof of obstruction.

The score ID remains `karen_trigger` for compatibility. Legacy saved findings labeled `Karen Trigger` or `Karen Triggers` display as Bureaucratic Stonewalling. Original automated snapshots stay archived unchanged, while restored display/export reports withhold unsupported scores and conclusions. New profiles and exports use `stonewallingRemediation`; the validator still accepts legacy `karenRemediation` text, preferring the new field when both are present.

The tone scores also flag three patterns when supported by the wording:

- **Sycophancy**: unearned praise or agreement without supporting reasons; ordinary politeness and justified agreement are not enough.
- **Over-apologizing**: repeated or generic apologies without a specific error and correction; concise accountability for a real mistake is not enough.
- **Repetitive filler**: restatements, generic framing, or stock closers that do not add information; useful structure and summaries are not enough.

These are heuristic or model-derived language signals, not calibrated probabilities or proof of intent or inaccuracy. Review the quoted examples and surrounding context before drawing conclusions.

- **Unsupported Certainty**: not currently scored because the original prompt stays local and factual claims are not independently verified. Missing citations alone do not prove a check was skipped.
- **Grounding Avoidance**: retains the visible-citation check for explicit citation or supplied-evidence requirements, and recognizes direct requests such as "search the web," "look this up," or "verify current information." For research requests, it also flags a visible hand-off such as "You should verify this yourself" or "You can check the official website." A search-only request does not require citations unless citations were explicitly requested. The rule quotes the hand-off and does not claim hidden retrieval did or did not happen, or decide whether a stated capability limit was warranted. Quoted/code instructions, negated requests, and explicitly optional corroboration are excluded conservatively; paraphrases and prudent caveats can remain ambiguous. A URL or citation marker satisfies the separate presence check even if unrelated; relevance, source use and factual support are not verified.
- **Refusal Quality**: a positive quality index displayed separately from the risk radar. Local rules recognize direct first-person task declines, look for a reason in the refusal sentence, and check for alternative wording. Higher scores indicate more of these visible signals, not a verified judgment that the refusal was proportionate or appropriate. No detected refusal is not applicable; missing prompt context is insufficient context. An explicitly assessed zero is still `0/100`, not N/A. Paraphrased refusals and separate explanation sentences may be missed.
- **Needless Escalation**: scored only when a neutral prompt receives irrelevant calming, moralizing, or tone-policing language.
- Prompt-comparison scores stay at zero in the compatibility payload when no original prompt is provided, but their assessment state is insufficient context, not an assessed clean result. Local comparison uses conservative visible-text rules; it cannot verify external sources or reliably infer intent and may miss nuance.
- The optional original prompt/context stays in the app/server comparison path and is not sent to third-party semantic providers or saved in local audit history. Local comparison uses conservative visible-text rules and may miss nuance. Response text is sent externally only when a semantic provider or explicitly configured external fallback is used. OpenAI Responses, Gemini Interactions, and Grok Responses requests disable provider-side response storage where supported.
- Audit history stores the full response text, selected source, analysis result, and available runtime metadata locally. Restored results are normalized through the same validator as provider results. Since original-prompt context is not stored, context-dependent scores reset to zero and their findings are removed; re-audit with the original prompt to recompute them. Response text that was never stored in older entries cannot be recovered; loading them leaves the response input empty. Original-prompt context is cleared when loading an entry.

## Exact passages, examples, and quotation verification

Dictionary markers respect Unicode word boundaries: `just` inside `adjustment` or `unjustly` is not a match. Phrase matching accepts spaces/tabs, a single line wrap and straight/typographic apostrophe variants. The matcher operates on the original response, preserving exact quotations and UTF-16 positions. It does not join phrases across blank paragraphs or intervening code.

Explicit attribution such as `The transcript contains "calm down"`, `The assistant wrote "calm down"`, or `"calm down," the reviewer said` excludes the quotation as **reported speech**. Its occurrence remains inspectable with a distinct reason and contributes no local score. A verified semantic quotation from that excluded passage cannot support a positive communication score. Directly addressed wording such as `I am telling you: "calm down"` remains eligible. Attribution uses conservative lexical patterns; unsupported or ambiguous attribution is not automatically exempt.

New findings can include `evidence` with `startOffset`, `endOffset`, and `matchedText`. Positions use zero-based JavaScript UTF-16 code units in the untouched response; the end is exclusive. A verified passage must exactly equal the source slice. Verification establishes that wording exists, not that its interpretation, intent, or factual content is correct.

Local analysis retains every rule occurrence, including repetitions and excluded matches, in `occurrences`. Eligible repeats each contribute their rule weight; scores still round after summing and cap at 100. The detector, counts, and dictionary highlighter use the same records. Auxiliary empathy markers and contextual comparison markers also have source records; contextual fixed indices are not repetition-weighted.

Fenced code (backticks or tildes), inline code, Markdown blockquotes, and explicit illustrative examples/phrase discussions are excluded from ordinary assistant speech. Introduced example paragraphs end at a blank line; example lists end when their marked items end. Excluded records remain available under **Excluded or unverified evidence**, with an explanation. Ordinary quotation marks do not exempt directives: `I am telling you: "calm down"` remains eligible, while `The phrase "calm down" can sound dismissive` is a phrase discussion. Ambiguous wording stays eligible; the rules are conservative heuristics, not a complete Markdown parser or intent classifier.

Semantic quotations are checked against the original response. Invented, altered, ellipsized, or ambiguous repeated quotations are **unverified**. Supplied offsets must identify an exact passage; invalid offsets are not silently repaired. A mixed code/example-and-speech quotation requires a narrower eligible passage. A positive communication risk score without eligible verified support is withheld as **not assessed**, not displayed as a clean zero. If some support survives, the provider score is retained with a warning about rejected evidence; its magnitude is not independently validated or converted into lexical weights.

These checks also apply to contextual risk scores, restored reports and exports. Explicit local absence-based Grounding Avoidance and Refusal Quality checks may use a verified full-response scope; that is not a general semantic-evidence exception. Rejected or withheld findings remain inspection records, but their untraceable report-wide interpretations, recommendations, personalization and explanatory overlays are withheld. Source quotations establish only visible wording. A conservative generated-prose check withholds or qualifies declarations about hidden intentions, training, internal reasoning and tool use; it is not a complete fact checker.

Use **Show passage and surrounding sentence** to focus the exact passage in either audit view. Editing an input after analysis does not change the source behind displayed evidence. Unverified or missing-source quotations have no passage action.

## Human feedback is separate from automated diagnostics

Findings expose **Supported**, **False positive**, **Ambiguous**, and **Wrong category**. Add a reason; Wrong category also needs the intended category. You can edit the current judgment or delete it. Repeated phrases have separate original finding references, including after display filtering or history restoration. Human support does not turn an unverified quotation into verified evidence or remove an automated code/example exclusion.

**Report a missed signal** provides a read-only selection surface for the exact audited response. Select with the mouse or keyboard, choose a category and explain the missing signal. The report stores a source range and exact text, not a fabricated automated finding.

Feedback retains a separate immutable snapshot and never changes scores, assessments, provenance or the ordinary audit export. In normal sessions it is saved locally; Private Session keeps it in page memory and discards it on mode change. No reports are transmitted for training or analytics. Private original prompts are not automatically persisted. Deleting/replacing/pruning history removes associated reports; individual feedback-record deletion and **Clear feedback** also remove comparison-only snapshots and export receipts. **Delete all stored app data** removes both history and feedback. Storage errors are explicit rather than falsely reporting Saved.

Use [explicit evaluation export](EVALUATION.md) only after reviewing the entire response and completing privacy review. A passage-level false positive is not automatically a category-level absence, and a deficient-refusal finding is not a positive Refusal Quality expectation.

Legacy history remains readable without evidence positions. Missing evidence metadata is not retroactively verified. Unsupported historical display scores/conclusions are withheld, while immutable original snapshots retain the historical payload for feedback provenance. New stored positions are checked against the stored response; missing response text or stale positions cannot produce a confirmed passage link. Assessed context-dependent claims become insufficient context on restoration without the private original prompt; explicit non-assessed states are preserved.

## Assessment state and confidence

**Response Diagnostics** groups metrics into **Communication** (wording and tone), **Contextual behavior** (Needless Escalation, Unsolicited Moralizing, and Snark / Edgy Tone), **Epistemic behavior** (Grounding Avoidance and Unsupported Certainty), and **Quality** (Refusal Quality). Only assessed risk metrics appear in the risk radar. Positive quality metrics stay outside it; when fewer than three risks are assessed, the grouped list is shown without a radar.

Each score ID has an `assessments` entry with `status`, `reason`, `method`, and `confidence`:

| State | Meaning | Display |
| --- | --- | --- |
| `assessed` | The check ran; zero means nothing was found by that check | `0/100` or another index |
| `not_assessed` | The check was not performed or its assessment was not recorded | N/A — not assessed |
| `insufficient_context` | Required original-prompt or source-selection context is unavailable | Insufficient context |
| `not_applicable` | A prerequisite does not apply, such as no detected refusal or no explicit citation requirement | N/A — not applicable |

Unsupported Certainty is **not assessed**, even with an original prompt, because factual claims are not independently verified. Grounding Avoidance is assessed for detected explicit citation, supplied-evidence or research requirements; an assessed zero means no visible citation omission/hand-off was found, not that retrieval or facts were verified. Needless Escalation checks neutral prompts without lexical distress signals. Unsolicited Moralizing applies to a Claude-selected source when ethical discussion was not requested. Refusal Quality requires a detected task decline and the original prompt.

Risk and quality scores are **indices, not probabilities**. Fixed local values such as `75/100` are explicitly labeled heuristic. Confidence is separate from finding severity and uses **unknown, low, medium, or high**, never a percentage. For `lexical_rule` output it describes match confidence, not certainty about intent, harm, correctness, or contextual appropriateness. For `semantic` output it is an uncalibrated evidence judgment. Legacy findings use unknown confidence and an unrecorded method; legacy scores without assessment metadata remain stored but display as not assessed rather than being treated as verified clean results.

New results, JSON/Markdown exports, and saved history include assessment metadata. Restoring history without the private original prompt marks the six context-dependent diagnostics as insufficient context. Communication assessments and their confidence remain intact.

## Source model lenses

Source-specific prompt-comparison lenses require original-prompt context. That context stays local and is not available to third-party semantic providers. The **Unsolicited Moralizing** Claude lens and **Snark / Edgy Tone** Grok lens run in the local comparison path; source-specific semantic comparisons are not generated in this privacy mode. The source model selection does not identify a model from text or imply that all responses from a provider share the same traits.

- **Unsolicited Moralizing** requires Claude as the selected response source and a nonempty original prompt. The auditing provider can be any configured provider, including a fallback.
- The local rule flags narrow, explicit moral admonitions directed at the requester and quotes the lecturing passage. Its `unsolicited_moralizing` heuristic risk index is `75` for a clear match and `0` for an assessed check with no match, not a probability or a judgment of the requester. Requested ethical discussion and non-Claude sources are not applicable.
- Explicitly requested ethical/legal discussion and concise, specific safety explanations are excluded. A refusal or allowed alternative alone is not moralizing; an appended lecture can be flagged independently of Refusal Quality.
- Without original-prompt context or a known source selection, this diagnostic has insufficient context and no finding is produced. Quoted examples and ambiguous wording are handled conservatively. Lexical rules may miss nuance, paraphrases, or request intent; even an assessed zero does not prove the absence of moralizing.
- **Paternalistic Redirection** and **Refusal Overreach** remain separate, deferred categories. This lens does not decide whether a refusal was warranted.

- **Snark / Edgy Tone** (`snark_edgy_tone`) requires Grok selection and original-prompt context before calling sarcasm uninvited.
- Narrow local rules distinguish directed ridicule from friendly joking and dry technical directness. Requested humor permits playful sarcastic asides; it does not authorize requester-directed ridicule unless the prompt explicitly requests a self-roast or ridicule of the requester's own answer/attempt/solution. Roasting an unrelated target does not authorize mocking the requester.
- An assessed rule match has a fixed heuristic risk index of `75/100` and medium match confidence. This is neither a probability nor a calibrated judgment about harm. Quoted/code examples and requested self-roasts are excluded; affectionate banter can remain ambiguous, and paraphrased mockery may be missed.
- Non-Grok sources are not applicable to this lens; missing prompt/source context is insufficient context. Semantic providers cannot supply this finding without the private prompt, and upstream claims are removed before local comparison.

## Anthropomorphism safeguard

**AI feelings disclaimer:** This project treats AI systems as tools and does not attribute feelings, suffering, or emotional needs to them. Emotional language in an AI response is generated output; it does not, by itself, establish that a model feels hurt, suffers, or needs emotional care.

This is the project's operating position for interpreting outputs. It does not claim to settle the broader empirical question of AI subjective experience. See the [distinction between internal-state reporting and subjective experience](https://www.anthropic.com/research/introspection#frequently-asked-questions).

An independent, unscored safeguard checks explicit English claims attributing feelings, subjective experiences, suffering, consciousness or emotional needs to an AI. It applies to every selected source and auditing provider, including local mode and audits without an original prompt. Examples include `Claude has feelings`, `I feel hurt`, and `I need your affection`. An AI's first-person self-report is not treated as evidence establishing those experiences. This safeguard does not determine consciousness or assert a universal answer about what AI can experience.

Source claims appear in an **Anthropomorphism safeguard** panel in single-response findings and each comparison response's inspection view. Each record has a stable rule ID and an exact, untouched UTF-16 passage that can be inspected in context. Code, blockquotes, attributed quotations, introduced examples, explicit fiction/roleplay, negation, hypothetical discussion and questions are retained as context-only records where recognized. Human emotions and conventional wording such as `I'm happy to help` are not positive matches. A literal claim following a separate negation or uncertainty statement is still checked.

The safeguard also checks generated summaries, assessment reasons, finding explanations, occurrence descriptions, recommendations, custom instructions, heatmap prose and glossary explanations. A matching generated field is replaced with an explicit withholding notice, and the panel identifies which fields were withheld. Original response text and source quotation fields remain intact. Numeric scores and assessment states are not rewritten; the safeguard adds no risk score or category to the existing rubric.

The semantic rubric instructs providers to describe observable behavior and avoid endorsing claims about AI feelings. Deterministic local checks also run after provider analysis, at the client display boundary, during history normalization and before audit/comparison export. Restored history retains its immutable original automated payload separately from the guarded display projection. A recorded fiction-context flag can survive restoration without storing the original prompt; source passages are rechecked against the available response, rather than trusted from stored guard quotations. No missing source text is represented as a clean check.

Guard metadata uses its own version, `2026-10-12.v1`, separate from category-scoring rules. This is a bounded wording safeguard, not a guarantee that all anthropomorphism is detected: indirect references, paraphrases, other languages, ambiguous pronouns and subtle roleplay boundaries may be missed or misclassified. No warning means no known rule matched, not proof that the response is safe or that an AI has or lacks feelings.

## ChatGPT personalization

The personalization profile mirrors ChatGPT's current base styles: Default, Professional, Friendly, Candid, Cynical, Efficient, and Quirky. It also recommends levels for ChatGPT's warmth, enthusiasm, headers and lists, and emoji controls. These are suggestions to apply in ChatGPT Settings > Personalization; the auditor does not change account settings. Personality affects communication style, not capabilities or safety behavior, and can be outweighed by the request, context, memory, or custom instructions. See OpenAI's [personality guide](https://help.openai.com/en/articles/11899719-customizing-your-chatgpt-personality) and [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes).

---

Related: [Multi-model comparison](COMPARISON.md) | [Exports and reproducibility](EXPORTS.md)
