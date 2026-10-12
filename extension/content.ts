import { captureSelection, extractSnapshot, passageRange, responseRoot, snapshotCurrent, snapshotWire, type PageSnapshot } from './extraction';
import { ANALYSIS_SOURCES } from '../src/types/provider';
import { watchResponse } from './watch';

const isolated = globalThis as typeof globalThis & { toneAuditorInstalled?: boolean };
if (!isolated.toneAuditorInstalled) {
  isolated.toneAuditorInstalled = true;
  let activePort: AuditExtensionPort | undefined;
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'tone-audit-session') return;
    activePort?.disconnect(); activePort = port;
    let snapshot: PageSnapshot | undefined;
    let observer: MutationObserver | undefined;
    let parentObserver: MutationObserver | undefined;
    let watch: ReturnType<typeof watchResponse> | undefined;
    let picking: ((event: MouseEvent) => void) | undefined;
    const style = document.createElement('style');
    style.dataset.toneAuditor = 'true'; style.textContent = '::highlight(tone-auditor) { background-color: #fbbf2480; color: inherit; }';
    document.head.append(style);
    const clearHighlight = () => { CSS.highlights?.delete('tone-auditor'); };
    const stopPicking = () => { if (picking) document.removeEventListener('click', picking, true); picking = undefined; };
    const stop = () => { watch?.stop(); watch = undefined; observer?.disconnect(); observer = undefined; parentObserver?.disconnect(); parentObserver = undefined; clearHighlight(); stopPicking(); };
    const send = (message: unknown) => { try { port.postMessage(message); } catch { stop(); } };
    const observe = () => {
      observer?.disconnect();
      parentObserver?.disconnect();
      if (!snapshot) return;
      observer = new MutationObserver(() => {
        if (snapshotCurrent(snapshot)) return;
        clearHighlight(); send({ type: 'invalidated', id: snapshot.id }); observer?.disconnect();
      });
      observer.observe(snapshot.root, { subtree: true, childList: true, characterData: true, attributes: true });
      parentObserver = new MutationObserver(records => {
        if (!snapshot?.root.isConnected) { stop(); send({ type: 'invalidated', id: snapshot?.id }); send({ type: 'error', message: 'Response region disappeared; capture it again.' }); }
        else if (records.some(record => record.type === 'attributes' && record.target !== snapshot.root && record.target.contains(snapshot.root)) && !snapshotCurrent(snapshot)) {
          stop(); send({ type: 'invalidated', id: snapshot.id }); send({ type: 'error', message: 'Response ancestry changed; capture it again.' });
        }
      });
      parentObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    };
    const capture = (next: PageSnapshot) => { snapshot = next; clearHighlight(); send({ type: 'snapshot', snapshot: snapshotWire(next) }); observe(); };
    port.onMessage.addListener(message => {
      try {
        if (message.type === 'capture-selection') { stop(); capture(captureSelection(document, location.href)); }
        else if (message.type === 'start-pick') {
          stop();
          picking = event => {
            if (!event.isTrusted || !(event.target instanceof Element)) return;
            const root = responseRoot(event.target, location.href);
            if (!root) { send({ type: 'error', message: 'No supported assistant response container here. Select text and use Capture selected text.' }); return; }
            event.preventDefault(); event.stopPropagation(); stopPicking();
            try { capture(extractSnapshot(root, location.href, 'response')); }
            catch (error) { stop(); send({ type: 'error', message: error instanceof Error ? error.message : 'Capture failed.' }); }
          };
          document.addEventListener('click', picking, true);
          send({ type: 'waiting', message: 'Click the assistant response on the page. Use Cancel to leave picking mode.' });
        } else if (message.type === 'highlight') {
          if (!snapshot || message.id !== snapshot.id) throw new Error('This finding belongs to an older snapshot. Capture the response again.');
          const range = passageRange(snapshot, message.evidence);
          if (!range) throw new Error('The source changed or this passage cannot be mapped to the page.');
          const element = range.startContainer.parentElement; element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (CSS.highlights && typeof Highlight !== 'undefined') CSS.highlights.set('tone-auditor', new Highlight(range));
          else send({ type: 'waiting', message: 'Passage located. This browser does not expose CSS highlights.' });
        } else if (message.type === 'watch') {
          if (!snapshot || snapshot.mode !== 'response' || !snapshotCurrent(snapshot)) throw new Error('Capture a supported complete response container before watching.');
          observer?.disconnect(); parentObserver?.disconnect(); watch?.stop();
          const source = ANALYSIS_SOURCES.find(item => item === message.sourceModel) ?? snapshot.sourceModel;
          watch = watchResponse(snapshot, {
            snapshot: next => { snapshot = next; clearHighlight(); send({ type: 'snapshot', snapshot: snapshotWire(next) }); },
            invalidated: id => { clearHighlight(); send({ type: 'invalidated', id }); },
            provisional: (next, result) => send({ type: 'provisional', id: next.id, result }),
            error: message => { watch = undefined; send({ type: 'error', message }); }, waiting: message => send({ type: 'waiting', message }),
          }, source);
        } else if (message.type === 'stop-watch') { stop(); if (snapshot && snapshot.root.isConnected) capture(extractSnapshot(snapshot.root, location.href, snapshot.mode, snapshot.range)); }
        else if (message.type === 'clear') { stop(); snapshot = undefined; }
      } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'Capture failed.' }); }
    });
    port.onDisconnect.addListener(() => { stop(); snapshot = undefined; style.remove(); });
  });
}
