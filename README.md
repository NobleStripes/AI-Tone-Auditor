# AI Tone Auditor

AI Tone Auditor analyzes AI-generated responses for observable tone and communication patterns, including tone-policing, unsupported intent assumptions, sycophancy, over-apologizing, and repetitive filler. It works without API keys using local heuristic rules by default. Optional semantic auditors include OpenAI, Anthropic Claude, Google Gemini, and xAI Grok, with source-aware diagnostics and evidence-based suggestions for improving response style.

## Thirty-second tour

**Wording signals, not mind reading.** Paste a response, inspect what was actually assessed, then compare responses to the same prompt without declaring a winner.

This preview uses [authored demonstration responses](tests/fixtures/demoComparison.fixture.ts), not actual vendor transcripts. It uses the local heuristic auditor with no paid calls.

**Single-audit finding detail:** quoted wording, tentative explanations and severity separate from match confidence.

![Single local audit finding from an authored technical response](docs/images/single-audit.png)

[See the full demo and worked comparison](docs/DEMO.md), including Response Diagnostics and the multi-model comparison screenshots.

## Core Intent

AI-generated responses can come across as overly formal, evasive, or patronizing, with passive-aggressive helpfulness, bureaucratic jargon, or misplaced emotional framing.

The core intent of this tool is to:
1. **Spot recurring friction**: Flag wording that may read as robotic, evasive or patronizing, without diagnosing a model's personality or hidden bias.
2. **Inspect evidence**: Quote the relevant wording and separate a lexical match from its possible reader impact. Surrounding context can change the interpretation.
3. **Tune response style**: Offer optional custom-instruction snippets for clearer, more useful communication. These suggestions do not change model weights, capability or safety rules.
4. **Feedback, not reverse engineering**: Discuss visible communication patterns without claiming that RLHF, training data or a hidden motive caused them.

## Key Features

- **Optional Semantic Deep Scan**: External providers can interpret subtler tone shifts and bureaucratic patterns beyond the local phrase catalog.
- **Trigger Word Analysis**: Retains individual occurrences with exact positions, separates code/examples from ordinary speech, and scores eligible repetitions.
- **Exact evidence navigation**: Jump from a finding to its passage and surrounding sentence; inspect excluded matches and unverified semantic quotations without treating them as confirmed evidence. Older history remains readable.
- **Result navigation**: Jump directly to single-audit sections or comparison diagnostic groups and response details.
- **Contextual Heatmap**: Displays visible-information hints; local mode measures response length, not whether the original context was adequate.
- **Style Suggestions**: Offers optional instruction snippets. Local suggestions are general templates, not verified remedies or changes to model training.
- **Multi-provider runtime**: Defaults to local rules; fallback is disabled unless explicitly configured.
- **Multi-model comparison**: Compare 2 to 5 pasted responses to one prompt with a source-blind universal rubric, eligible local source lenses, and a neutral differences table.
- **Versioned evaluation corpus**: Retains synthetic baselines, supports privacy-reviewed real-world JSON cases, and tracks explicit false positives/negatives with replayable IDs and non-accuracy summary counts.

## Getting Started

1. Paste an AI response (at least 10 characters) into the auditor. Auto-audit runs after typing stops once the configured threshold is reached; you can also run an audit manually.
2. Use **Jump to** to move between result sections, then review Response Diagnostics and the evidence behind each finding. If you edit the response or audit settings afterward, the app marks the displayed results as belonging to the earlier version.
3. Review the tone recommendations and custom instructions.
4. Copy the suggested instructions to tune your AI's system prompt.

## Quick start

Requires **Node.js 24 LTS** and npm.

```bash
npm install
npm run dev:all
```

Open `http://localhost:3000`. **No API key or `.env` file is required.** Both the frontend and Express API are needed, including for local analysis.

By default, audits stay within the running app/server, with no external provider or fallback calls. A remotely hosted instance still receives your response text. See [setup and provider configuration](docs/SETUP.md) to opt into semantic auditing, configure fallback, or deploy.

## Documentation

| Guide | Details |
| --- | --- |
| [Setup and providers](docs/SETUP.md) | Local-only mode, optional semantic providers, errors, deployment and CI. |
| [Understanding diagnostics](docs/DIAGNOSTICS.md) | Assessment states, severity versus confidence, category limits and source lenses. |
| [Multi-model comparison](docs/COMPARISON.md) | Shared-prompt workflow, comparability, failures, privacy and API contract. |
| [Demo and worked comparison](docs/DEMO.md) | All three screenshots and one benign prompt with four authored response styles. |
| [Exports and reproducibility](docs/EXPORTS.md) | Captured audit provenance, comparison-session IDs and restored-history behavior. |
| [Evaluation and fixture corpus](docs/EVALUATION.md) | Retained baselines, sanitized real-world intake, FP/FN tracking and replay. |
| [Trigger weight tuning](docs/TUNING.md) | Weight ranges, tuning workflow and scoring guardrails. |
| [Release checklist](docs/RELEASING.md) | Version responsibilities, validation and maintainer tagging steps. |
| [Changelog](CHANGELOG.md) | Prepared releases and historical changes. |

## Disclaimer

- This tool is a diagnostic assistant for tone analysis, not a legal, compliance, HR, or safety adjudication system.
- Scores and findings are heuristic/model-derived signals and may produce false positives or false negatives.
- Always review critical outcomes with human judgment before taking policy, moderation, or operational action.
- If you send real user data to external providers, ensure your deployment and data handling comply with your privacy and security requirements.

---
*Built to make AI interactions more human, one audit at a time.*
