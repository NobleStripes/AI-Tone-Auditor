import type { Request, Response } from 'express';
import { compareResponses } from '../../src/services/compareResponses';
import { validateComparisonRequest } from '../../src/services/comparisonValidation';
import { getProviderTelemetrySnapshot } from '../../src/services/analyzeTone';

export async function compareRoute(req: Request, res: Response): Promise<void> {
  const validated = validateComparisonRequest(req.body);
  if (validated.valid === false) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once('close', onClose);
  try {
    const comparison = await compareResponses(validated.value, controller.signal);
    if (!controller.signal.aborted) res.json({ comparison, telemetry: getProviderTelemetrySnapshot() });
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error('[compare] batch error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Comparison failed.' });
  } finally {
    res.off('close', onClose);
  }
}
