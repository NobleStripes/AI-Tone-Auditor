# Manual Chrome / Edge auditing

Build the unpacked Manifest V3 extension:

```sh
npm ci
npm run build:extension
```

Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`. Reload the extension there after rebuilding. The extension uses Chrome 120 or a compatible Edge version. Build output is generated locally and is not committed.

Click the extension action on the page to audit. It opens a separate tool window. Choose **Capture selection** after selecting a passage, or **Pick response** then click a supported assistant response container. Review the captured text and check the review box before **Audit**. A source label can be corrected manually; it is inferred from the site, not proof of the model that produced the response.

Auditing is user-triggered. The extension requests `activeTab` and `scripting`, injects only after its action is clicked, and stores no browsing history or audit history. Captures remain in memory for that session. Closing the tool disconnects extraction and clears its page highlights. Restricted browser pages cannot be injected.

## Local default and optional API

The default embeds the repository's local wording rules, prompt-comparison checks, and anthropomorphism safeguard. It needs no API key, running server, or network calls. Type an original prompt yourself if you want local contextual checks; the extension does not harvest user messages or private input boxes from the page.

The optional **Use local API** checkbox explicitly enables `http://127.0.0.1:3001/api/analyze`. Run the repository server on that address, configure its auditor, then grant the requested loopback host permission when auditing. This choice can send the captured response and typed prompt to external providers configured in the server, including a configured fallback. It does not reuse website authentication, page cookies, or keys. API failures remain errors, without silently switching the extension to local results.

## Extraction and passage navigation

Site adapters cover ChatGPT, Claude, Gemini, and Grok, plus common semantic assistant-role attributes. These selectors are best effort and tested against authored DOM fixtures. They have not been validated against every current authenticated vendor interface. When a site changes its markup, use explicit selection; unsupported sites require selection or a recognized semantic response container. Frames and shadow-root responses are not currently traversed.

Extraction creates canonical text from visible text nodes. It preserves their characters and UTF-16 offsets, inserts paragraph separators, and adds code fences, inline-code delimiters and blockquote markers so those passages retain the auditor's exclusion rules. Controls, hidden content and editable drafts are omitted. The preview is the authoritative audit input; it can differ in formatting from the site's rendered response.

Verified evidence maps back to exact DOM text-node ranges. If a finding crosses inserted separators or omitted page content, the extension refuses an inexact highlight. Repeated phrases require explicit evidence positions; approximate matching is not used. Changing text, replacing nodes, hiding the captured region or removing it invalidates results and clears highlights. Recapture and review before completing another audit.

Completed exports are explicit JSON downloads with provider provenance, extraction version, adapter, and captured text. They omit the typed original prompt, but retain response excerpts and full captured response text. Review them before sharing.

## Selected-passage rewrites

Select wording in the captured preview, then request a rewrite. The same feature appears in single and comparison audit details in the web app. Conservative local templates suggest removing stock praise, repeated framing, generic apologies, or calming commands, and replacing explicit AI-feelings claims. They make no provider calls. Other passages can be edited manually.

Inspect the deletion/insertion diff and copy a revised draft. The original response, website and audit are unchanged. Code, reported quotations and illustrative examples are excluded from rewrite suggestions. Copy validates the selected source and rejects matching explicit AI-feelings claims in the replacement. A suggested draft is not a factual correction or evidence that the response's reasoning is sound.

## Provisional streaming findings

After capturing and reviewing a complete supported response container, choose **Watch locally**. Only that chosen region is observed. Changes immediately invalidate earlier findings; after a short debounce, extraction and local checks run again. Late results from an earlier snapshot are discarded. Very short responses wait for more text, and extraction errors stop the watch.

Watching never invokes a semantic API, harvests prompts, claims completion, or exports a provisional audit. The display intentionally omits provisional numeric scores. Choose **Stop**, review the current snapshot, check the review box and explicitly **Audit** to produce a completed result. This does not infer generation completion from vendor-specific controls. Partial selections cannot be watched because their moving boundaries are unreliable.

DOM extraction, exact mapping, invalidation and watcher lifecycles are covered by automated tests. Installation, rendering and authenticated vendor pages still require manual browser verification; passing fixture tests does not establish live site compatibility.
