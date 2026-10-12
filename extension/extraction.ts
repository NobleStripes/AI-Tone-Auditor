import type { AnalysisSource } from '../src/types/provider';
import type { Evidence } from '../src/types/evidence';

export const EXTRACTION_VERSION = '2026-10-12.v1';
export interface TextSegment { node: Text; nodeStart: number; nodeEnd: number; start: number; end: number }
export interface PageSnapshot {
  id: string; text: string; root: Element; range?: Range; segments: TextSegment[];
  mode: 'selection' | 'response'; sourceModel: AnalysisSource; adapter: string; version: string;
}
export const SITE_ADAPTERS = [
  { id: 'chatgpt', host: /^(?:chatgpt\.com|chat\.openai\.com)$/, source: 'chatgpt' as const, selector: '[data-message-author-role="assistant"]' },
  { id: 'claude', host: /^claude\.ai$/, source: 'claude' as const, selector: '[data-testid="assistant-message"], .font-claude-message' },
  { id: 'gemini', host: /^gemini\.google\.com$/, source: 'gemini' as const, selector: 'model-response' },
  { id: 'grok', host: /^grok\.com$/, source: 'grok' as const, selector: '[data-role="assistant"], [data-testid="assistant-message"], .response-content-markdown' },
];
const GENERIC_SELECTOR = '[data-message-author-role="assistant"], [data-author-role="assistant"], [data-role="assistant"]';
export function adapterFor(url: string) {
  let host = ''; try { host = new URL(url).hostname; } catch { /* Unknown origin: use explicit selection. */ }
  return SITE_ADAPTERS.find(item => item.host.test(host)) ?? { id: 'generic', source: 'other' as const, selector: GENERIC_SELECTOR };
}
export function responseRoot(target: Element, url: string): Element | null { return target.closest(adapterFor(url).selector); }
function ignored(element: Element): boolean {
  if (element.matches('script, style, button, input, textarea, select, option, [hidden], [aria-hidden="true"], [contenteditable="true"], [data-tone-auditor]')) return true;
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.opacity === '0') return true;
  const closed = element.closest('details:not([open])');
  return !!closed && element !== closed && !element.closest('summary');
}
const BLOCKS = new Set(['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TR']);

