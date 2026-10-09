# Exports and reproducibility

[Back to README](../README.md)

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

Export schema **1.1.0** adds optional finding evidence and full lexical occurrence records without removing older result fields. Evidence records retain exact matched text, UTF-16 half-open positions, verification status, eligibility, and exclusion/unverified reasons. Markdown distinguishes located eligible passages from reported/unverified quotations and lists excluded lexical occurrences separately. An absence-based finding may identify the inspected response scope rather than a positive phrase match. Legacy exports without positions remain readable and are not presented as newly verified. The private original prompt remains excluded from both formats.

Re-exporting does not change the original analysis timestamp, versions or session ID. Editing the input/source selector after an audit does not rewrite that audit's provenance. Loading history resets context-dependent assessments because the private prompt is unavailable, and exports mark that restored context while retaining the original audit metadata. Legacy records preserve known provider/source information, but missing versions or analysis timestamps remain null in JSON and **Unknown** in Markdown rather than being assigned today's values.

These fields support traceability, not guaranteed deterministic replay: supply the original response and private prompt separately when re-auditing. Model aliases can evolve, semantic output is stochastic, and the local checks cannot inspect hidden retrieval.

## Evaluation-case exports are a separate explicit action

**Export evaluation case** is available for a completed single audit or each completed comparison response. Unlike ordinary audit JSON/Markdown, it intentionally includes the **sanitized original prompt and response** for reproducible evaluation. History never becomes a dataset automatically.

The preview lets you edit the case ID/dataset version, genuine versus synthetic origin, response source, nullable model/date, full prompt/response, category labels/notes and privacy-review explanation. Unknown model versions and collection dates stay `null`; auditor metadata is not substituted. Baselines are always `null` until the CLI records a fresh local run. Do not reduce the case to a flagged phrase without reviewing the surrounding context.

Every expectation needs explicit full-response confirmation. Passage feedback is only a suggestion: a disputed phrase does not prove the entire response lacks that category. Wrong category proposes editable labels for both categories; conflicting suggestions start ambiguous. Refusal Quality uses positive quality, not deficiency. Unimplemented or contextless checks may replay as unassessed.

Completed privacy review and a nonempty review explanation are required. Review **all fields**, including identifiers and notes. Any edit after privacy confirmation invalidates it; text/source edits also reset category confirmations. The shared evaluation validator checks the exact final payload immediately before download. Use localhost or HTTPS for browser fingerprinting.

Drafts are memory-only, canceled on close/audit change, and are not automatically saved to browser storage or the repository. Local receipts contain only audit/report references, case/version/origin, export time and a content fingerprint, not the private prompt. They prevent reuse of an exported version with different content while retained; after clearing receipts or moving browsers, you must maintain version discipline yourself. Redactions produce a reviewed derivative: original evidence offsets are not applied to edited case text. Edited exports need new retained versions.

Genuine exports preserve evaluation schema **1.0.0** exactly. Authored/synthetic exports add required top-level `datasetKind: "synthetic"` and use `--synthetic`, not `--real-world`. Both use the same reviewed case fields. See [evaluation intake and replay](EVALUATION.md).

---

Related: [Understanding diagnostics](DIAGNOSTICS.md) | [Multi-model comparison](COMPARISON.md)
