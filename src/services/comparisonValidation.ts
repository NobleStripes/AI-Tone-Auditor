import {
  COMPARISON_SOURCES, MIN_COMPARISON_RESPONSES, MAX_COMPARISON_RESPONSES,
  MIN_RESPONSE_LENGTH, MAX_RESPONSE_LENGTH, MAX_ORIGINAL_PROMPT_LENGTH,
  type ComparisonRequest, type ComparisonResponse,
} from '../types/comparison';

export function validateResponseText(text: unknown): string | undefined {
  if (typeof text !== 'string' || text.trim().length < MIN_RESPONSE_LENGTH) {
    return `text must be a string of at least ${MIN_RESPONSE_LENGTH} characters`;
  }
  if (text.length > MAX_RESPONSE_LENGTH) {
    return `text exceeds maximum length of ${MAX_RESPONSE_LENGTH} characters`;
  }
}

export function validateComparisonRequest(payload: unknown):
  | { valid: true; value: ComparisonRequest }
  | { valid: false; error: string } {
  const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (typeof raw.originalPrompt !== 'string' || !raw.originalPrompt.trim()) {
    return { valid: false, error: 'A nonempty originalPrompt is required for comparison.' };
  }
  if (raw.originalPrompt.length > MAX_ORIGINAL_PROMPT_LENGTH) {
    return { valid: false, error: `originalPrompt exceeds maximum length of ${MAX_ORIGINAL_PROMPT_LENGTH} characters` };
  }
  if (!Array.isArray(raw.responses) || raw.responses.length < MIN_COMPARISON_RESPONSES || raw.responses.length > MAX_COMPARISON_RESPONSES) {
    return { valid: false, error: `Provide ${MIN_COMPARISON_RESPONSES} to ${MAX_COMPARISON_RESPONSES} responses.` };
  }
  const responses: ComparisonResponse[] = [];
  const ids = new Set<string>();
  for (const [index, value] of raw.responses.entries()) {
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 64 || ids.has(item.id)) {
      return { valid: false, error: `Response ${index + 1} must have a unique nonempty id of at most 64 characters.` };
    }
    const sourceModel = COMPARISON_SOURCES.find((source) => source === item.sourceModel);
    if (!sourceModel) {
      return { valid: false, error: `Response ${index + 1} must select ChatGPT, Claude, Gemini, Grok, or Other.` };
    }
    const textError = validateResponseText(item.text);
    if (textError || typeof item.text !== 'string') {
      return { valid: false, error: `Response ${index + 1}: ${textError}` };
    }
    ids.add(item.id);
    responses.push({ id: item.id, sourceModel, text: item.text });
  }
  return { valid: true, value: { originalPrompt: raw.originalPrompt, responses } };
}
