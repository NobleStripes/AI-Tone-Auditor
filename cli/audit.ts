import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { analyzeTone } from '../src/services/analyzeTone';
import { ANALYSIS_SOURCES, PROVIDER_IDS, type ProviderId, type AnalysisSource } from '../src/types/provider';
import { validateResponseText } from '../src/services/comparisonValidation';
import { MAX_ORIGINAL_PROMPT_LENGTH } from '../src/types/comparison';
import { ANTHROPOMORPHISM_GUARD_VERSION } from '../src/services/anthropomorphismGuard';
import { checkAuditConditions, compareCliBaseline, parseAuditConditions, parseCliBaseline } from '../src/services/auditConditions';
import type { AuditInput, CliAudit, CliAuditReport } from '../src/types/auditCli';

const MAX_BYTES = 8 * 1024 * 1024;
export interface CliOptions { files: string[]; batch?: string; source: AnalysisSource; prompt: string; promptFile?: string;
  provider: ProviderId; fallback?: ProviderId; json: boolean; help: boolean; output?: string; conditions?: string; baseline?: string }
export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = { files: [], source: 'unknown', prompt: '', provider: 'local', json: false, help: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--') { options.files.push(...args.slice(index + 1)); break; }
    else if (['--batch', '--source', '--prompt', '--prompt-file', '--provider', '--fallback', '--output', '--conditions', '--baseline'].includes(arg)) {
      if (seen.has(arg)) throw new Error(`${arg}: specify once.`); seen.add(arg);
      const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`${arg}: a value is required.`);
      if (arg === '--source') { const source = ANALYSIS_SOURCES.find(item => item === value); if (!source) throw new Error('Unknown response source.'); options.source = source; }
      else if (arg === '--provider' || arg === '--fallback') { const provider = PROVIDER_IDS.find(item => item === value); if (!provider) throw new Error('Unknown auditing provider.'); options[arg === '--provider' ? 'provider' : 'fallback'] = provider; }
      else options[({ '--batch': 'batch', '--prompt': 'prompt', '--prompt-file': 'promptFile', '--output': 'output', '--conditions': 'conditions', '--baseline': 'baseline' } as const)[arg]] = value;
    } else if (arg.startsWith('-') && arg !== '-') throw new Error(`Unknown option ${arg}.`);
    else options.files.push(arg);
  }
  if (options.batch && options.files.length) throw new Error('Choose response files/stdin or --batch, not both.');
  if (options.promptFile && seen.has('--prompt')) throw new Error('Choose --prompt or --prompt-file.');
  if (options.files.filter(file => file === '-').length > 1 || options.promptFile === '-') throw new Error('Use stdin once, for response input only.');
  if (options.files.length > 100) throw new Error('At most 100 files are supported.');
  return options;
}

export function parseBatchInputs(value: unknown, options: Pick<CliOptions, 'source' | 'prompt'>): AuditInput[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Batch must be an array of 1 to 100 audit inputs.');
  const inputs = value.map((item, index): AuditInput => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['id', 'text', 'sourceModel', 'originalPrompt'].includes(key))) throw new Error(`Batch item ${index + 1}: invalid fields.`);
    return validateInput({ id: item.id, text: item.text, sourceModel: item.sourceModel ?? options.source, originalPrompt: item.originalPrompt ?? options.prompt });
  });
  if (new Set(inputs.map(item => item.id)).size !== inputs.length) throw new Error('Batch IDs must be unique.');
  return inputs;
}
function validateInput(item: AuditInput): AuditInput {
  if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128 || /[\x00-\x1f\x7f\u2028\u2029]/.test(item.id)) throw new Error('Audit ID must be nonempty text up to 128 characters without control characters.');
  const error = validateResponseText(item.text); if (error) throw new Error(error);
  if (!ANALYSIS_SOURCES.includes(item.sourceModel)) throw new Error('Unknown response source.');
  if (typeof item.originalPrompt !== 'string' || item.originalPrompt.length > MAX_ORIGINAL_PROMPT_LENGTH) throw new Error(`Original prompt must be text up to ${MAX_ORIGINAL_PROMPT_LENGTH} characters.`);
  return item;
}
function json(text: string, label: string): unknown { try { return JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error(`${label}: invalid JSON.`); } }
async function readInput(path: string): Promise<string> {
  let bytes: Buffer;
  if (path === '-') {
    if (process.stdin.isTTY) throw new Error('Provide response files or pipe UTF-8 text into stdin.');
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of process.stdin) { const data = Buffer.from(chunk); size += data.length; if (size > MAX_BYTES) throw new Error('Input exceeds 8 MiB.'); chunks.push(data); }
    bytes = Buffer.concat(chunks);
  } else { if ((await stat(path)).size > MAX_BYTES) throw new Error('Input exceeds 8 MiB.'); bytes = await readFile(path); }
  if (bytes.length > MAX_BYTES) throw new Error('Input exceeds 8 MiB.');
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new Error('Input must be valid UTF-8.'); }
}

