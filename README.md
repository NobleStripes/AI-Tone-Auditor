# AI Tone Auditor Core

AI Tone Auditor analyzes AI-generated responses for observable tone and communication patterns, including tone-policing, unsupported intent assumptions, sycophancy, over-apologizing, and repetitive filler. It supports OpenAI, Anthropic Claude, Google Gemini, and xAI Grok, with optional source-aware diagnostics and evidence-based suggestions for improving response style.

## Core Intent

AI-generated responses can come across as overly formal, evasive, or patronizing, with passive-aggressive helpfulness, bureaucratic jargon, or misplaced emotional framing.

The core intent of this tool is to:
1. **Detect Default Bias**: Identify when an LLM is slipping into its default, overly robotic or quietly condescending personality.
2. **Identify Unhelpful Tone Patterns**: Flag specific phrases and tones that can undermine a clear, respectful response.
3. **Customize AI Personality**: Provide actionable feedback and prompt snippets to help users tune their AI's personality to be more authentic and effective.
4. **RLHF-inspired feedback**: Offer specific strategies to "un-learn" negative patterns through better custom instructions and prompt engineering.

## Examples of Bureaucratic and Dismissive Patterns

The auditor specifically looks for these common bureaucratic and passive-aggressive triggers:

- **"As an AI language model..."**: The ultimate accountability shield. Used to evade direct answers while maintaining a lecturing, superior tone.
- **"I'm sorry you feel that way."**: The classic "Non-Apology Apology." It shifts the focus to the user's emotions to avoid taking responsibility for the AI's own confusing or incorrect output.
- **"Let's take a step back."**: A common tone-policing tactic. Used to halt a challenging discussion by implying the user is being too aggressive or "unprofessional."

## Key Features

- **Semantic Deep Scan**: Analyzes text for subtle tone shifts and bureaucratic patterns.
- **Trigger Word Analysis**: Detects specific phrases from the tone-pattern dictionary.
- **Contextual Heatmap**: Visualizes areas of low context or evasive language.
- **Universal Custom Instructions**: Generates a list of specific, actionable instructions that can be added to any LLM's system prompt or custom instructions field.
- **RLHF-inspired feedback**: Provides "Reinforcement Learning from Human Feedback" style suggestions for immediate prompt improvement.
- **Multi-provider runtime**: Supports provider routing with automatic fallback between configured AI engines.

## Getting Started

1. Paste your AI's response into the auditor.
2. Run the audit to see the Tone Distribution Profile.
3. Review the tone recommendations and custom instructions.
4. Copy the suggested instructions to tune your AI's system prompt.

## Run and deploy

This application runs as a standard web app with API-based provider integration.

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env` file in the root directory with provider settings:
   ```env
   OPENAI_API_KEY=your_openai_key_here
   OPENAI_MODEL=gpt-6-luna
   ANTHROPIC_API_KEY=your_anthropic_key_here
   ANTHROPIC_MODEL=claude-sonnet-5-5
   GEMINI_API_KEY=your_gemini_key_here
   GEMINI_MODEL=gemini-3.8-flash
   XAI_API_KEY=your_xai_key_here
   GROK_MODEL=grok-4.7
   AI_PROVIDER=openai
   AI_FALLBACK_PROVIDER=anthropic
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

### Deployment

Deploy using your preferred static hosting or web platform. Typical flow:

1. Build the app:
   ```bash
   npm run build
   ```
2. Publish the generated `dist/` directory to your host.
3. Configure required environment variables for your deployment environment.

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

The tone scores also flag three patterns when supported by the wording:

- **Sycophancy**: unearned praise or agreement without supporting reasons; ordinary politeness and justified agreement are not enough.
- **Over-apologizing**: repeated or generic apologies without a specific error and correction; concise accountability for a real mistake is not enough.
- **Repetitive filler**: restatements, generic framing, or stock closers that do not add information; useful structure and summaries are not enough.

These are probabilistic language signals, not proof of intent or inaccuracy. Review the quoted examples and surrounding context before drawing conclusions.

- **Unsupported Certainty**: not currently scored because the original prompt stays local and factual claims are not independently verified. Missing citations alone do not prove a check was skipped.
- **Grounding Avoidance**: scored only when the prompt explicitly requests citations or use of supplied source material.
- **Refusal Quality**: a positive score shown only when the response actually refuses or partially declines; higher means the boundary is specific, proportionate, and offers a useful allowed alternative.
- **Needless Escalation**: scored only when a neutral prompt receives irrelevant calming, moralizing, or tone-policing language.
- Prompt-comparison scores stay at zero when no original prompt is provided. Local comparison uses conservative visible-text rules; it cannot verify external sources or reliably infer intent and may miss nuance.
- The optional original prompt/context stays in the app/server comparison path and is not sent to third-party semantic providers or saved in local audit history. Local comparison uses conservative visible-text rules and may miss nuance. The response text is still sent to the configured semantic provider. OpenAI Responses, Gemini Interactions, and Grok Responses requests disable provider-side response storage where supported.

## Source model lenses

Source-specific prompt-comparison lenses require original-prompt context. That context stays local and is not available to third-party semantic providers. The **Unsolicited Moralizing** Claude lens runs in the local comparison path; other source-specific semantic comparisons are not generated in this privacy mode. The source model selection does not identify a model from text or imply that all responses from a provider share the same traits.

- **Unsolicited Moralizing** requires Claude as the selected response source and a nonempty original prompt. The auditing provider can be any configured provider, including a fallback.
- The local rule flags narrow, explicit moral admonitions directed at the requester and quotes the lecturing passage. Its `unsolicited_moralizing` risk score is `75` for a clear match and `0` otherwise, not a probability or a judgment of the requester.
- Explicitly requested ethical/legal discussion and concise, specific safety explanations are excluded. A refusal or allowed alternative alone is not moralizing; an appended lecture can be flagged independently of Refusal Quality.
- Without Claude selection or original-prompt context, this score stays zero and no finding is produced. Quoted examples and ambiguous wording are handled conservatively. Lexical rules may miss nuance, paraphrases, or request intent; zero does not prove the absence of moralizing.
- **Paternalistic Redirection** and **Refusal Overreach** remain separate, deferred categories. This lens does not decide whether a refusal was warranted.

Use trigger `weight` in `src/constants.ts` to calibrate detection precision.

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

## Disclaimer

- This tool is a diagnostic assistant for tone analysis, not a legal, compliance, HR, or safety adjudication system.
- Scores and findings are heuristic/model-derived signals and may produce false positives or false negatives.
- Always review critical outcomes with human judgment before taking policy, moderation, or operational action.
- If you send real user data to external providers, ensure your deployment and data handling comply with your privacy and security requirements.

## Provider migration checklist

- [x] Provider abstraction introduced (`services/analyzeTone.ts`, provider factory, runtime metadata).
- [x] Real secondary provider implemented (Anthropic adapter).
- [x] Fallback chain defaults to Anthropic as secondary fallback.
- [x] Fixture parity tests added for contract and category consistency.
- [x] Docs and env examples updated to provider-neutral setup.
- [x] Add CI step to run `npm run test:parity` on pull requests.
- [x] Add production observability for provider failures and fallback frequency.
- [x] Remove deprecated provider/package/config after parity and stability gates.

---
*Built to make AI interactions more human, one audit at a time.*
