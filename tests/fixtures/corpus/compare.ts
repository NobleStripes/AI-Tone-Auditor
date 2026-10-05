import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FIXTURE_CORPORA } from './index';
import { evaluateCorpus } from './evaluate';
import { evaluateRealWorld, recordRealWorldBaseline } from '../evaluation/realWorld';
import { parseFailureLedger, parseRealWorldDataset } from '../evaluation/validation';
import { buildEvaluationReport, parseCompareOptions } from '../evaluation/report';

const defaultDataset = fileURLToPath(new URL('../evaluation/real-world.v1.json', import.meta.url));
const defaultFailures = fileURLToPath(new URL('../evaluation/failures.v1.json', import.meta.url));

async function readJson(path: string): Promise<unknown> {
  const content = await readFile(path, 'utf8');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in ${path}; check syntax. Input text is omitted from this error for privacy.`);
  }
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function main() {
  const options = parseCompareOptions(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: npm run corpus:compare -- [options]
  --json                      Preserve the observations-array JSON format
  --report-json               Full summaries, failure records and replay results
  --real-world PATH           Privacy-reviewed JSON dataset (repeat for retained versions)
  --failures PATH             Previous ledger to replay (default: failures.v1.json)
  --record-failures PATH       Save current FP/FN records to a NEW JSON file
  --record-real-world PATH     Save current baselines for one real-world dataset to a NEW file
  --no-replay                  Seed a ledger before any previous ledger exists
No external providers are called. Output files are never overwritten.`);
    return;
  }
  const datasets = await Promise.all((options.realWorld.length ? options.realWorld : [defaultDataset])
    .map(async path => parseRealWorldDataset(await readJson(path))));
  if (new Set(datasets.map(dataset => dataset.version)).size !== datasets.length) throw new Error('Real-world datasets must have distinct retained version IDs.');
  if (options.recordRealWorld && datasets.length !== 1) throw new Error('--record-real-world requires exactly one input dataset.');
  const ledger = options.noReplay ? null : parseFailureLedger(await readJson(options.failures ?? defaultFailures));
  const observations = [
    ...(await Promise.all(FIXTURE_CORPORA.map(evaluateCorpus))).flat(),
    ...(await Promise.all(datasets.map(evaluateRealWorld))).flat(),
  ];
  const report = buildEvaluationReport(observations, datasets, ledger);
  if (options.recordFailures) await writeJson(options.recordFailures, {
    schemaVersion: '1.0.0', recordedAt: report.evaluatedAt, failures: report.failures,
  });
  if (options.recordRealWorld) await writeJson(options.recordRealWorld, recordRealWorldBaseline(datasets[0], observations));
  if (options.json || options.reportJson) {
    console.log(JSON.stringify(options.json ? observations : report, null, 2));
    return;
  }
  console.log(`Compared ${observations.length} category observations; ${report.summary.baselineDifferences} baseline difference(s).`);
  console.table(report.datasets.map(item => ({
    dataset: item.group, total: item.total,
    'positives detected': `${item.knownPositivesDetected}/${item.knownPositives}`,
    'negatives avoided': `${item.knownNegativesAvoided}/${item.knownNegatives}`,
    'correct abstentions': item.correctAbstentions,
    'false positives': item.falsePositives, 'false negatives': item.falseNegatives,
    'traps triggered': `${item.falsePositiveTrapsTriggered}/${item.falsePositiveTraps}`,
    'paraphrase misses': `${item.paraphraseMisses}/${item.paraphraseCases}`,
    'paraphrases unassessed': item.paraphrasesUnassessed,
    ambiguous: item.ambiguous, unassessed: item.unassessed,
  })));
  console.table(report.baselineComparisons.map(item => ({
    comparison: item.group, compared: item.baselineComparisons, differences: item.baselineDifferences,
    'outcome changes': item.outcomeChanges, resolved: item.failuresResolved,
    introduced: item.failuresIntroduced, persistent: item.failuresPersistent, 'now unassessed': item.failuresNowUnassessed,
  })));
  const changes = observations.filter(item => item.changed);
  if (changes.length) console.table(changes.map(item => ({
    dataset: `${item.datasetKind}:${item.corpusVersion}`, id: item.id, category: item.categoryId,
    baseline: `${item.baseline.status}:${item.baseline.score}`, current: `${item.current.status}:${item.current.score}`,
  })));
  console.log(`Failure replay: ${report.replay.length} tracked IDs; ${report.replay.filter(item => item.status === 'persistent').length} persistent, ${report.replay.filter(item => item.status === 'resolved').length} resolved, ${report.replay.filter(item => item.status === 'unassessed').length} now unassessed.`);
  if (report.replay.some(item => item.status !== 'persistent' || item.changed)) {
    console.table(report.replay.filter(item => item.status !== 'persistent' || item.changed));
  }
  console.log('Counts are not accuracy estimates. Retained versions overlap; compare each version separately on identical inputs.');
  console.log('Risk signal = assessed index >= 1; positive Refusal Quality = assessed index >= 60. These are evaluation conventions, not probabilities.');
  console.log('N/A is never a zero: not_assessed/insufficient_context remain coverage gaps; not_applicable against an expected positive is an applicability miss.');
  console.log('Real-world inputs require manual privacy review. No genuine responses are preloaded. Use --report-json for per-source/category summaries and explicit failure records.');
}

try {
  await main();
} catch (error) {
  console.error(`Corpus evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
