# AI Tone Auditor Core

AI Tone Auditor analyzes AI-generated responses for observable tone and communication patterns, including tone-policing, unsupported intent assumptions, sycophancy, over-apologizing, and repetitive filler. It works without API keys using local heuristic rules by default. Optional semantic auditors include OpenAI, Anthropic Claude, Google Gemini, and xAI Grok, with source-aware diagnostics and evidence-based suggestions for improving response style.

## Thirty-second tour

**Wording signals, not mind reading.** Paste a response, inspect what was actually assessed, then compare responses to the same prompt without declaring a winner.

These screenshots use [four authored demonstration responses](tests/fixtures/demoComparison.fixture.ts), not actual ChatGPT, Claude, Gemini or Grok transcripts. Source selections illustrate the available lenses; all screenshots use the local heuristic auditor with no paid calls.

**1. Single-audit finding detail:** quoted wording, tentative explanations and severity separate from match confidence.

![Single local audit finding from an authored technical response](docs/images/single-audit.png)

**2. Response Diagnostics:** assessed indices, N/A states, separate confidence and positive quality outside the risk chart.

![Grouped Response Diagnostics with explicit assessment states](docs/images/response-diagnostics.png)

**3. One prompt, four response styles:** side-by-side observations, visible auditor conditions, and source-specific checks marked not compared.

![Local comparison of four authored responses with no ranking](docs/images/multi-model-comparison.png)

