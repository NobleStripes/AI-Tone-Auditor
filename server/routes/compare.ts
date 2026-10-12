import type { Request, Response } from 'express';
import { compareResponses, ComparisonBudgetError } from '../../src/services/compareResponses';
import { validateComparisonRequest } from '../../src/services/comparisonValidation';
import { getProviderTelemetrySnapshot } from '../../src/services/analyzeTone';
import { reportApiFailure, runAuditJob, sendApiError } from '../security';

export async function compareRoute(req: Request, res: Response): Promise<void> {
  return runAuditJob(res, () => handleCompare(req, res));
}

async function handleCompare(req: Request, res: Response): Promise<void> {
  const validated = validateComparisonRequest(req.body);
  if (validated.valid === false) {
    sendApiError(res, 400, 'INVALID_REQUEST', validated.error);
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
    if (error instanceof ComparisonBudgetError) {
      res.setHeader('Retry-After', error.retryAfter);
      res.status(429).json({ error: error.message, code: error.code, comparison: error.comparison, requestId: res.locals.requestId });
    } else {
      reportApiFailure(res, error);
    }
  } finally {
    res.off('close', onClose);
  }
}
