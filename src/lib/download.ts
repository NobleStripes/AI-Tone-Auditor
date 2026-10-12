export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function confirmReportExport(fullResponses = false): boolean {
  return window.confirm(`${fullResponses ? 'This export includes full response texts' : 'This report includes response quotations and potentially sensitive derived material'}. Original prompts are excluded. Review sensitive content before sharing. Continue with download or clipboard copy?`);
}
