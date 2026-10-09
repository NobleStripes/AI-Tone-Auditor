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

---

Related: [Understanding diagnostics](DIAGNOSTICS.md) | [Multi-model comparison](COMPARISON.md)
