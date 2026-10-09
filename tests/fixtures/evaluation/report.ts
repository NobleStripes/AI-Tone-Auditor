import { collectFailures, groupSummaries, replayFailures, summarizeObservations } from './metrics';
import type { EvaluationObservation, FailureLedger, EvaluationDataset } from './types';

export function buildEvaluationReport(observations: EvaluationObservation[], datasets: EvaluationDataset[], ledger: FailureLedger | null) {
  return {
    schemaVersion: '1.0.0',
    evaluatedAt: new Date().toISOString(),
    scope: 'Local heuristic rules only; no semantic provider calls or factual verification.',
    summary: summarizeObservations(observations),
    datasets: [
      ...groupSummaries(observations, item => `${item.datasetKind}:${item.corpusVersion}`),
      ...datasets.filter(dataset => !dataset.cases.length).map(dataset => ({
        group: `${'datasetKind' in dataset ? dataset.datasetKind : 'real_world'}:${dataset.version}`, ...summarizeObservations([]),
      })),
    ],
    byCategory: groupSummaries(observations, item => `${item.datasetKind}:${item.corpusVersion}:${item.categoryId}`),
    bySource: groupSummaries(observations, item => `${item.datasetKind}:${item.corpusVersion}:${item.sourceModel}`),
    baselineComparisons: groupSummaries(observations.filter(item => item.baseline !== null),
      item => `${item.datasetKind}:${item.corpusVersion}:${item.baselineRuleVersion}->${item.currentRuleVersion}`),
    failures: collectFailures(observations),
    replay: ledger ? replayFailures(ledger.failures, observations) : [],
    observations,
  };
}

export interface CompareOptions {
  json: boolean;
  reportJson: boolean;
  help: boolean;
  noReplay: boolean;
  realWorld: string[];
  synthetic: string[];
  failures?: string;
  recordFailures?: string;
  recordRealWorld?: string;
  recordSynthetic?: string;
}

export function parseCompareOptions(args: string[]): CompareOptions {
  const options: CompareOptions = { json: false, reportJson: false, help: false, noReplay: false, realWorld: [], synthetic: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--report-json') options.reportJson = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--no-replay') options.noReplay = true;
    else if (['--real-world', '--synthetic', '--failures', '--record-failures', '--record-real-world', '--record-synthetic'].includes(arg)) {
      const path = args[++index];
      if (!path || path.startsWith('--')) throw new Error(`${arg}: a file path is required.`);
      if (arg === '--real-world') options.realWorld.push(path);
      else if (arg === '--synthetic') options.synthetic.push(path);
      else {
        const key = arg === '--failures' ? 'failures' : arg === '--record-failures' ? 'recordFailures' : arg === '--record-synthetic' ? 'recordSynthetic' : 'recordRealWorld';
        if (options[key]) throw new Error(`${arg}: specify this option once.`);
        options[key] = path;
      }
    } else throw new Error(`Unknown option ${arg}. Use --help for supported options.`);
  }
  if (options.json && options.reportJson) throw new Error('Choose --json or --report-json, not both.');
  if (options.noReplay && (!options.recordFailures || options.failures)) throw new Error('--no-replay is only for seeding a new failure ledger with --record-failures; do not combine it with --failures.');
  return options;
}
