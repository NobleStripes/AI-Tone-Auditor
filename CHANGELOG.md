# Changelog

Meaningful releases use semantic package versions and annotated `vX.Y.Z` Git tags. This file describes user-visible changes; the auditor, semantic prompt and local matching rules have separate version identifiers in exports. See [release discipline](docs/RELEASING.md).

## 1.1.0 - Prepared, not yet tagged or published

### Added

- Explicit assessment states: assessed zero, not assessed, insufficient context and not applicable.
- Qualitative evidence/match confidence separate from severity and heuristic indices.
- Grouped Response Diagnostics, with positive Refusal Quality outside the risk chart.
- Two-to-five-response comparison with a shared private prompt, neutral differences and source-specific local lenses.
- Grok-selected snark checks, respecting requested humor and explicit self-roast context.
- Versioned synthetic corpora, privacy-reviewed real-world intake, explicit failure IDs and replayable non-accuracy summaries.
- Audit/export provenance, actual requested auditing model, captured source, timestamps and comparison-session IDs.
- Worked synthetic comparison, three local-mode screenshots and an explicit release checklist.

### Changed

- Local heuristic auditing is the default and needs no API keys. External auditing and fallback require explicit configuration.
- Bureaucratic Stonewalling is scoped to procedural obstruction; legacy `karen_trigger` scores and saved findings remain compatible.
- `stonewallingRemediation` replaces the earlier field, with legacy input migration.
- Grounding Avoidance includes explicit research requests and visible verification hand-offs, without inferring hidden retrieval.
- Provider-specific key failures and bounded raw HTTP errors are surfaced rather than hidden behind an invented fallback.
- Trigger explanations and README claims describe observable wording and possible reader impact, not hidden model motives.
- Finding detail labels explain wording and reader impact rather than claiming to inspect RLHF or safety-alignment weights; legacy `rlhfLogic` data remains readable.
- Comparison headers expose auditor/model/fallback conditions; unequal or unrecorded methods and versions withhold numeric spreads.

### Version notes and limitations

- Prepared auditor/package version: **1.1.0**.
- Semantic prompt: **2026-10-05.v14**, including cautious category wording and glossary instructions.
- Local matching rules: **2026-10-05.v2**, unchanged by the explanation-only dictionary edits. Existing phrase tokens, categories, weights and fixture indices are retained.
- Historical fixtures, failure records and exports retain their original versions; unknown metadata is not backfilled.
- Unsupported Certainty remains unassessed. No source retrieval, factual claim-support checking or hidden-tool verification was added.
- The real-world dataset remains empty until genuine, manually sanitized responses are supplied. Demo samples are authored, not vendor transcripts.

This is a release candidate in the working tree, not a claim that a Git tag or GitHub release already exists. Earlier versions are not retrospectively tagged or given invented release dates.
