import type { Request, Response } from 'express';
import { ANALYSIS_SOURCES, type AnalysisSource } from '../../src/types/provider';
import { analyzeTone, getProviderTelemetrySnapshot } from '../../src/services/analyzeTone';
import { validateResponseText } from '../../src/services/comparisonValidation';
import { MAX_ORIGINAL_PROMPT_LENGTH } from '../../src/types/comparison';
import { reportApiFailure, runAuditJob, sendApiError } from '../security';

const MAX_AUDIT_CONTEXT_LENGTH = MAX_ORIGINAL_PROMPT_LENGTH;

export async function analyzeRoute(req: Request, res: Response): Promise<void> {
  return runAuditJob(res, () => handleAnalyze(req, res));
}

async function handleAnalyze(req: Request, res: Response): Promise<void> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).some(key => !['text', 'sourceModel', 'auditContext'].includes(key))) {
    sendApiError(res, 400, 'INVALID_REQUEST', 'Expected a JSON object with text and optional sourceModel and auditContext.');
    return;
  }
  const { text, sourceModel, auditContext } = req.body as { text?: unknown; sourceModel?: unknown; auditContext?: unknown };

  const textError = validateResponseText(text);
  if (textError || typeof text !== 'string') {
    sendApiError(res, 400, 'INVALID_REQUEST', textError || 'Invalid text.');
    return;
  }

  if (auditContext !== undefined && typeof auditContext !== 'string') {
    sendApiError(res, 400, 'INVALID_REQUEST', 'auditContext must be a string when provided');
    return;
  }
  if (typeof auditContext === 'string' && auditContext.length > MAX_AUDIT_CONTEXT_LENGTH) {
    sendApiError(res, 400, 'INVALID_REQUEST', `auditContext exceeds maximum length of ${MAX_AUDIT_CONTEXT_LENGTH} characters`);
    return;
  }
  if (sourceModel !== undefined && (typeof sourceModel !== 'string' || !(ANALYSIS_SOURCES as readonly string[]).includes(sourceModel))) {
    sendApiError(res, 400, 'INVALID_REQUEST', 'Invalid sourceModel.');
    return;
  }

  const normalizedSourceModel = typeof sourceModel === 'string' && (ANALYSIS_SOURCES as readonly string[]).includes(sourceModel)
    ? sourceModel as AnalysisSource
    : 'unknown';

  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once('close', onClose);
  try {
    const { result, meta, provenance } = await analyzeTone(text, normalizedSourceModel, typeof auditContext === 'string' ? auditContext : '', controller.signal);
    if (controller.signal.aborted) return;
    const telemetry = getProviderTelemetrySnapshot();
    res.json({ result, meta, provenance, telemetry });
  } catch (error) {
    if (controller.signal.aborted) return;
    reportApiFailure(res, error);
  } finally {
    res.off('close', onClose);
  }
}
