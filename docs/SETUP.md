# Setup and providers

[Back to README](../README.md)

Run commands from the repository root.

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
   No `.env` file or API key is required. To customize settings, copy [`.env.example`](../.env.example) to `.env`; its defaults are:
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

The GitHub Actions workflow in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch from the Actions tab. The `validate` job uses Ubuntu and Node.js 24 with npm caching, read-only repository permissions, and a 15-minute timeout. Superseded runs for the same pull request or ref are cancelled.

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

Related: [Understanding diagnostics](DIAGNOSTICS.md) | [Multi-model comparison](COMPARISON.md)
