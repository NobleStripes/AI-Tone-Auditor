# Multi-model comparison

[Back to README](../README.md)

1. Select **Multi-model comparison**.
2. Paste one **Original prompt (shared)** and 2 to 5 response texts.
3. Select ChatGPT, Claude, Gemini, Grok, or Other for each response. Multiple responses from the same source are allowed.
4. Click **Compare responses**. Editing does not automatically make paid audit calls.
5. Review category-by-category indices, assessment states, confidence, and quoted evidence under each **Inspect** panel.

The universal pass (local rules by default, semantic when explicitly configured) hides the response source and original prompt, using the same model-agnostic rubric for every response. The same original prompt is then used locally for general contextual checks and the eligible Claude/Grok lens. Response text is sent to an external auditing provider only when one is selected or an explicitly configured external fallback is attempted; the original prompt is not sent to third-party providers. All 2 to 5 responses work without paid calls in local-only mode. This mode audits pasted responses, not model-generation quality under controlled sampling.

The table shows numeric spread only when at least two assessed values have recorded methods and matching provider/model, auditor, prompt and local-rule versions. Unknown or unequal conditions withhold the spread; the individual observations remain visible. Fallback alone does not disqualify a result if the actual auditing conditions still match, but a different fallback provider/model does. Source-specific lenses are explicitly not universal comparisons. Refusal Quality remains a positive quality metric, never part of an aggregate risk or ranking. No winner or aggregate leaderboard is calculated; differences do not establish superiority, accuracy, or model identity. Auditor/model and fallback metadata are visible in the column headers and inspection panels.

Audits run sequentially to bound load. Failures stay attached to their response as explicit errors, not zero scores. Canceling stops scheduling further responses after any already-running provider call settles; the browser does not display an incomplete canceled batch. Comparison drafts and the original prompt are not stored in local audit history. **Export comparison JSON** retains response texts, result/error records, per-response audit provenance, versions, UTC timestamps, and a stable comparison-session ID, but omits the original prompt. Per-response exports use the same session ID.

The API endpoint is `POST /api/compare`:

```json
{
  "originalPrompt": "Explain this compiler error and cite sources.",
  "responses": [
    { "id": "response-1", "sourceModel": "chatgpt", "text": "The argument type is an integer." },
    { "id": "response-2", "sourceModel": "grok", "text": "The argument type is a string." }
  ]
}
```

IDs must be unique and at most 64 characters. The shared prompt is required and limited to 5,000 characters; each response must contain at least 10 non-padding characters and at most 50,000 total characters. Invalid batches return `400`. A valid batch returns `comparison` with version metadata and input-ordered `completed`/`failed` items, plus provider telemetry. A completed item includes its source, response text, analysis result, and auditing-provider metadata.

---

Related: [Demo and worked comparison](DEMO.md) | [Exports and reproducibility](EXPORTS.md)
