import { ShieldAlert, Menu } from 'lucide-react';
import { version } from '../../package.json';

interface HeaderProps {
  onToggleSidebar: () => void;
  latencyMs?: number;
}

export function Header({ onToggleSidebar, latencyMs }: HeaderProps) {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950 px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="w-8 h-8 md:w-10 md:h-10 bg-red-500/10 border border-red-500/20 rounded flex items-center justify-center">
          <ShieldAlert className="text-red-500 w-5 h-5 md:w-6 md:h-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-sm md:text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            AI TONE AUDITOR{' '}
            <span className="hidden sm:inline text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-mono">
              v{version}
            </span>
          </h1>
          <p className="text-[9px] md:text-xs text-zinc-500 font-mono uppercase tracking-widest">
            System Integrity Analysis
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs font-mono text-zinc-500">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          <span className="hidden xs:inline">ENGINE ONLINE</span>
        </div>
        <div className="hidden xs:block h-4 w-px bg-zinc-800" />
        <span className="hidden sm:inline">
          LATENCY: {latencyMs !== undefined ? `${latencyMs}ms` : '—'}
        </span>
      </div>
    </header>
  );
}
