# Changelog

Meaningful releases use semantic package versions and annotated `vX.Y.Z` Git tags. This file describes user-visible changes; the auditor, semantic prompt and local matching rules have separate version identifiers in exports. See [release discipline](docs/RELEASING.md).

## Unreleased

### Added

- An explicit AI feelings disclaimer in the application and documentation: the project treats AI as tools and does not attribute feelings or emotional needs to them; generated emotional language does not establish subjective experience.
- A provider-independent, unscored anthropomorphism safeguard with exact source passages, context-only exclusions, and explicit withholding of generated auditor claims about AI feelings or subjective experiences. History and audit/comparison exports retain safeguard records and preserve source quotations.
- Semantic prompt `2026-10-12.v16` requires observable-behavior explanations and avoids endorsing AI emotional self-reports; the safeguard has independent version `2026-10-12.v1` and does not change category-scoring rules.
- Optional evaluation schema `1.1.0` annotations for exact evidence passages, retained exclusions and expected assessment states; legacy `1.0.0` files and fingerprints remain valid.
- Separate evidence-location, exclusion, invalid-record and coverage reporting, evidence baseline replay, and development/held-out summaries with equivalent-input leakage checks.
- Twenty-four authored cases in twelve positive/counterexample pairs spanning ordinary advice, uncertainty, apologies, summaries, attributed quotations and examples/code. These cases expose known detector gaps without relabeling them as successes or genuine transcripts.

### Fixed

- Dictionary markers respect Unicode word boundaries, preventing matches such as `just` inside `adjustment` or `unjustly`.
- Phrase markers recognize horizontal whitespace, a single line wrap and straight/typographic apostrophe variants while retaining exact original-text evidence.
- Explicitly attributed quotations remain inspectable as reported speech and do not contribute to local scores or support positive semantic scores.

### Changed

- Dictionary and auxiliary empathy rules have explicit stable IDs; existing stored occurrence IDs remain readable.
- Local rules advance to `2026-10-12.v4`. Corpus v4 records two resolved quotation false positives while preserving v1-v3 baselines and the historical failure ledger.

## 1.1.0 - Prepared, not yet tagged or published

### Added

- Exact source evidence and occurrence-level local detection, including repeated phrases and inspectable code/example exclusions.
- Finding-to-passage navigation with surrounding sentences in single and comparison audits; explicit unverified semantic quotations and backward-compatible history.
- Separate local finding feedback and exact missed-passage reports with stable audit references and immutable original automated snapshots.
- Memory-only evaluation-case previews in both audit views, mandatory manual privacy review, response-level expectation confirmation, and origin-preserving synthetic CLI intake/baseline replay.

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
- Semantic prompt: **2026-10-09.v15**, requesting exact quotations and nullable source positions; unsupported positive communication risks are withheld locally.
- Local matching rules: **2026-10-09.v3**, retaining phrase tokens/categories/weights while counting each eligible occurrence and excluding explicit code, blockquotes, and examples. The v3 corpus records intentional context changes without overwriting historical baselines.
- Export schema **1.1.0** retains optional evidence positions, verification/eligibility states, and full occurrence records.
- Historical fixtures, failure records and exports retain their original versions; unknown metadata is not backfilled.
- Unsupported Certainty remains unassessed. No source retrieval, factual claim-support checking or hidden-tool verification was added.
- The real-world dataset remains empty until genuine, manually sanitized responses are supplied. Demo samples are authored, not vendor transcripts.

This is a release candidate in the working tree, not a claim that a Git tag or GitHub release already exists. Earlier versions are not retrospectively tagged or given invented release dates.
