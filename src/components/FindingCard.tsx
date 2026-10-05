import React, { useState } from 'react';
import { AlertTriangle, Layers, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import type { AnalysisResult } from '../types/analysis';
import { METHOD_LABELS } from '../types/diagnostics';

type Finding = AnalysisResult['findings'][number];

interface FindingCardProps {
  finding: Finding;
  index: number;
}

export function FindingCard({ finding, index }: FindingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-lg overflow-hidden transition-all hover:border-zinc-700/50">
      <div className="p-4 flex gap-4 items-start">
        <div
          className={cn(
            'mt-1 p-1.5 rounded',
            finding.severity === 'high'
              ? 'bg-red-500/10 text-red-500'
              : finding.severity === 'medium'
                ? 'bg-amber-500/10 text-amber-500'
                : 'bg-blue-500/10 text-blue-500',
          )}
        >
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              {finding.category}
            </span>
            <span
              className={cn(
                'text-[10px] uppercase font-mono px-1.5 py-0.5 rounded',
                finding.severity === 'high'
                  ? 'bg-red-500/20 text-red-400'
                  : finding.severity === 'medium'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-blue-500/20 text-blue-400',
              )}
            >
              {finding.severity} SEVERITY
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {finding.method === 'lexical_rule' ? 'Match' : 'Evidence'} confidence: {finding.confidence ?? 'unknown'}
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 mb-2">{METHOD_LABELS[finding.method ?? 'unrecorded']}</p>
          <p className="text-sm text-zinc-400 mb-2 italic">"{finding.text}"</p>
          <p className="text-xs text-zinc-500 leading-relaxed mb-3">{finding.explanation}</p>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls={`rlhf-logic-${index}`}
            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            <Layers className="w-3 h-3" />
            {isExpanded ? 'Hide explanation' : 'Explain wording signal'}
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id={`rlhf-logic-${index}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-emerald-500/5 border-t border-zinc-800/50 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 p-1 bg-emerald-500/10 rounded">
                <Zap className="w-3 h-3 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] font-mono uppercase tracking-widest text-emerald-500">
                  Wording and reader impact
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {finding.rlhfLogic || 'No wording-based explanation was recorded for this finding.'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
