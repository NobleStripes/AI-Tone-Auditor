# Trigger weight tuning

[Back to README](../README.md)

Run commands from the repository root.

Use trigger `weight` in [src/constants.ts](../src/constants.ts) to tune local detection sensitivity/weighting.

`TONE_CATEGORIES` in `src/constants.ts` is the category registry: score IDs, labels, diagnostic groups, risk/quality direction, and context requirements generate score/assessment defaults, validation keys, schema properties, local weight initialization, and chart/list data. Provider prompts analyze response text only; context-dependent comparison is owned by the local comparison service.

| Weight range | When to use | Typical examples |
| --- | --- | --- |
| `0.40 - 0.70` | Weak single-token words that often appear in neutral text | `just`, `simply`, `merely` |
| `0.80 - 1.20` | Mild hedges or generic qualifiers | `I believe`, `Typically,` |
| `1.30 - 1.90` | Medium-signal phrases that may indicate tone drift in context | `Let's focus on`, `It's worth noting` |
| `2.00 - 2.60` | Strong tone-policing or refusal templates | `Let's keep this professional`, `Calm down` |
| `2.70 - 3.20` | High-weight lexical markers; interpretation requires context | `As an AI language model`, `I'm sorry you feel that way` |

Weights control a marker's contribution to a local heuristic index, not evidence confidence or probability. Even a high-weight phrase can be appropriate in context; the phrase alone does not establish intent or evasion.

Recommended tuning workflow:

1. Start by lowering noisy one-word triggers before raising high-impact phrases.
2. Adjust only a small batch (3-8 triggers) per pass.
3. Run `npm run test:parity` and compare score spread before and after changes.
4. Keep category deltas stable across providers; avoid changes that cause large single-category spikes.
5. Record why each non-default weight was added so future tuning stays consistent.

Safety guardrails:

- Avoid setting single-token words above `1.0` unless they are highly domain-specific.
- Prefer multi-word markers; review false positives and paraphrase misses against labeled cases.
- If one category starts dominating all outputs, reduce top weights in that category by `0.1 - 0.3` increments.
- Keep highest-impact trigger count small so scoring remains interpretable.

---

Related: [Evaluation and fixture corpus](EVALUATION.md) | [Release checklist](RELEASING.md)
