# Release discipline

[Back to README](../README.md)

## Version responsibilities

- **Auditor/package version** identifies a reviewed application release and appears in audit/export provenance. Use a minor release for meaningful features, a patch for compatible fixes/copy improvements, and a major release for breaking contracts.
- **Semantic prompt version** changes whenever provider-visible instructions or category wording change.
- **Local-rule version** changes when matching, eligibility, thresholds or scoring change. Explanation-only copy can be tracked by the auditor version without changing matcher baselines.
- **Corpus/dataset version** preserves exact inputs, human expectations and recorded baselines. Retain old versions; never edit away a known failure.

A versioned export is traceable evidence, not guaranteed replay: vendor aliases can evolve, semantic output can vary, and prompt context must be supplied separately. An unreleased working tree may already carry the next package version; the changelog must label it prepared/unreleased until its reviewed commit is tagged.

## Preparing a release

1. Review the complete intended release scope. Do not include unrelated worktree changes, private transcripts, API keys or generated test history.
2. Update the package version without creating a commit or tag:

   ```powershell
   npm version 1.1.0 --no-git-tag-version
   ```

   For this prepared release it has already been done. Choose the next version for later releases. Keep the root versions in the manifest and lockfile aligned.

3. Update [CHANGELOG](../CHANGELOG.md), prompt/rule identifiers when applicable, and directly related documentation. Add new baselines for intentional matching changes while retaining older fixtures and failure ledgers.
4. Check the exact expected results, not just absence of baseline drift:

   ```powershell
   npm run lint
   npm test
   npm run test:parity
   npm run corpus:compare
   npm run build
   ```

   Known FP/FN records are not necessarily release blockers, but unexplained changes are. Report unresolved failures, coverage gaps and the existing build-size warning honestly.

5. Manually verify key-free single and comparison audits, source-lens exclusions, positive-quality placement, exports and restored history. Exercise unequal auditing models/providers/versions, a configured fallback, a failed item, and an all-failed batch. Confirm individual observations remain visible, incompatible spreads are withheld, and no winner is generated.
6. Capture screenshots only from reviewed synthetic inputs with real local results. State which samples are authored; do not use simulated semantic-provider stress results as public benchmark screenshots. Preserve existing user history when cleaning up your own smoke-test entries.
7. Select and commit only the reviewed release files. Record validation results and limitations in the release notes. Keep the release candidate marked prepared until this step is approved.

## Tagging and publishing (maintainer action)

Do not tag a dirty worktree or an unrelated commit merely because the manifest says 1.1.0. First ensure the intended changes are in the reviewed release commit and the relevant checks ran on that commit. Update the changelog entry with the actual release date, then use an annotated tag:

```powershell
git --no-pager status --short
git --no-pager show --stat HEAD
git tag -a v1.1.0 -m "AI Tone Auditor 1.1.0"
```

Inspect the tag before publishing. Push the reviewed commit and tag only when ready, then create a GitHub release from that tag with the changelog summary, validation results and known limitations. Tagging and publishing are explicit maintainer actions; this checklist does not perform them automatically. Never move an existing published tag to conceal subsequent changes.

## Unsupported Certainty: separate future project

Keep it unassessed until a factual-verification design exists. A future implementation would need claim extraction, authorized retrieval, dated source provenance, claim-to-source support evidence, assessment coverage and uncertainty. Distinguish **unsupported in the visible answer**, **not verified**, **contradicted by checked sources**, and **false**; none is interchangeable with another. Citation presence or confident wording alone is not verification. Do not approximate this project with certainty-word regexes.