export async function runCliAudits(inputs: AuditInput[], options: Pick<CliOptions, 'provider' | 'fallback'>,
  audit: typeof analyzeTone = analyzeTone): Promise<CliAudit[]> {
  const oldProvider = process.env.AI_PROVIDER; const oldFallback = process.env.AI_FALLBACK_PROVIDER;
  process.env.AI_PROVIDER = options.provider; process.env.AI_FALLBACK_PROVIDER = options.fallback ?? '';
  try {
    const audits: CliAudit[] = [];
    for (const input of inputs) {
      const inputHash = inputFingerprint(input);
      const identity = { id: input.id, inputHash, sourceModel: input.sourceModel };
      try { audits.push({ ...identity, status: 'completed', analysis: await audit(input.text, input.sourceModel, input.originalPrompt) }); }
      catch (error) { audits.push({ ...identity, status: 'failed', error: error instanceof Error ? error.message.slice(0, 2000) : 'Audit failed.' }); }
    }
    return audits;
  } finally {
    if (oldProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = oldProvider;
    if (oldFallback === undefined) delete process.env.AI_FALLBACK_PROVIDER; else process.env.AI_FALLBACK_PROVIDER = oldFallback;
  }
}

export function inputFingerprint(input: AuditInput): string {
  return createHash('sha256').update(JSON.stringify([input.sourceModel, input.text, input.originalPrompt])).digest('hex');
}
export function validateBaselineInputs(inputs: AuditInput[], baseline: CliAuditReport): void {
  if (inputs.length !== baseline.audits.length) throw new Error('Baseline input set changed.');
  for (const input of inputs) {
    const recorded = baseline.audits.find(item => item.id === input.id);
    if (!recorded || recorded.inputHash !== inputFingerprint(input)) throw new Error(`Baseline input changed for ${input.id}; record a new baseline.`);
    if (recorded.status !== 'completed') throw new Error('Baseline contains unavailable audits.');
    const evidence = [...recorded.analysis.result.findings.flatMap(item => item.evidence?.verification === 'verified' ? [item.evidence] : []),
      ...(recorded.analysis.result.anthropomorphismGuard?.sourceClaims ?? []).map(item => item.evidence)];
    for (const item of evidence) if (!Number.isInteger(item.startOffset) || !Number.isInteger(item.endOffset) || item.startOffset < 0
      || item.endOffset <= item.startOffset || item.endOffset > input.text.length || input.text.slice(item.startOffset, item.endOffset) !== item.matchedText) throw new Error(`Baseline passage no longer matches ${input.id}.`);
  }
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const options = parseCliOptions(args);
  if (options.help) {
    console.log(`Usage: npm run --silent audit -- [response.txt ... | - | --batch inputs.json]
  --source SOURCE             Response source (default unknown)
  --prompt TEXT | --prompt-file PATH   Optional context, kept out of reports
  --provider PROVIDER         Explicit auditor (default local; no .env loading)
  --fallback PROVIDER         Explicit fallback (default none)
  --json                      Machine-readable report on stdout
  --output PATH               Save JSON to a NEW file (never overwrite)
  --conditions PATH           Versioned CI condition configuration
  --baseline PATH             Compare identical inputs against a prior JSON report
Exit codes: 0 completed/passed, 1 condition violations, 2 invalid input/audit failure.
Batch JSON: [{"id":"case-1","text":"Response text","sourceModel":"other","originalPrompt":""}]
Stdin: omit files or use -. Batch stdin: --batch -. Inputs are UTF-8, at most 8 MiB / 100 cases.`);
    return 0;
  }
  if (options.promptFile) options.prompt = await readInput(options.promptFile);
  const inputs = options.batch ? parseBatchInputs(json(await readInput(options.batch), 'Batch'), options)
    : await Promise.all((options.files.length ? options.files : ['-']).map(async (path, index) => validateInput({ id: `input-${index + 1}`, text: await readInput(path), sourceModel: options.source, originalPrompt: options.prompt })));
  if (inputs.length > 100) throw new Error('At most 100 inputs are supported.');
  const config = options.conditions ? parseAuditConditions(json(await readInput(options.conditions), 'Conditions')) : { schemaVersion: '1.0.0' as const };
  if (config.baseline && !options.baseline) throw new Error('Baseline conditions require --baseline.');
  const baseline = options.baseline ? parseCliBaseline(json(await readInput(options.baseline), 'Baseline')) : null;
  if (baseline) validateBaselineInputs(inputs, baseline);
  if (options.output) {
    try { await stat(options.output); throw new Error('Output file already exists; choose a new path.'); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  const audits = await runCliAudits(inputs, options);
  const baselineComparison = baseline ? compareCliBaseline(audits, baseline) : [];
  const report: CliAuditReport = { schemaVersion: '1.0.0', guardVersion: ANTHROPOMORPHISM_GUARD_VERSION,
    generatedAt: new Date().toISOString(), audits, baselineComparison, violations: checkAuditConditions(audits, config, baselineComparison) };
  if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const item of audits) {
      console.log(`${item.id}: ${item.status}${item.status === 'failed' ? ` — ${item.error}` : ` — ${item.analysis.meta.providerLabel} / ${item.analysis.meta.model}`}`);
      if (item.status === 'completed') {
        console.log(item.analysis.result.summary);
        for (const finding of item.analysis.result.findings) console.log(`  ${finding.category} (${finding.severity}; ${finding.evidence?.verification ?? 'unrecorded'}; ${finding.evidence?.eligibility ?? 'unknown'}): ${JSON.stringify(finding.text)}`);
        const guard = item.analysis.result.anthropomorphismGuard;
        if (guard) console.log(`  Anthropomorphism: ${guard.sourceClaims.filter(claim => claim.disposition === 'flagged').length} source claims; ${guard.blockedFields.length} generated fields withheld.`);
      }
    }
    for (const difference of baselineComparison) console.log(`${difference.id} baseline: ${difference.newFindings.length} new passages; ${difference.resolvedFindings.length} resolved; ${difference.coverageLost.length} coverage gaps.`);
    for (const violation of report.violations) console.log(`Condition failed: ${violation.id} / ${violation.condition}: ${violation.detail}`);
  }
  return audits.some(item => item.status === 'failed') ? 2 : report.violations.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(error instanceof Error ? error.message : 'CLI failed.'); process.exitCode = 2;
});
