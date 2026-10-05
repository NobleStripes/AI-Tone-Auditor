export const MAX_ERROR_BODY_LENGTH = 2_000;
const TRUNCATION_MARKER = '\n[truncated]';

export function truncateErrorText(text: string): string {
  return text.length <= MAX_ERROR_BODY_LENGTH
    ? text
    : `${text.slice(0, MAX_ERROR_BODY_LENGTH - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}
