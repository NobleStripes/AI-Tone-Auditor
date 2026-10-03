import React from 'react';
import { ShieldAlert, Settings2, CheckCircle2, Copy } from 'lucide-react';
import { BASE_STYLES } from '../constants';
import type { AnalysisResult } from '../types/analysis';

interface PersonalizationProfileProps {
  personalization: AnalysisResult['personalization'];
}

export function PersonalizationProfile({ personalization }: PersonalizationProfileProps) {
  const selectedStyle = BASE_STYLES.find((style) => style.style === personalization.baseStyle);
  const chatgptCharacteristics = [
    { label: 'Warmth', value: personalization.chatgptCharacteristics.warmth },
    { label: 'Enthusiasm', value: personalization.chatgptCharacteristics.enthusiasm },
    { label: 'Headers & lists', value: personalization.chatgptCharacteristics.headersAndLists },
    { label: 'Emojis', value: personalization.chatgptCharacteristics.emojis },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
        <Settings2 className="w-3 h-3 text-blue-500" /> ChatGPT Personalization
      </h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800 pb-4 gap-2">
          <div>
            <h4 className="text-sm font-bold text-zinc-200">Base style and tone</h4>
            <p className="text-[10px] text-zinc-500">{selectedStyle?.description}</p>
            {selectedStyle && <p className="text-[10px] text-zinc-600">Best for: {selectedStyle.bestFor}</p>}
          </div>
          <div className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded text-xs font-mono text-blue-400 w-fit">
            {personalization.baseStyle}
          </div>
        </div>

        <div className="space-y-3 border-b border-zinc-800 pb-5">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
            ChatGPT characteristics
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {chatgptCharacteristics.map((characteristic) => (
              <div key={characteristic.label} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <p className="text-[10px] text-zinc-500">{characteristic.label}</p>
                <p className="mt-1 text-xs font-mono text-blue-400">{characteristic.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
            Custom instructions
          </h4>
          <div className="space-y-3">
            {personalization.customInstructions.map((instruction, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 bg-zinc-950/50 border border-zinc-800 p-3 rounded-lg group hover:border-blue-500/30 transition-colors"
              >
                <div className="mt-1 p-1 bg-blue-500/10 rounded">
                  <CheckCircle2 className="w-3 h-3 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-300 leading-relaxed">{instruction}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(instruction)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-blue-400 text-zinc-600 transition-all"
                  title="Copy Instruction"
                  aria-label="Copy instruction to clipboard"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800">
          <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/10 p-4 rounded-lg">
            <div className="mt-1 p-1.5 bg-red-500/10 rounded">
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-mono uppercase tracking-widest text-red-500">
                  Stonewalling Remediation Strategy
                </h4>
                <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">
                  Active Counter-Measure
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {personalization.karenRemediation}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-[9px] text-zinc-600 font-mono italic">Apply to Custom Instructions</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
