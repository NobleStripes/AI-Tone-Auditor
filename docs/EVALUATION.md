# Evaluation and fixture corpus

[Back to README](../README.md)

Run commands from the repository root.

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

The retained [v1 corpus](../tests/fixtures/corpus/v1.ts), [v2 corpus](../tests/fixtures/corpus/v2.ts), and current [v3 corpus](../tests/fixtures/corpus/v3.ts) each contain **75 cases across all 15 diagnostic categories**, with a positive, negative, ambiguous, false-positive trap, and paraphrased/false-negative case for each. V2 records the research-request and visible verification-hand-off rules. V3 retains the same inputs/labels and records four resolved explicit-code/phrase-discussion false-positive traps (Infantilizing, Hedging, Dismissive, and Over-apologizing); their historical v2 scores remain unchanged. Dedicated evidence tests cover repetitions, exact offsets, quotation validation, context boundaries, history, and navigation. Each case stores the original prompt, selected source, response, intended signal, explanatory note, and exact observed local assessment state/index. Quality examples use the positive quality direction. Unsupported Certainty examples explicitly record that verification is unavailable, not a clean zero.

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

Preserve [v1](../tests/fixtures/corpus/v1.ts) and the older clean-text, hedging, and provider-parity fixtures. For intentional rule changes, increment `LOCAL_RULE_VERSION`, add a new corpus version with its recorded baselines, and register it in [the corpus index](../tests/fixtures/corpus/index.ts); do not overwrite historical cases or baselines. The latest corpus must cover the current registry and rule version. Historical versions remain evaluable for drift without forcing current rules to reproduce superseded behavior.

### Real-world intake and retained failures

The [real-world dataset](../tests/fixtures/evaluation/real-world.v1.json) starts **empty**: no actual ChatGPT, Claude, Gemini or Grok transcripts were supplied, and synthetic fixtures are never relabeled as real. Collect genuine responses that seem annoying, surprising or ambiguous, with source/model information when known. Do not claim a model revision or collection date you cannot establish; use null for unknown `model` / `collectedAt`. Human labels are expectations for discussion, not objective truth.

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

Place cases inside `{ "schemaVersion": "1.0.0", "version": "1.0.0", "cases": [...] }`. Sources accept `chatgpt`, `claude`, `gemini`, `grok`, and `other`; add one expectation for each relevant category using `present`, `absent` or `ambiguous`. Duplicate IDs/categories, missing review/labels, invalid timestamps, unknown fields and malformed baselines are rejected explicitly. The category IDs are those in [the registry](../src/constants.ts). A real case may have multiple category expectations, so reports count category observations, not conversations.

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

The checked-in [failure ledger](../tests/fixtures/evaluation/failures.v1.json) was generated from actual executions of the **synthetic** v1/v2 fixtures, and is replayed by default. Each record has a stable FP/FN ID, dataset/case reference, source/model, category, auditor/prompt/rule versions, actual assessment state/index, expected human signal, evaluation threshold, audit timestamp and explanation. The ledger does not duplicate prompt/response text. SHA-256 fingerprints bind it to the retained source inputs and human labels; missing or modified cases cause actionable errors instead of silent skipping. Use repeated `--real-world PATH` options to load different retained dataset versions needed by a ledger. `--failures PATH` selects a newer ledger explicitly; new snapshots do not silently replace the default.

Replay reports each old failure as persistent, resolved, or now unassessed, retaining the original failure ID. Ambiguous cases and unavailable checks remain visible in summaries, but are not invented FP/FN records. `--no-replay` is only for explicitly seeding a new ledger before a prior ledger exists; normal evaluation always replays the default or selected ledger. Output files are never overwritten. These curated counts guide rule debugging; they are **not an accuracy benchmark**.

---

Related: [Trigger weight tuning](TUNING.md) | [Release checklist](RELEASING.md)
