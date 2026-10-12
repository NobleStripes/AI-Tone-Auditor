# Setup and providers

[Back to README](../README.md)

Run commands from the repository root.

## Run and deploy

This application runs as a web frontend plus a local Express API. External provider integration is optional; the API server is still required for local analysis.

### Prerequisites

- Node.js 24 LTS
- npm

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

API errors contain a safe message, stable `code`, and correlation `requestId`; they never include upstream bodies, keys, submitted text, environment values or stacks. Logs contain only allowlisted failure codes, provider IDs and request IDs. The browser also suppresses arbitrary proxy/HTML error bodies. Inspect operator configuration and provider dashboards rather than relying on raw upstream errors.

### Claude / Anthropic notice

Selecting **Claude** as the source of a pasted response does not itself contact Anthropic. Setting `AI_PROVIDER=anthropic` enables Anthropic API auditing; setting `AI_FALLBACK_PROVIDER=anthropic` allows response text to be sent to Anthropic if the primary audit fails. Those API calls remain subject to Anthropic's applicable terms and [Usage Policy](https://www.anthropic.com/legal/aup).

AI Tone Auditor independently evaluates observable communication patterns. Findings can be wrong and do not establish a model's intentions, feelings, or subjective experiences. The project is not affiliated with or endorsed by Anthropic. The [anthropomorphism safeguard](DIAGNOSTICS.md#anthropomorphism-safeguard) applies to all sources and auditing providers, including local mode.

Anthropic's [October 8, 2026 policy announcement](https://www.anthropic.com/news/2026-usage-policy-update) says the updated policy takes effect on **November 12, 2026**. Its explanation of the new model-abuse restriction excludes ordinary frustration, pushback, dark creative themes, and model testing and research. This notice describes the project's purpose and API behavior; it does not guarantee Anthropic's acceptance of any particular use.

### Deployment

Deploy the built frontend and Express API behind a **TLS-terminating reverse proxy**. A static-only deployment cannot perform audits, including local heuristic audits. Do not expose the Vite development server on the public internet. Typical flow:

1. Build the app:
   ```bash
   npm run build
   ```
2. Publish the generated `dist/` directory to your host.
3. Run the API server with your platform's TypeScript runner/build setup, and route frontend `/api` requests to it. No provider keys are required for the default local mode; explicitly opt in to external providers/fallback if wanted. A publicly hosted local-mode server still receives the response text.

#### Protected public/LAN mode

Express, Vite development and Vite preview bind to `127.0.0.1` by default. Local key-free API requests require a loopback peer, a loopback Host, and either no Origin (CLI) or a loopback browser origin. Invalid/missing JSON objects, unknown fields, unsupported sources/types, and overlong text are rejected. Only uncompressed `application/json` is accepted; the body limits are 512 KiB for analyze and 2 MiB for compare.

For **any** remotely reachable deployment, including a proxy forwarding to loopback, set `API_PUBLIC_MODE=true` explicitly. Protected mode is never inferred from request headers. Configure:

```env
API_HOST="127.0.0.1"
API_PUBLIC_MODE="true"
API_ACCESS_KEY="<a randomly generated operator key of at least 32 characters>"
API_ALLOWED_ORIGINS="https://auditor.example.com"
API_TRUSTED_PROXIES="127.0.0.1"
```

Set the key in a server-side secret store/environment; the placeholder above is not a valid deployment key. A non-loopback `API_HOST` is allowed only in protected mode. `VITE_HOST` can explicitly enable LAN development, but do not publish Vite; serving the production build through the reverse proxy is recommended. Never place secrets in `VITE_*` variables, build artifacts, URLs, logs, browser storage, or source control.

The proxy must preserve the original **Host**, set `X-Forwarded-Proto: https` after terminating TLS, and replace (not blindly append/forward) untrusted forwarding headers. `API_TRUSTED_PROXIES` accepts exact IPs/subnets, not `true`, hop counts or a trust-everyone subnet. Trust only dedicated proxy addresses; firewall the API listener so clients cannot bypass the proxy. Exact HTTPS origins are comma-separated, with no path or trailing slash. The API Host must match an allowed origin's host/port. Missing Origin is allowed for authenticated non-browser clients; `null` or unlisted origins are rejected. Same-origin `/api` routing is simplest.

