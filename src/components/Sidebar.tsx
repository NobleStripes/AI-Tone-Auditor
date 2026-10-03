import { History, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import type { HistoryEntry } from '../types/history';

interface SidebarProps {
  history: HistoryEntry[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ history, onSelect, onDelete, onClearAll, isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        aria-label="Audit history"
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-800 bg-zinc-950 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 lg:h-[calc(100vh-73px)]',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <History className="w-3 h-3" aria-hidden="true" /> Audit History
          </h2>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={onClearAll}
                aria-label="Clear all history"
                className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-red-500 transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close sidebar"
              className="lg:hidden p-1 text-zinc-500 hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {history.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-zinc-600 font-mono italic">No previous logs found.</p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`Load audit: ${item.title}`}
                className="group relative flex items-center gap-3 p-3 rounded hover:bg-zinc-900 cursor-pointer transition-colors border border-transparent hover:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelect(item.id);
                    onClose();
                  }
                }}
              >
                <div className="w-1 h-8 rounded-full bg-zinc-800 group-hover:bg-red-500 transition-colors" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate font-medium">{item.title}</p>
                  <p className="text-[10px] text-zinc-600 font-mono uppercase">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  aria-label={`Delete audit entry: ${item.title}`}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-zinc-600 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