// Canonical extracted Markdown preserves text-node characters. Inserted separators/fences have no DOM text segment.
export function extractSnapshot(root: Element, url: string, mode: PageSnapshot['mode'], selection?: Range): PageSnapshot {
  let text = ''; let quoteDepth = 0; const segments: TextSegment[] = [];
  const append = (value: string) => { text += value; if (text.length > 50_000) throw new Error('Captured response exceeds 50,000 characters.'); };
  const newline = () => { if (text && !text.endsWith('\n')) append('\n'); };
  const visit = (node: Node) => {
    if (selection && !selection.intersectsNode(node)) return;
    if (node.nodeType === 3) {
      const leaf = node as Text;
      const start = selection?.startContainer === leaf ? selection.startOffset : 0;
      const end = selection?.endContainer === leaf ? selection.endOffset : leaf.length;
      if (selection && (selection.comparePoint(leaf, start) < 0 || selection.comparePoint(leaf, end) > 0)) return;
      const value = leaf.data.slice(start, end); if (!value) return;
      for (const piece of value.matchAll(/[^\n]*\n|[^\n]+$/g)) {
        if (quoteDepth && (!text || text.endsWith('\n'))) append('> '.repeat(quoteDepth));
        const offset = text.length; append(piece[0]);
        segments.push({ node: leaf, nodeStart: start + piece.index, nodeEnd: start + piece.index + piece[0].length, start: offset, end: text.length });
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element; if (ignored(element)) return;
    const tag = element.tagName;
    if (tag === 'BR') { append('\n'); return; }
    if (tag === 'PRE') {
      newline();
      const longest = Math.max(2, ...(element.textContent?.match(/`+/g) ?? []).map(item => item.length));
      const fence = '`'.repeat(longest + 1); append(`${fence}\n`);
      for (const child of element.childNodes) visit(child);
      newline(); append(`${fence}\n`); return;
    }
    if (tag === 'CODE' && !element.closest('pre')) {
      const fence = '`'.repeat(Math.max(0, ...(element.textContent?.match(/`+/g) ?? []).map(item => item.length)) + 1);
      append(fence); for (const child of element.childNodes) visit(child); append(fence); return;
    }
    if (tag === 'BLOCKQUOTE') {
      newline(); quoteDepth++; for (const child of element.childNodes) visit(child); quoteDepth--;
      newline(); if (!text.endsWith('\n\n')) append('\n'); return;
    }
    if (BLOCKS.has(tag)) newline();
    for (const child of element.childNodes) visit(child);
    if (BLOCKS.has(tag)) { newline(); if (text && !text.endsWith('\n\n')) append('\n'); }
  };
  for (let parent: Element | null = root; parent; parent = parent.parentElement) if (ignored(parent)) throw new Error('The selected region is hidden, editable, or a page control.');
  visit(root);
  if (!segments.some(segment => text.slice(segment.start, segment.end).trim())) throw new Error('No visible response text was captured.');
  const adapter = adapterFor(url);
  return { id: crypto.randomUUID(), text, root, ...(selection ? { range: selection.cloneRange() } : {}), segments,
    mode, sourceModel: adapter.source, adapter: adapter.id, version: EXTRACTION_VERSION };
}
export function captureSelection(doc: Document, url: string): PageSnapshot {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) throw new Error('Select one response passage on the page first.');
  const range = selection.getRangeAt(0).cloneRange();
  const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const end = range.endContainer.nodeType === 1 ? range.endContainer as Element : range.endContainer.parentElement;
  const first = responseRoot(start, url); const last = responseRoot(end, url);
  if (first !== last) throw new Error('Selection crosses response boundaries. Select one response.');
  const common = range.commonAncestorContainer;
  let root = first ?? (common.nodeType === 1 ? common as Element : common.parentElement);
  if (!first) root = root.closest('pre') ?? root.closest('code') ?? root.closest('blockquote') ?? root;
  return extractSnapshot(root, url, 'selection', range);
}
export function snapshotCurrent(snapshot: PageSnapshot): boolean {
  if (!snapshot.root.isConnected || snapshot.segments.some(segment => !segment.node.isConnected
    || segment.node.data.slice(segment.nodeStart, segment.nodeEnd) !== snapshot.text.slice(segment.start, segment.end))) return false;
  try { return extractSnapshot(snapshot.root, snapshot.root.ownerDocument.location.href, snapshot.mode, snapshot.range).text === snapshot.text; }
  catch { return false; }
}
export function passageRange(snapshot: PageSnapshot, evidence: Evidence): Range | null {
  if (!snapshotCurrent(snapshot) || evidence.verification !== 'verified' || evidence.kind === 'response_scope'
    || !Number.isInteger(evidence.startOffset) || !Number.isInteger(evidence.endOffset)
    || snapshot.text.slice(evidence.startOffset, evidence.endOffset) !== evidence.matchedText) return null;
  const first = snapshot.segments.find(item => item.start <= evidence.startOffset && item.end > evidence.startOffset);
  const last = snapshot.segments.find(item => item.start < evidence.endOffset && item.end >= evidence.endOffset);
  if (!first || !last) return null;
  const range = snapshot.root.ownerDocument.createRange();
  range.setStart(first.node, first.nodeStart + evidence.startOffset - first.start);
  range.setEnd(last.node, last.nodeStart + evidence.endOffset - last.start);
  if (range.toString() !== evidence.matchedText) return null;
  return range;
}
export function snapshotWire(snapshot: PageSnapshot) {
  const { id, text, mode, sourceModel, adapter, version } = snapshot;
  return { id, text, mode, sourceModel, adapter, version };
}
