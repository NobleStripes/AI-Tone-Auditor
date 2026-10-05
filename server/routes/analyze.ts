import type { Request, Response } from 'express';
import { ANALYSIS_SOURCES, type AnalysisSource } from '../../src/types/provider';
import { analyzeTone, getProviderTelemetrySnapshot } from '../../src/services/analyzeTone';
import { validateResponseText } from '../../src/services/comparisonValidation';
import { MAX_ORIGINAL_PROMPT_LENGTH } from '../../src/types/comparison';

const MAX_AUDIT_CONTEXT_LENGTH = MAX_ORIGINAL_PROMPT_LENGTH;

export async function analyzeRoute(req: Request, res: Response): Promise<void> {
  const { text, sourceModel, auditContext } = req.body as { text?: unknown; sourceModel?: unknown; auditContext?: unknown };

  const textError = validateResponseText(text);
  if (textError || typeof text !== 'string') {
    res.status(400).json({ error: textError });
    return;
  }

  if (auditContext !== undefined && typeof auditContext !== 'string') {
    res.status(400).json({ error: 'auditContext must be a string when provided' });
    return;
  }
  if (typeof auditContext === 'string' && auditContext.length > MAX_AUDIT_CONTEXT_LENGTH) {
    res.status(400).json({ error: `auditContext exceeds maximum length of ${MAX_AUDIT_CONTEXT_LENGTH} characters` });
    return;
  }

  const normalizedSourceModel = typeof sourceModel === 'string' && (ANALYSIS_SOURCES as readonly string[]).includes(sourceModel)
    ? sourceModel as AnalysisSource
    : 'unknown';

  try {
    const { result, meta } = await analyzeTone(text, normalizedSourceModel, typeof auditContext === 'string' ? auditContext : '');
    const telemetry = getProviderTelemetrySnapshot();
    res.json({ result, meta, telemetry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    console.error('[analyze] provider error:', error);
    res.status(500).json({ error: message });
  }
}
