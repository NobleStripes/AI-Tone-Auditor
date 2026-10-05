export const MAX_ERROR_BODY_LENGTH = 2_000;
const TRUNCATION_MARKER = '\n[truncated]';

export function truncateErrorText(text: string, limit = MAX_ERROR_BODY_LENGTH): string {
  if (!Number.isInteger(limit) || limit < TRUNCATION_MARKER.length || limit > MAX_ERROR_BODY_LENGTH) {
    throw new RangeError(`Error text limit must be an integer between ${TRUNCATION_MARKER.length} and ${MAX_ERROR_BODY_LENGTH}.`);
  }
  return text.length <= limit
    ? text
    : `${text.slice(0, limit - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}
