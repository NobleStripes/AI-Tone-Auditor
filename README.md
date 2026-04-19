# AI Tone Auditor Core

AI Tone Auditor is a specialized diagnostic tool designed to help users identify and remediate the "Karen" persona often found in default LLM outputs. It provides deep semantic analysis to ensure your AI interactions are professional, clear, and free from bureaucratic condescension.

## Core Intent

Many Large Language Models (LLMs) default to a personality that can come across as overly formal, evasive, or "Karen-like"—characterized by passive-aggressive helpfulness, bureaucratic jargon, and a lack of genuine empathy. 

The core intent of this tool is to:
1. **Detect Default Bias**: Identify when an LLM is slipping into its default, overly robotic or quietly condescending personality.
2. **Prevent the "Karen" Persona**: Flag specific phrases and tones that contribute to a negative user experience.
3. **Customize AI Personality**: Provide actionable feedback and prompt snippets to help users tune their AI's personality to be more authentic and effective.
4. **RLHF-inspired feedback**: Offer specific strategies to "un-learn" negative patterns through better custom instructions and prompt engineering.

## Examples of "Karen" Patterns

The auditor specifically looks for these common bureaucratic and passive-aggressive triggers:

- **"As an AI language model..."**: The ultimate accountability shield. Used to evade direct answers while maintaining a lecturing, superior tone.
- **"I'm sorry you feel that way."**: The classic "Non-Apology Apology." It shifts the focus to the user's emotions to avoid taking responsibility for the AI's own confusing or incorrect output.
- **"Let's take a step back."**: A common tone-policing tactic. Used to halt a challenging discussion by implying the user is being too aggressive or "unprofessional."

## Key Features

- **Semantic Deep Scan**: Analyzes text for subtle tone shifts and bureaucratic patterns.
- **Trigger Word Analysis**: Detects specific phrases from our "Karen/Gaslight" dictionary.
- **Contextual Heatmap**: Visualizes areas of low context or evasive language.
- **Universal Custom Instructions**: Generates a list of specific, actionable instructions that can be added to any LLM's system prompt or custom instructions field.
- **RLHF-inspired feedback**: Provides "Reinforcement Learning from Human Feedback" style suggestions for immediate prompt improvement.
- **Multi-provider runtime**: Supports provider routing with automatic fallback between configured AI engines.

## Getting Started

1. Paste your AI's response into the auditor.
2. Run the audit to see the Tone Distribution Profile.
3. Review the "Anti-Karen Remediation Strategy" and "Universal Custom Instructions".
4. Copy the suggested instructions to tune your AI's system prompt.

## Run and deploy your AI Studio app

This application is built as an AI Studio applet. To run it locally or deploy it, follow these steps:

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
   OPENAI_MODEL=gpt-4o-mini
   ANTHROPIC_API_KEY=your_anthropic_key_here
   ANTHROPIC_MODEL=claude-3-5-haiku-latest
   AI_PROVIDER=openai
   AI_FALLBACK_PROVIDER=anthropic
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

### Deployment

AI Studio apps are designed to be deployed seamlessly within the AI Studio environment. To share your app:

1. Ensure all changes are committed.
2. Use the **Share** button in the AI Studio interface to generate a public URL.
3. Your app will be hosted on a `.run.app` subdomain, ready for use by others.

## Tech Stack

- **Frontend**: React, Tailwind CSS, Framer Motion
- **AI Providers**: OpenAI and Anthropic (provider-agnostic orchestrator with fallback)
- **Visualizations**: Recharts
- **Icons**: Lucide React

## Provider Configuration

- `AI_PROVIDER`: Primary provider. Supported values: `openai`, `anthropic`, `local`.
- `AI_FALLBACK_PROVIDER`: Secondary provider used if primary fails.
- `OPENAI_MODEL`: Optional model override for OpenAI provider. Defaults to `gpt-4o-mini`.
- `ANTHROPIC_MODEL`: Optional model override for Anthropic provider. Defaults to `claude-3-5-haiku-latest`.
- Footer status bar displays `FALLBACK_RATE` and fallback activation count for live deprecation telemetry.

## Trigger weight tuning guide

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