Apply HTTPS redirects/HSTS and security headers to the **frontend/static responses** at the proxy too; Express's Helmet headers cover the API. Use a frontend Content-Security-Policy restricted to your own script/connect origins, `frame-ancestors 'none'`, and an appropriate style policy for the UI. Do not blindly copy a permissive development policy into production. Certificate provisioning, proxy configuration and firewall enforcement are operator deployment steps; this repository does not provision them.

Protected mode refuses insecure requests, adds Helmet security headers/HSTS, and authenticates **before parsing input**. `/api/access` exposes only whether a key is required; `/api/access/check` verifies it. The browser checks access configuration before enabling either audit mode. Enter the operator key in **API access**; it is kept only in memory and sent in an `Authorization: Bearer ...` header. Reloading/relocking clears it. Rejected credentials lock both modes, and locking cancels active browser work. The shared key is single-operator access control, not multi-user identity or tenant isolation.

#### Admission and spending safeguards

All API requests share a fixed **60-second** per-client window (including discovery and failed authentication); IPv6 clients are grouped by `/56`. Default limits:

| Variable | Default | Allowed range / behavior |
| --- | --- | --- |
| `API_RATE_LIMIT` | 20 | 1-10,000 requests/client/minute; excess returns `429` |
| `API_MAX_CONCURRENCY` | 2 | 1-32 active audit jobs; no queue; excess returns `503` |
| `AI_PROVIDER_TIMEOUT_MS` | 15,000 | 1-120,000 ms; zero cannot disable the timeout |
| `AI_PROVIDER_RETRIES` | 1 | 0-2 retries per provider |
| `AI_MAX_OUTPUT_TOKENS` | 3,000 | 1-32,000 output tokens per attempt, subject to model support |
| `AI_DAILY_REQUEST_LIMIT` | 100 | 1-1,000,000 external attempts per UTC day |
| `AI_DAILY_TOKEN_LIMIT` | 1,000,000 | 1-1,000,000,000 reserved token units per UTC day |

Invalid settings fail startup without echoing values. A comparison holds **one** active-job slot for all its sequential items. Disconnection cancels remaining scheduling. A slot remains occupied until underlying provider work actually settles, even if it ignores cancellation; a noncooperative provider cannot free capacity to admit unbounded additional calls. Retry/fallback attempts do not overlap timed-out work.

Immediately before **every** adapter network call, the process atomically reserves one attempt and `UTF-8 bytes of the full JSON request body + 4,096 envelope headroom + configured output cap` token units. The body includes the rendered prompt, system instructions, JSON schema and provider envelope. Failed/canceled calls are not refunded because providers may bill them. All external providers share the same budget, including retries, fallback, comparison and direct CLI/adapter use. Gemini uses the documented Interactions `generation_config.max_output_tokens`; OpenAI/Grok use `max_output_tokens`, and Anthropic uses `max_tokens`.

Provider redirects are rejected rather than silently issuing unreserved requests or forwarding custom credential headers to another endpoint.

Budget exhaustion returns `429` with `BUDGET_EXHAUSTED` and `Retry-After`; it bypasses all retries and fallback, including local fallback. No silent downgrade occurs. Mid-comparison denial stops calls, returns a non-success `429` containing completed items and explicit failed/unavailable remaining items, and the browser displays the partial results alongside the error. Ordinary item failures remain sanitized `failed` items.

These are **single-process in-memory** counters, reset on restart; daily spending counters also reset at UTC midnight. They are conservative reservations, **not exact tokenizer usage, dollar estimates, persistent accounting or a guaranteed billing cap**. Restarting or running multiple instances/CLI processes multiplies available budget. Set billing/usage caps with each provider too. A blocked synchronous local heuristic is not worker-thread CPU isolation. Rate-counter cardinality is bounded to 10,000 live client groups; admission fails closed at capacity.

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
- **Auditors**: Local heuristic auditor + optional OpenAI, Anthropic, Gemini, and Grok semantic auditors
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
