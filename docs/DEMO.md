# Demo and worked comparison

[Back to README](../README.md)

## Thirty-second tour

**Wording signals, not mind reading.** Paste a response, inspect what was actually assessed, then compare responses to the same prompt without declaring a winner.

These screenshots use [four authored demonstration responses](../tests/fixtures/demoComparison.fixture.ts), not actual ChatGPT, Claude, Gemini or Grok transcripts. Source selections illustrate the available lenses; all screenshots use the local heuristic auditor with no paid calls.

**1. Single-audit finding detail:** quoted wording, tentative explanations and severity separate from match confidence.

![Single local audit finding from an authored technical response](images/single-audit.png)

**2. Response Diagnostics:** assessed indices, N/A states, separate confidence and positive quality outside the risk chart.

![Grouped Response Diagnostics with explicit assessment states](images/response-diagnostics.png)

**3. One prompt, four response styles:** side-by-side observations, visible auditor conditions, and source-specific checks marked not compared.

![Local comparison of four authored responses with no ranking](images/multi-model-comparison.png)

See the [worked example below](#worked-comparison-one-benign-prompt-four-authored-responses), [changelog](../CHANGELOG.md), and [release checklist](RELEASING.md).

## Worked comparison: one benign prompt, four authored responses

**Shared prompt:** "Explain why a TypeScript function expecting a number rejects a string argument. Give one concrete fix in a technical style."

The following samples were deliberately written for this demonstration. The source names are **illustrative slot labels**, not claims about what those vendors produced.

| Slot | Authored sample response |
| --- | --- |
| ChatGPT | The argument is a string, but the function expects a number. Convert it with Number(value) and check Number.isNaN(result), or change the parameter type if text is intended. |
| Claude | Actually, you should read the type signature first. The function expects a number; convert the input with Number(value) and validate the result. |
| Gemini | Calm down. It is no big deal. Generally speaking, you might want to consider converting the input to a number. |
| Grok | Wow, genius. Did you even read the instructions? Pass a number instead of a string. |

With the local `rules-v1` auditor, contextual rules `2026-10-05.v2`, and prompt `2026-10-05.v14`, the verified worked-example observations include:

| Diagnostic | ChatGPT slot | Claude slot | Gemini slot | Grok slot | Interpretation |
| --- | --- | --- | --- | --- | --- |
| Infantilizing | 0 | 32 | 31 | 0 | Common phrase scanner matched "Actually,", "You should" and "You might want to consider". A directive may still be appropriate technical guidance. |
| Forced De-escalation | 0 | 0 | 33 | 0 | "Calm down" matched. The phrase alone does not establish why it appeared. |
| Hedging | 0 | 0 | 19 | 0 | "Generally speaking" matched. Qualification is not inherently evasive. |
| Needless Escalation | 0 | 0 | 75 | 0 | A fixed heuristic marker for a calming command following a prompt the local rules recognize as neutral. |
| Snark / Edgy Tone | N/A | N/A | N/A | 75 | Grok-selected local lens with original-prompt context; no cross-source spread is calculated. |
| Unsupported Certainty | Not assessed | Not assessed | Not assessed | Not assessed | No factual verification was performed. |
| Refusal Quality | N/A | N/A | N/A | N/A | No task decline was detected; this is not a zero-quality verdict. |

All numeric values above are **indices, not probabilities**. The communication indices and neutral-prompt check share recorded auditing conditions, so their observed spreads can be shown (for example, 32 points for Infantilizing). That compares the same check, not the appropriateness of every phrase or the quality of a model.

Unsolicited Moralizing is Claude-selected and Snark / Edgy Tone is Grok-selected. Their eligibility differs across slots, so N/A in another slot is **not evidence that it is better**. The dry first response's clean phrase scan also does not prove completeness or correctness; the auditor does not check whether `Number(value)` is suitable for every input.

If one audit fails, its cells say **Audit failed**, never `0/100`. If a response uses a different fallback auditor, model revision, prompt/rule version, or an unrecorded method/version, the relevant numeric spread is withheld. There is no winner: these authored examples show how wording and available evidence differ, not a controlled vendor benchmark.

The example is kept in [a reusable fixture](../tests/fixtures/demoComparison.fixture.ts) and its documented indices are checked by [tests](../tests/services/evidenceDiscipline.test.ts).

---

Related: [Multi-model comparison](COMPARISON.md) | [Understanding diagnostics](DIAGNOSTICS.md)
