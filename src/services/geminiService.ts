import { analyzeTone as analyzeToneWithProvider } from './analyzeTone';
import type { AnalysisResult } from '../types/analysis';

export type { AnalysisResult };

// Deprecated compatibility shim. New code should import from services/analyzeTone.
export async function analyzeTone(text: string): Promise<AnalysisResult> {
  const { result } = await analyzeToneWithProvider(text);
  return result;
}
