import type { Request, Response } from 'express';
import { ANALYSIS_SOURCES, type AnalysisSource } from '../../src/types/provider';
import { analyzeTone, getProviderTelemetrySnapshot } from '../../src/services/analyzeTone';

const MAX_TEXT_LENGTH = 50_000;
const MIN_TEXT_LENGTH = 10;

export async function analyzeRoute(req: Request, res: Response): Promise<void> {
  const { text, sourceModel } = req.body as { text?: unknown; sourceModel?: unknown };

  if (typeof text !== 'string' || text.trim().length < MIN_TEXT_LENGTH) {
    res.status(400).json({ error: `text must be a string of at least ${MIN_TEXT_LENGTH} characters` });
    return;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: `text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` });
    return;
  }

  const normalizedSourceModel = typeof sourceModel === 'string' && (ANALYSIS_SOURCES as readonly string[]).includes(sourceModel)
    ? sourceModel as AnalysisSource
    : 'unknown';

  try {
    const { result, meta } = await analyzeTone(text, normalizedSourceModel);
    const telemetry = getProviderTelemetrySnapshot();
    res.json({ result, meta, telemetry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    console.error('[analyze] provider error:', error);
    res.status(500).json({ error: message });
  }
}