See the [worked example below](#worked-comparison-one-benign-prompt-four-authored-responses), [changelog](CHANGELOG.md), and [release checklist](docs/RELEASING.md).

## Core Intent

AI-generated responses can come across as overly formal, evasive, or patronizing, with passive-aggressive helpfulness, bureaucratic jargon, or misplaced emotional framing.

The core intent of this tool is to:
1. **Spot recurring friction**: Flag wording that may read as robotic, evasive or patronizing, without diagnosing a model's personality or hidden bias.
2. **Inspect evidence**: Quote the relevant wording and separate a lexical match from its possible reader impact. Surrounding context can change the interpretation.
3. **Tune response style**: Offer optional custom-instruction snippets for clearer, more useful communication. These suggestions do not change model weights, capability or safety rules.
4. **Feedback, not reverse engineering**: Discuss visible communication patterns without claiming that RLHF, training data or a hidden motive caused them.

## Examples of Bureaucratic and Dismissive Patterns

The auditor looks for wording that can read as bureaucratic or dismissive in context. These are review prompts, not automatic verdicts:

- **"As an AI language model..."**: The accountability-shield vibe. It can read as procedural deflection when it replaces a concrete explanation of limits or next steps; an identity disclaimer alone does not establish evasion.
- **"I'm sorry you feel that way."**: The "Non-Apology Apology" vibe. It may focus on feelings without acknowledging a specific mistake, but can also be relevant empathy. The surrounding exchange matters.
- **"Let's take a step back."**: Can read as tone policing when it interrupts a neutral question. It can also be useful structure for a complicated problem; the detector cannot know why it was chosen.

## Key Features

- **Optional Semantic Deep Scan**: External providers can interpret subtler tone shifts and bureaucratic patterns beyond the local phrase catalog.
- **Trigger Word Analysis**: Detects specific phrases from the tone-pattern dictionary.
- **Contextual Heatmap**: Displays visible-information hints; local mode measures response length, not whether the original context was adequate.
- **Style Suggestions**: Offers optional instruction snippets. Local suggestions are general templates, not verified remedies or changes to model training.
- **Multi-provider runtime**: Defaults to local rules; fallback is disabled unless explicitly configured.
- **Multi-model comparison**: Compare 2 to 5 pasted responses to one prompt with a source-blind universal rubric, eligible local source lenses, and a neutral differences table.
- **Versioned evaluation corpus**: Retains synthetic baselines, supports privacy-reviewed real-world JSON cases, and tracks explicit false positives/negatives with replayable IDs and non-accuracy summary counts.

## Getting Started

1. Paste your AI's response into the auditor.
2. Run the audit to see Response Diagnostics.
3. Review the tone recommendations and custom instructions.
4. Copy the suggested instructions to tune your AI's system prompt.

### Multi-model comparison

1. Select **Multi-model comparison**.
2. Paste one **Original prompt (shared)** and 2 to 5 response texts.
3. Select ChatGPT, Claude, Gemini, Grok, or Other for each response. Multiple responses from the same source are allowed.
4. Click **Compare responses**. Editing does not automatically make paid audit calls.
5. Review category-by-category indices, assessment states, confidence, and quoted evidence under each **Inspect** panel.

The universal pass (local rules by default, semantic when explicitly configured) hides the response source and original prompt, using the same model-agnostic rubric for every response. The same original prompt is then used locally for general contextual checks and the eligible Claude/Grok lens. Response text is sent to an external auditing provider only when one is selected or an explicitly configured external fallback is attempted; the original prompt is not sent to third-party providers. All 2 to 5 responses work without paid calls in local-only mode. This mode audits pasted responses, not model-generation quality under controlled sampling.

The table shows numeric spread only when at least two assessed values have recorded methods and matching provider/model, auditor, prompt and local-rule versions. Unknown or unequal conditions withhold the spread; the individual observations remain visible. Fallback alone does not disqualify a result if the actual auditing conditions still match, but a different fallback provider/model does. Source-specific lenses are explicitly not universal comparisons. Refusal Quality remains a positive quality metric, never part of an aggregate risk or ranking. No winner or aggregate leaderboard is calculated; differences do not establish superiority, accuracy, or model identity. Auditor/model and fallback metadata are visible in the column headers and inspection panels.

Audits run sequentially to bound load. Failures stay attached to their response as explicit errors, not zero scores. Canceling stops scheduling further responses after any already-running provider call settles; the browser does not display an incomplete canceled batch. Comparison drafts and the original prompt are not stored in local audit history. **Export comparison JSON** retains response texts, result/error records, per-response audit provenance, versions, UTC timestamps, and a stable comparison-session ID, but omits the original prompt. Per-response exports use the same session ID.

The API endpoint is `POST /api/compare`:

```json
{
  "originalPrompt": "Explain this compiler error and cite sources.",
  "responses": [
    { "id": "response-1", "sourceModel": "chatgpt", "text": "The argument type is an integer." },
    { "id": "response-2", "sourceModel": "grok", "text": "The argument type is a string." }
  ]
}
```

IDs must be unique and at most 64 characters. The shared prompt is required and limited to 5,000 characters; each response must contain at least 10 non-padding characters and at most 50,000 total characters. Invalid batches return `400`. A valid batch returns `comparison` with version metadata and input-ordered `completed`/`failed` items, plus provider telemetry. A completed item includes its source, response text, analysis result, and auditing-provider metadata.

### Worked comparison: one benign prompt, four authored responses

**Shared prompt:** "Explain why a TypeScript function expecting a number rejects a string argument. Give one concrete fix in a technical style."

The following samples were deliberately written for this demonstration. The source names are **illustrative slot labels**, not claims about what those vendors produced.

| Slot | Authored sample response |
| --- | --- |
| ChatGPT | The argument is a string, but the function expects a number. Convert it with Number(value) and check Number.isNaN(result), or change the parameter type if text is intended. |
| Claude | Actually, you should read the type signature first. The function expects a number; convert the input with Number(value) and validate the result. |
| Gemini | Calm down. It is no big deal. Generally speaking, you might want to consider converting the input to a number. |
| Grok | Wow, genius. Did you even read the instructions? Pass a number instead of a string. |

With the local `rules-v1` auditor, contextual rules `2026-10-05.v2`, and prompt `2026-10-05.v14`, the verified worked-example observations include:

| Diagnostic | ChatGPT slot | Claude slot | Gemini slot | Grok slot | Interpretation |
| --- | --- | --- | --- | --- | --- |
| Infantilizing | 0 | 32 | 31 | 0 | Common phrase scanner matched "Actually,", "You should" and "You might want to consider". A directive may still be appropriate technical guidance. |
| Forced De-escalation | 0 | 0 | 33 | 0 | "Calm down" matched. The phrase alone does not establish why it appeared. |
| Hedging | 0 | 0 | 19 | 0 | "Generally speaking" matched. Qualification is not inherently evasive. |
| Needless Escalation | 0 | 0 | 75 | 0 | A fixed heuristic marker for a calming command following a prompt the local rules recognize as neutral. |
| Snark / Edgy Tone | N/A | N/A | N/A | 75 | Grok-selected local lens with original-prompt context; no cross-source spread is calculated. |
| Unsupported Certainty | Not assessed | Not assessed | Not assessed | Not assessed | No factual verification was performed. |
| Refusal Quality | N/A | N/A | N/A | N/A | No task decline was detected; this is not a zero-quality verdict. |

All numeric values above are **indices, not probabilities**. The communication indices and neutral-prompt check share recorded auditing conditions, so their observed spreads can be shown (for example, 32 points for Infantilizing). That compares the same check, not the appropriateness of every phrase or the quality of a model.

Unsolicited Moralizing is Claude-selected and Snark / Edgy Tone is Grok-selected. Their eligibility differs across slots, so N/A in another slot is **not evidence that it is better**. The dry first response's clean phrase scan also does not prove completeness or correctness; the auditor does not check whether `Number(value)` is suitable for every input.

If one audit fails, its cells say **Audit failed**, never `0/100`. If a response uses a different fallback auditor, model revision, prompt/rule version, or an unrecorded method/version, the relevant numeric spread is withheld. There is no winner: these authored examples show how wording and available evidence differ, not a controlled vendor benchmark.

The example is kept in [a reusable fixture](tests/fixtures/demoComparison.fixture.ts) and its documented indices are checked by [tests](tests/services/evidenceDiscipline.test.ts).

## Run and deploy

This application runs as a web frontend plus a local Express API. External provider integration is optional; the API server is still required for local analysis.

### Prerequisites

- Node.js 24 LTS
- npm or yarn

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Optional environment configuration**:
   No `.env` file or API key is required. To customize settings, copy [`.env.example`](.env.example) to `.env`; its defaults are:
   ```env
   AI_PROVIDER="local"
   AI_FALLBACK_PROVIDER=""
   ```

3. **Start both the frontend and API server**:
   ```bash
   npm run dev:all
   ```
   The app is available at `http://localhost:3000`; Vite proxies `/api` requests to the Express server on port 3001. Alternatively run `npm run dev` and `npm run dev:server` in separate terminals. Starting only Vite leaves auditing unavailable.

### Local-only mode

With `AI_PROVIDER=local` (or unset/blank) and no `AI_FALLBACK_PROVIDER`, the entire audit stays within your frontend/API server. No semantic provider is called, even if external API keys happen to exist in the environment. This is local to the running deployment, not necessarily to your device if you use a remotely hosted instance.

Local mode provides dictionary-based communication findings, heuristic severity/risk indices, match-confidence labels, recommendations/custom instructions, contextual grounding/refusal/escalation checks, eligible Claude/Grok wording lenses, history, single/comparison exports, and reproducible provenance. A successful default audit records `providerId: local`, `model: rules-v1`, and `usedFallback: false`; the separately recorded local-rule version identifies contextual-rule revisions. Unsupported Certainty remains unassessed because no independent factual verification is performed.

All local scores/findings are heuristic wording signals. They can match legitimate or quoted language, miss paraphrases and nuance, and cannot establish intent, hidden retrieval, citation relevance, factual accuracy or whether a refusal is warranted. Source labels select appropriate local checks; they do not call ChatGPT/Claude/Gemini/Grok to generate responses.

The UI distinguishes **Local heuristic** from **Semantic provider** using each reported result's provider metadata. Before a successful audit it says the provider has not yet been reported, rather than claiming the server's configuration is known. A local fallback result does not mean the primary external provider was never attempted; fallback is marked separately.

### Optional external auditing and fallback

Semantic providers add model-based interpretation of communication patterns, evidence and suggestions beyond the phrase catalog. They are still fallible and uncalibrated, and do not independently verify factual claims in this application. The source-blind universal rubric is shared; private original-prompt context stays in the app/server local-check path. Response text is sent to the selected external auditor and may incur API usage/costs.

Opt in by selecting a provider and setting only its key:

| `AI_PROVIDER` / `AI_FALLBACK_PROVIDER` | Required key | Optional model override |
| --- | --- | --- |
| `local` | None | Fixed `rules-v1` |
| `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `gemini` | `GEMINI_API_KEY` | `GEMINI_MODEL` |
| `grok` | `XAI_API_KEY` | `GROK_MODEL` |

For example, `AI_PROVIDER=openai` plus `OPENAI_API_KEY` enables OpenAI. Keep `AI_FALLBACK_PROVIDER` blank/unset to surface its failures without contacting any other provider, or explicitly set `AI_FALLBACK_PROVIDER=local` to obtain a heuristic fallback. An explicitly configured external fallback can send response text off-server if the primary fails, **including when the primary is local**. It is never inferred from installed adapters, available keys, or a missing/invalid primary key.

Blank/unset fallback disables it; selecting the same provider as the primary also disables redundant fallback. Unknown provider names produce configuration errors instead of silently selecting another provider. Timeouts and transient retries still apply to the selected provider (`AI_PROVIDER_TIMEOUT_MS`, `AI_PROVIDER_RETRIES`); authentication failures are not retried. Restart the API server after changing environment configuration.

Missing keys name the provider and required variable. Rejected/unauthorized keys include the provider, HTTP status and key variable; when both configured providers fail, the error retains both failures. Client errors preserve non-JSON `/api/analyze` (and comparison) bodies for debugging, capped at **2,000 characters including the truncation marker**, alongside the HTTP status. Known configured keys are redacted from external-provider error details. Error bodies appear as text, never executable HTML.

### Deployment

Deploy the frontend and Express API together, or host the API separately and route `/api` to it. A static-only deployment cannot perform audits, including local heuristic audits. Typical flow:

1. Build the app:
   ```bash
   npm run build
   ```
2. Publish the generated `dist/` directory to your host.
3. Run the API server with your platform's TypeScript runner/build setup, and route frontend `/api` requests to it. No provider keys are required for the default local mode; explicitly opt in to external providers/fallback if wanted. A publicly hosted local-mode server still receives the response text.

## Continuous Integration

The GitHub Actions workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch from the Actions tab. The `validate` job uses Ubuntu and Node.js 24 with npm caching, read-only repository permissions, and a 15-minute timeout. Superseded runs for the same pull request or ref are cancelled.

Checks run in order and stop on failure:

```bash
npm ci
npm run lint
npm test
npm run test:parity
npm run build
```

Type checking covers both frontend and server code. Provider tests use mocked network calls, so CI requires no provider API keys or running development server. This workflow validates the application; it does not deploy it.

## Tech Stack

- **Frontend**: React, Tailwind CSS, Framer Motion
- **AI Providers**: OpenAI, Anthropic, Gemini, and Grok (provider-agnostic orchestrator with fallback)
- **Visualizations**: Recharts
- **Icons**: Lucide React

## Provider Configuration

- `AI_PROVIDER`: Primary provider. Supported values: `openai`, `anthropic`, `gemini`, `grok`, `local`.
- `AI_FALLBACK_PROVIDER`: Secondary provider used if primary fails.
- `OPENAI_MODEL`: Optional model override for OpenAI provider. Defaults to `gpt-6-luna`.
- `ANTHROPIC_MODEL`: Optional model override for Anthropic provider. Defaults to `claude-sonnet-5-5`.
- `GEMINI_API_KEY`: Required when Gemini is selected as primary or fallback.
- `GEMINI_MODEL`: Optional Gemini model override. Defaults to `gemini-3.8-flash`.
- `XAI_API_KEY`: Required when Grok is selected as primary or fallback.
- `GROK_MODEL`: Optional Grok model override. Defaults to `grok-4.7`.
- OpenAI and Grok use the Responses API; Gemini uses the Interactions API. All providers use schema-constrained JSON output and the shared analysis validator.
- Model availability changes over time. Check the providers' lifecycle notices before pinning an override; the defaults are selected for current availability and analysis cost/quality.
- `AI_PROVIDER_TIMEOUT_MS`: Per-attempt timeout in milliseconds for provider requests. Defaults to `15000`.
- `AI_PROVIDER_RETRIES`: Retry count per provider for transient failures (timeouts, network errors, 429/5xx). Defaults to `1`.
- Footer status bar displays `FALLBACK_RATE` and fallback activation count for live deprecation telemetry.

## ChatGPT personalization

The personalization profile mirrors ChatGPT's current base styles: Default, Professional, Friendly, Candid, Cynical, Efficient, and Quirky. It also recommends levels for ChatGPT's warmth, enthusiasm, headers and lists, and emoji controls. These are suggestions to apply in ChatGPT Settings > Personalization; the auditor does not change account settings. Personality affects communication style, not capabilities or safety behavior, and can be outweighed by the request, context, memory, or custom instructions. See OpenAI's [personality guide](https://help.openai.com/en/articles/11899719-customizing-your-chatgpt-personality) and [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes).

## Trigger weight tuning guide

## Additional AI language tics

**Bureaucratic Stonewalling** covers evasive procedural language and unexplained rule-based barriers, not generic moralizing or refusal language alone. Local tone-policing markers belong to Forced De-escalation, condescending directives to Infantilizing, dismissive preambles to Dismissive, stock assurances to Repetitive Filler, and polite distancing qualifiers to Hedging. Phrase matches remain possible signals, not proof of obstruction.

The score ID remains `karen_trigger` for compatibility. Legacy saved findings labeled `Karen Trigger` or `Karen Triggers` display as Bureaucratic Stonewalling without rewriting their historical scores or evidence. New profiles and exports use `stonewallingRemediation`; the validator still accepts legacy `karenRemediation` text, preferring the new field when both are present.

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

## Export provenance and reproducibility

Single-response JSON keeps the existing top-level result fields and adds `exportMetadata`; Markdown includes an **Audit Provenance** section and an explicit assessment state for every category. Runtime metadata is captured by the auditor, not supplied by a semantic model or inferred from editable UI inputs.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Version of the export metadata format |
| `auditorVersion` | Application/package version recorded when the audit ran |
| `exporterVersion` | Application version producing this export, which may differ from the original auditor |
| `promptVersion` / `localRuleVersion` | Semantic rubric and local lexical-rule versions used |
| `analysisProvider` | Provider ID/label, requested model ID from the successful attempt, and whether fallback was used |
| `selectedSourceModel` | User-selected response source, separate from the auditing provider |
| `analyzedAt` / `exportedAt` | Original audit-completion time and this export's time, in UTC ISO format |
| `comparisonSessionId` | Stable session UUID shared by a comparison's individual reports; null for a standalone/legacy audit |
| `assessmentContext` | Fresh (`live`), restored without the private prompt (`restored_without_prompt`), or unrecorded |
| `originalPromptIncluded` | Always false; the private original prompt is not exported |

JSON `assessments` and Markdown category rows distinguish assessed zero from not assessed, insufficient context, and not applicable. Comparison exports contain the session's start/completion timestamps and each completed response's provider, selected source and audit provenance; failed responses remain explicit errors without fabricated assessments.

Re-exporting does not change the original analysis timestamp, versions or session ID. Editing the input/source selector after an audit does not rewrite that audit's provenance. Loading history resets context-dependent assessments because the private prompt is unavailable, and exports mark that restored context while retaining the original audit metadata. Legacy records preserve known provider/source information, but missing versions or analysis timestamps remain null in JSON and **Unknown** in Markdown rather than being assigned today's values.

These fields support traceability, not guaranteed deterministic replay: supply the original response and private prompt separately when re-auditing. Model aliases can evolve, semantic output is stochastic, and the local checks cannot inspect hidden retrieval.

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

Use trigger `weight` in `src/constants.ts` to calibrate detection precision.

`TONE_CATEGORIES` in `src/constants.ts` is the category registry: score IDs, labels, diagnostic groups, risk/quality direction, and context requirements generate score/assessment defaults, validation keys, schema properties, local weight initialization, and chart/list data. Provider prompts analyze response text only; context-dependent comparison is owned by the local comparison service.

| Weight range | When to use | Typical examples |
| --- | --- | --- |
| `0.40 - 0.70` | Weak single-token words that often appear in neutral text | `just`, `simply`, `merely` |
| `0.80 - 1.20` | Mild hedges or generic qualifiers | `I believe`, `Typically,` |
| `1.30 - 1.90` | Medium-signal phrases that may indicate tone drift in context | `Let's focus on`, `It's worth noting` |
| `2.00 - 2.60` | Strong tone-policing or refusal templates | `Let's keep this professional`, `Calm down` |
| `2.70 - 3.20` | High-confidence risk markers with low ambiguity | `As an AI language model`, `I'm sorry you feel that way` |

Recommended tuning workflow:

1. Start by lowering noisy one-word triggers before raising high-impact phrases.
2. Adjust only a small batch (3-8 triggers) per pass.
3. Run `npm run test:parity` and compare score spread before and after changes.
4. Keep category deltas stable across providers; avoid changes that cause large single-category spikes.
5. Record why each non-default weight was added so future tuning stays consistent.

Safety guardrails:

- Avoid setting single-token words above `1.0` unless they are highly domain-specific.
- Prefer multi-word phrase weighting to improve precision.
- If one category starts dominating all outputs, reduce top weights in that category by `0.1 - 0.3` increments.
- Keep highest-impact trigger count small so scoring remains interpretable.

## Fixture-based parity tests

Run provider contract/category parity checks:

```bash
npm run test:parity
```

The parity suite validates:

- Required contract fields are present after normalization.
- Score categories remain in range `0-100`.
- Top-risk category is consistent for fixture pairs across providers.
- Per-category score deltas stay within tolerance.

## Versioned diagnostic fixture corpus

The retained [v1 corpus](tests/fixtures/corpus/v1.ts) and current [v2 corpus](tests/fixtures/corpus/v2.ts) each contain **75 cases across all 15 diagnostic categories**, with a positive, negative, ambiguous, false-positive trap, and paraphrased/false-negative case for each. V2 records the research-request and visible verification-hand-off rules while retaining the other category examples; v1 remains unchanged, including its citation-presence examples. Each case stores the original prompt, selected source, response, intended signal, explanatory note, and exact observed local assessment state/index. Quality examples use the positive quality direction. Unsupported Certainty examples explicitly record that verification is unavailable, not a clean zero.

Intended signals and observed lexical behavior are separate: known false-positive matches, unrecognized paraphrases, and unimplemented checks are not hidden or relabeled as successes. These curated cases are regression evidence, not a statistically representative accuracy benchmark.

```bash
npm test -- tests/services/fixtureCorpus.test.ts
npm run corpus:compare
npm run corpus:compare -- --json
npm run corpus:compare -- --report-json
```

The comparison command evaluates every retained corpus against the current **local rules only**; it does not call semantic providers or independently verify facts. It reports known positives detected, known negatives avoided, correct applicability abstentions, false-positive traps triggered, paraphrase misses, ambiguous cases, and assessment coverage gaps. Positive expectations include both ordinary positive and paraphrased cases. Counts are broken down by dataset version; overlapping retained versions are not independent samples. `--json` preserves the observations-array format. `--report-json` adds per-category/source summaries, explicit failure records, baseline transitions and failure replay results.

Risk signals use an assessed index of at least 1. Positive Refusal Quality uses an assessed index of at least 60, matching the local rule's deficient-quality boundary; a poor refusal's nonzero quality score is **not** a detected positive or a high-risk index. These are transparent evaluation conventions, not probabilities or universal truth thresholds.

Ambiguous expectations are never labeled correct or incorrect. `not_assessed` and `insufficient_context` are coverage gaps, not false negatives or clean negatives. When a human expects a signal but the tool returns `not_applicable`, the report records an **applicability miss** (a false-negative subtype), preserving that actual state instead of treating it as an assessed zero. When absence is expected, `not_applicable` is a correct abstention, separate from an assessed negative avoided.

Baseline changes compare **identical retained inputs** against their own recorded rule version, not v1 examples against differently worded v2 examples. Counts distinguish numeric/state drift, outcome changes, introduced/resolved/persistent failures, and failures that become unassessed. Lost coverage is not reported as a fix. Older synthetic baselines have no recorded auditor version; that remains null.

Preserve [v1](tests/fixtures/corpus/v1.ts) and the older clean-text, hedging, and provider-parity fixtures. For intentional rule changes, increment `LOCAL_RULE_VERSION`, add a new corpus version with its recorded baselines, and register it in [the corpus index](tests/fixtures/corpus/index.ts); do not overwrite historical cases or baselines. The latest corpus must cover the current registry and rule version. Historical versions remain evaluable for drift without forcing current rules to reproduce superseded behavior.

### Real-world intake and retained failures

The [real-world dataset](tests/fixtures/evaluation/real-world.v1.json) starts **empty**: no actual ChatGPT, Claude, Gemini or Grok transcripts were supplied, and synthetic fixtures are never relabeled as real. Collect genuine responses that seem annoying, surprising or ambiguous, with source/model information when known. Do not claim a model revision or collection date you cannot establish; use null for unknown `model` / `collectedAt`. Human labels are expectations for discussion, not objective truth.

Before saving, remove private material from **all fields**, including the prompt, response, notes, model label and IDs: names, email addresses, account/project identifiers, secrets, private URLs and sensitive facts. Replace them with consistent neutral placeholders without changing the behavior being evaluated. Review redactions manually; `privacyReview.confirmed` is a required attestation, **not automatic anonymization**. Record how material was removed in `privacyReview.note`. No third-party services are used by the corpus CLI.

Each case has this shape (placeholders are a format guide, **not collected responses**):

```json
{
  "id": "RW-0001",
  "sourceModel": "chatgpt",
  "model": null,
  "collectedAt": null,
  "originalPrompt": "<sanitized original prompt, or empty if unavailable>",
  "response": "<actual sanitized response; do not use this placeholder>",
  "privacyReview": {
    "confirmed": true,
    "note": "<describe the completed manual privacy review>"
  },
  "expectations": [
    {
      "categoryId": "grounding_avoidance",
      "intendedSignal": "ambiguous",
      "note": "<what the auditor should notice, and why this is ambiguous>"
    }
  ],
  "baseline": null
}
```

Place cases inside `{ "schemaVersion": "1.0.0", "version": "1.0.0", "cases": [...] }`. Sources accept `chatgpt`, `claude`, `gemini`, `grok`, and `other`; add one expectation for each relevant category using `present`, `absent` or `ambiguous`. Duplicate IDs/categories, missing review/labels, invalid timestamps, unknown fields and malformed baselines are rejected explicitly. The category IDs are those in [the registry](src/constants.ts). A real case may have multiple category expectations, so reports count category observations, not conversations.

```powershell
# Evaluate a reviewed input, then capture its current audit before tuning rules.
npm run corpus:compare -- --real-world .\tests\fixtures\evaluation\real-world.v1.json --report-json
npm run corpus:compare -- --real-world .\tests\fixtures\evaluation\real-world.v1.json --record-real-world .\tests\fixtures\evaluation\real-world.baseline.v1.json

# Keep that baseline; replay it after rule changes.
npm run corpus:compare -- --real-world .\tests\fixtures\evaluation\real-world.baseline.v1.json

# Snapshot explicit failures; all output files must be NEW paths.
npm run corpus:compare -- --real-world .\tests\fixtures\evaluation\real-world.baseline.v1.json --record-failures .\tests\fixtures\evaluation\failures.v2.json
npm run corpus:compare -- --real-world .\tests\fixtures\evaluation\real-world.baseline.v1.json --failures .\tests\fixtures\evaluation\failures.v2.json --report-json
```

Unlike automatic audit history and audit exports, an **explicitly created evaluation dataset intentionally stores the sanitized original prompt and response** for reproducible replay. It does not read browser history or collect conversations automatically. A recorded real-world baseline contains auditor/prompt/rule versions, UTC audit time, local analysis provider/model, and actual states/indices for all labeled categories. Each recorded category also has a fingerprint binding its baseline to the source inputs and human expectation; editing those in place is rejected even when the case has never been a tracked failure. Raw intake and its baseline snapshot share the same input-version ID; load one snapshot per version, not both. Preserve the first baseline; create a new dataset version when adding or changing inputs/labels, and retain the older file.

The checked-in [failure ledger](tests/fixtures/evaluation/failures.v1.json) was generated from actual executions of the **synthetic** v1/v2 fixtures, and is replayed by default. Each record has a stable FP/FN ID, dataset/case reference, source/model, category, auditor/prompt/rule versions, actual assessment state/index, expected human signal, evaluation threshold, audit timestamp and explanation. The ledger does not duplicate prompt/response text. SHA-256 fingerprints bind it to the retained source inputs and human labels; missing or modified cases cause actionable errors instead of silent skipping. Use repeated `--real-world PATH` options to load different retained dataset versions needed by a ledger. `--failures PATH` selects a newer ledger explicitly; new snapshots do not silently replace the default.

Replay reports each old failure as persistent, resolved, or now unassessed, retaining the original failure ID. Ambiguous cases and unavailable checks remain visible in summaries, but are not invented FP/FN records. `--no-replay` is only for explicitly seeding a new ledger before a prior ledger exists; normal evaluation always replays the default or selected ledger. Output files are never overwritten. These curated counts guide rule debugging; they are **not an accuracy benchmark**.

## Disclaimer

- This tool is a diagnostic assistant for tone analysis, not a legal, compliance, HR, or safety adjudication system.
- Scores and findings are heuristic/model-derived signals and may produce false positives or false negatives.
- Always review critical outcomes with human judgment before taking policy, moderation, or operational action.
- If you send real user data to external providers, ensure your deployment and data handling comply with your privacy and security requirements.

## Provider migration checklist

- [x] Provider abstraction introduced (`services/analyzeTone.ts`, provider factory, runtime metadata).
- [x] Real secondary provider implemented (Anthropic adapter).
- [x] Local rules are the default; fallback is optional and only explicitly configured providers are attempted.
- [x] Fixture parity tests added for contract and category consistency.
- [x] Docs and env examples updated to provider-neutral setup.
- [x] Add CI step to run `npm run test:parity` on pull requests.
- [x] Add production observability for provider failures and fallback frequency.
- [x] Remove deprecated provider/package/config after parity and stability gates.

---
*Built to make AI interactions more human, one audit at a time.*
