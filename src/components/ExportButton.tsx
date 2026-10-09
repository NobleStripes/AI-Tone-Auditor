import { useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import type { AnalysisResult } from '../types/analysis';
import { CATEGORY_REGISTRY } from '../constants';
import { DIAGNOSTIC_GROUPS, METHOD_LABELS, formatDiagnosticScore } from '../types/diagnostics';
import { downloadJson } from '../lib/download';
import type { AnalysisProvenance } from '../types/provenance';
import { createAuditExport } from '../services/exportReport';

interface ExportButtonProps {
  result: AnalysisResult;
  provenance?: AnalysisProvenance;
}

function formatMarkdown(report: ReturnType<typeof createAuditExport>): string {
  const { exportMetadata: metadata, ...result } = report;
  const unknown = 'Unknown (legacy or unrecorded)';
  const lines: string[] = [
    '# AI Tone Audit Report',
    '',
    '## Audit Provenance',
    '',
    `- **Export schema version:** ${metadata.schemaVersion}`,
    `- **Auditor version:** ${metadata.auditorVersion ?? unknown}`,
    `- **Exporter version:** ${metadata.exporterVersion}`,
    `- **Prompt version:** ${metadata.promptVersion ?? unknown}`,
    `- **Local rule version:** ${metadata.localRuleVersion ?? unknown}`,
    `- **Analysis provider:** ${metadata.analysisProvider?.providerLabel ?? unknown}`,
    `- **Analysis provider ID:** ${metadata.analysisProvider?.providerId ?? unknown}`,
    `- **Analysis model:** ${metadata.analysisProvider?.model ?? unknown}`,
    `- **Fallback used:** ${metadata.analysisProvider ? String(metadata.analysisProvider.usedFallback) : unknown}`,
    `- **Selected source model:** ${metadata.selectedSourceModel}`,
    `- **Analyzed at (UTC):** ${metadata.analyzedAt ?? unknown}`,
    `- **Exported at (UTC):** ${metadata.exportedAt}`,
    `- **Comparison session ID:** ${metadata.comparisonSessionId ?? 'N/A (not recorded)'}`,
    `- **Assessment context:** ${metadata.assessmentContext}`,
    '- **Original prompt included:** false',
    '',
    `**Overall Tone:** ${result.overallTone}`,
    '',
    `> ${result.summary}`,
    '',
    '## Response Diagnostics',
    '',
    'Scores are risk/quality indices, not probabilities. Confidence is qualitative and uncalibrated; lexical-rule scores are heuristic.',
    '',
    ...DIAGNOSTIC_GROUPS.flatMap((group) => [
      `### ${group.label}`,
      '',
      ...CATEGORY_REGISTRY.filter((category) => category.group === group.id).map((category) => {
        const assessment = result.assessments[category.id];
        const score = formatDiagnosticScore(result.scores[category.id], assessment);
        const metadata = assessment.status === 'assessed'
          ? `; ${assessment.method === 'lexical_rule' ? 'heuristic ' : ''}${category.kind === 'quality' ? 'quality' : 'risk'} index; ${METHOD_LABELS[assessment.method]}; ${assessment.method === 'lexical_rule' ? 'match' : 'evidence'} confidence: ${assessment.confidence}`
          : '';
        return `- **${category.label} (${category.id})**: ${score}; assessment state: ${assessment.status}${metadata}. ${assessment.reason}`;
      }),
      '',
    ]),
    '',
    '## Findings',
    '',
    ...result.findings.map(
      (f) => {
        const confirmed = f.evidence?.verification === 'verified' && f.evidence.eligibility === 'included';
        const status = f.evidence
          ? `${f.evidence.verification}; ${f.evidence.eligibility}; ${f.evidence.reason ?? 'Exact source wording, not proof of intent.'}`
          : 'Legacy/unrecorded evidence; no confirmed position.';
        const range = f.evidence?.verification === 'verified'
          ? ` UTF-16 range [${f.evidence.startOffset}, ${f.evidence.endOffset}).` : '';
        return `### ${f.category} (${confirmed || !f.evidence ? `${f.severity} severity` : 'inspection only'})\n${confirmed ? '> ' : 'Reported quotation (not confirmed behavioral evidence): '}"${f.text}"\n\n${status}${range}\n\n${METHOD_LABELS[f.method ?? 'unrecorded']}; ${f.method === 'lexical_rule' ? 'match' : 'evidence'} confidence: ${f.confidence ?? 'unknown'}\n\n${f.explanation}`;
      },
    ),
    '',
    '## Excluded lexical occurrences',
    '',
    ...(result.occurrences ?? []).filter(occurrence => occurrence.evidence.eligibility === 'excluded').map(occurrence =>
      `- ${occurrence.category}: "${occurrence.evidence.matchedText}" at UTF-16 [${occurrence.evidence.startOffset}, ${occurrence.evidence.endOffset}); excluded: ${occurrence.evidence.reason}`),
    '',
    '## Personalization Profile',
    '',
    `**Base Style:** ${result.personalization.baseStyle}`,
    `**Directness:** ${result.personalization.directness}`,
    `**Brevity:** ${result.personalization.brevity}`,
    `**ChatGPT warmth:** ${result.personalization.chatgptCharacteristics.warmth}`,
    `**ChatGPT enthusiasm:** ${result.personalization.chatgptCharacteristics.enthusiasm}`,
    `**ChatGPT headers & lists:** ${result.personalization.chatgptCharacteristics.headersAndLists}`,
    `**ChatGPT emojis:** ${result.personalization.chatgptCharacteristics.emojis}`,
    '',
    '### Custom Instructions',
    '',
    ...result.personalization.customInstructions.map((i) => `- ${i}`),
    '',
    '### Stonewalling Remediation',
    '',
    result.personalization.stonewallingRemediation,
    '',
    `---`,
    `*Exported by AI Tone Auditor — ${metadata.exportedAt}*`,
  ];
  return lines.join('\n');
}

export function ExportButton({ result, provenance }: ExportButtonProps) {
  const [copiedMd, setCopiedMd] = useState(false);

  const exportJson = () => {
    downloadJson(createAuditExport(result, provenance), `tone-audit-${Date.now()}.json`);
  };

  const copyMarkdown = () => {
    const md = formatMarkdown(createAuditExport(result, provenance));
    navigator.clipboard.writeText(md).then(() => {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportJson}
        aria-label="Export result as JSON"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono uppercase tracking-widest rounded transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
      >
        <Download className="w-3 h-3" aria-hidden="true" />
        <span>JSON</span>
      </button>
      <button
        onClick={copyMarkdown}
        aria-label={copiedMd ? 'Markdown copied' : 'Copy result as Markdown'}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-mono uppercase tracking-widest rounded transition-all focus:outline-none focus:ring-2 focus:ring-red-500',
          copiedMd
            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500'
            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200',
        )}
      >
        {copiedMd ? (
          <>
            <Check className="w-3 h-3" aria-hidden="true" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" aria-hidden="true" />
            <span>Markdown</span>
          </>
        )}
      </button>
    </div>
  );
}
