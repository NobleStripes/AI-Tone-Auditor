import type { ProviderRuntimeMeta } from '../types/provider';

export function AnalysisModeIndicator({ meta }: { meta: ProviderRuntimeMeta | null }) {
  const local = meta?.providerId === 'local';
  return (
    <span className="text-zinc-400" title={!meta
      ? 'No successful audit has been reported. Local rules are the default; server configuration can explicitly enable external providers or fallback.'
      : local
        ? (meta.usedFallback ? 'Local heuristic result after fallback; the configured primary provider was also attempted.' : 'Last successful audit used local lexical rules, not a semantic provider.')
        : 'Last successful audit used an external semantic provider; response text was sent to its API.'}>
      {meta ? (local ? 'Local heuristic' : 'Semantic provider') : 'Awaiting audit (local by default)'}
    </span>
  );
}
