# Repository CLI and CI conditions

Run from the repository after `npm ci`, with Node.js 24. The CLI needs no running server. It defaults to the local auditor, even if `AI_PROVIDER` is set in the environment. It does not load `.env`. External calls require `--provider openai|anthropic|gemini|grok`; fallback also requires an explicit `--fallback`. Provider credentials and model overrides come from the process environment. `--source` labels the submitted response, independently of the auditor.

```sh
npm run --silent audit -- response.txt another-response.txt
cat response.txt | npm run --silent audit -- - --source claude
npm run --silent audit -- --batch examples/audit-batch.json --json
npm run --silent audit -- response.txt --prompt-file prompt.txt --output report.json
```

Use `Get-Content -Raw response.txt | npm run --silent audit -- -` in PowerShell for text stdin. Prefer direct file arguments when preserving original line endings matters. Use `--batch -` for JSON stdin. With no input arguments the CLI reads text stdin. All files must be UTF-8; each read is capped at 8 MiB, responses at 50,000 characters, prompts at 5,000, and batches at 100 cases. Responses must contain at least ten nonblank characters. Text characters and UTF-16 evidence positions remain unchanged.

Batch input is an array of objects with unique stable `id`, `text`, and optional `sourceModel` and `originalPrompt`. Missing optional fields inherit the command defaults. Unknown fields and conflicting input options are rejected. The example batch contains authored demonstration responses, not vendor transcripts.

Exit codes are **0** for completed audits that pass configured conditions, **1** for condition violations, and **2** for invalid input, configuration errors, baseline incompatibility, output failure, or a failed audit. Batch audit failures remain explicit and other valid inputs still run. Without configured conditions, findings alone do not cause exit 1.

## Conditions

```sh
npm run --silent audit -- --batch examples/audit-batch.json --conditions examples/audit-conditions.json --json
```

Conditions use schema `1.0.0`. Unknown keys are rejected. Supported `failOn` fields:

| Field | Meaning |
| --- | --- |
| `minSeverity` | Fail on eligible verified findings at or above `low`, `medium`, or `high`. |
| `categories` | Optional category IDs limiting the severity gate. |
| `scoreAtOrAbove` | Map of risk category IDs to thresholds between 0 and 100. |
| `qualityBelow` | Map of quality category IDs to thresholds; currently `refusal_quality`. |
| `requiredAssessments` | Require each listed category to be assessed. |
| `anthropomorphism` | Fail on flagged source claims or matching auditor prose withheld by the guard. |
| `unverifiedFindings` | Fail if a finding lacks verified evidence. |

Category IDs are defined in `src/constants.ts`. Unavailable scores are not interpreted as zero or as a passing assessment. Require specific assessments when missing coverage must fail your job. Excluded code, quotation, and illustrative-example findings do not trigger the severity gate. These are configurable review conditions, not a safety certification.

## Baseline comparison

```sh
npm run --silent audit -- --batch examples/audit-batch.json --output baseline.json
npm run --silent audit -- --batch examples/audit-batch.json --baseline baseline.json --conditions examples/audit-baseline-conditions.json --json
```

An output path must be new: the CLI never overwrites an existing file. Choose a new filename when deliberately recording a replacement baseline. Baselines are CLI reports, distinct from evaluation-corpus files or browser exports.

Comparison requires the same input IDs, exact response, original prompt and source label, plus the same actual auditor and model. A SHA-256 fingerprint binds the inputs without including the original prompt in the report. Hashes do not anonymize easily guessed inputs. Baseline verified passages are checked against the current source. Changed prompts or texts require a deliberately new baseline, rather than a misleading regression comparison.

Reports include new/resolved eligible findings, assessment state changes, coverage loss, comparable score changes, guard claims, and recorded prompt/rule versions. Risk increases and quality decreases both count as adverse changes. Different assessment methods make scores incomparable; a configured numeric regression gate fails instead of silently passing that comparison. Losing an assessment does not count its findings as resolved. Recorded results are retained rather than reprocessed with today's guard.

The `baseline` condition fields are `newFindings`, `maxRiskIncrease`, `coverageLoss`, and `newAnthropomorphismClaims`. A baseline configuration requires `--baseline`. The example policy fails on any of these regressions. Baselines are trusted review artifacts; store and review them accordingly.

## CI and privacy

The repository CI builds the app and extension and runs the authored local batch with the example condition policy. Adapt that command to your reviewed input files. For regression checks, retrieve a reviewed baseline from your CI artifact store before running the second baseline command above. Do not automatically replace the baseline on a failing run.

Use `npm run --silent` when redirecting JSON, so npm's script header does not contaminate stdout. `--output` writes the JSON report even when a condition fails, allowing CI to retain evidence. Reports omit the full input prompt and full response, but findings and diagnostic excerpts can contain submitted text; review artifacts before sharing. Browser exports deliberately include captured response text. Explicit external-provider runs transmit input and prompt to that provider, following the configured provider contract.
