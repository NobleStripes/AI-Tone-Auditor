/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  Search, 
  History, 
  AlertTriangle, 
  Info, 
  ChevronRight, 
  Terminal, 
  Activity,
  Zap,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Cpu,
  Lightbulb,
  Copy,
  Check,
  Settings2,
  Smile,
  Flame,
  LayoutList,
  Sticker,
  AlertCircle,
  BookOpen,
  Layers,
  ChevronDown,
  ChevronUp,
  Map,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';
import { analyzeTone, AnalysisResult } from './services/geminiService';
import { TONE_CATEGORIES, TRIGGER_WORDS } from './constants';
import { cn } from './lib/utils';

// --- Components ---

const Header = ({ onToggleSidebar }: { onToggleSidebar: () => void }) => (
  <header className="border-b border-zinc-800 bg-zinc-950 px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-40">
    <div className="flex items-center gap-3">
      <button 
        onClick={onToggleSidebar}
        className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="w-8 h-8 md:w-10 md:h-10 bg-red-500/10 border border-red-500/20 rounded flex items-center justify-center">
        <ShieldAlert className="text-red-500 w-5 h-5 md:w-6 md:h-6" />
      </div>
      <div>
        <h1 className="text-sm md:text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          AI TONE AUDITOR <span className="hidden sm:inline text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-mono">v1.0.2</span>
        </h1>
        <p className="text-[9px] md:text-xs text-zinc-500 font-mono uppercase tracking-widest">System Integrity Analysis</p>
      </div>
    </div>
    <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs font-mono text-zinc-500">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="hidden xs:inline">ENGINE ONLINE</span>
      </div>
      <div className="hidden xs:block h-4 w-px bg-zinc-800" />
      <span className="hidden sm:inline">LATENCY: 24ms</span>
    </div>
  </header>
);

const Sidebar = ({ 
  history, 
  onSelect, 
  onDelete, 
  onClearAll, 
  isOpen, 
  onClose 
}: { 
  history: any[], 
  onSelect: (id: string) => void, 
  onDelete: (id: string) => void, 
  onClearAll: () => void,
  isOpen: boolean,
  onClose: () => void
}) => (
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
        />
      )}
    </AnimatePresence>

    <aside className={cn(
      "fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-800 bg-zinc-950 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 lg:h-[calc(100vh-73px)]",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
          <History className="w-3 h-3" /> Audit History
        </h2>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button 
              onClick={onClearAll}
              className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-red-500 transition-colors flex items-center gap-1"
              title="Clear All History"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <button 
            onClick={onClose}
            className="lg:hidden p-1 text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
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
              className="group relative flex items-center gap-3 p-3 rounded hover:bg-zinc-900 cursor-pointer transition-colors border border-transparent hover:border-zinc-800"
              onClick={() => {
                onSelect(item.id);
                onClose();
              }}
            >
              <div className="w-1 h-8 rounded-full bg-zinc-800 group-hover:bg-red-500 transition-colors" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 truncate font-medium">{item.title}</p>
                <p className="text-[10px] text-zinc-600 font-mono uppercase">{new Date(item.timestamp).toLocaleTimeString()}</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-zinc-600 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  </>
);

const TriggerHighlighter = ({ text }: { text: string }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const parts = useMemo(() => {
    if (!text) return [];
    // Sort trigger words by length descending to match longest phrases first
    const sortedTriggers = [...TRIGGER_WORDS].sort((a, b) => b.word.length - a.word.length);
    const regex = new RegExp(`(${sortedTriggers.map(w => w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    
    const result = [];
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: text.substring(lastIndex, match.index), isTrigger: false });
      }
      const triggerInfo = TRIGGER_WORDS.find(t => t.word.toLowerCase() === match![0].toLowerCase());
      result.push({ text: match[0], isTrigger: true, info: triggerInfo });
      lastIndex = regex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      result.push({ text: text.substring(lastIndex), isTrigger: false });
    }
    
    return result;
  }, [text]);

  return (
    <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg font-mono text-sm leading-relaxed text-zinc-400 whitespace-pre-wrap">
      {parts.length === 0 ? "No text analyzed yet." : parts.map((part, i) => (
        part.isTrigger ? (
          <span 
            key={i} 
            className="relative inline-block"
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={() => setActiveIndex(activeIndex === i ? null : i)}
          >
            <span className="bg-red-500/20 text-red-400 border-b border-red-500/50 px-0.5 rounded-sm font-bold cursor-help">
              {part.text}
            </span>
            <AnimatePresence>
              {activeIndex === i && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl z-50 pointer-events-none"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">{part.info?.category}</span>
                    <AlertCircle className="w-3 h-3 text-red-500" />
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-normal font-sans normal-case">{part.info?.explanation}</p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-950" />
                </motion.div>
              )}
            </AnimatePresence>
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      ))}
    </div>
  );
};

const HeatmapChunk = ({ chunk }: { chunk: any }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(!showTooltip)}
    >
      <span 
        className={cn(
          "px-1 rounded text-xs transition-colors cursor-help inline-block",
          chunk.density === 'low' ? "bg-red-500/20 text-red-400" : 
          chunk.density === 'medium' ? "bg-amber-500/10 text-amber-500" : 
          "bg-emerald-500/10 text-emerald-500"
        )}
      >
        {chunk.text}
      </span>
      
      <AnimatePresence>
        {showTooltip && (chunk.explanation || chunk.suggestion) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl pointer-events-none"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-1.5 mb-1.5">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  chunk.density === 'low' ? "bg-red-500" : "bg-amber-500"
                )} />
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                  {chunk.density} Context
                </span>
              </div>
              
              {chunk.explanation && (
                <div className="space-y-1">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Issue</p>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">{chunk.explanation}</p>
                </div>
              )}
              
              {chunk.suggestion && (
                <div className="space-y-1">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Suggestion</p>
                  <p className="text-[11px] text-emerald-500/90 leading-relaxed italic">"{chunk.suggestion}"</p>
                </div>
              )}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RecommendationCard = ({ tip, index }: { tip: any, index: number }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(tip.promptSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 hover:border-amber-500/30 transition-colors group">
      <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px] font-mono">
          {index + 1}
        </span>
        {tip.title}
      </h4>
      <p className="text-xs text-zinc-500 leading-relaxed">
        {tip.description}
      </p>
      {tip.promptSnippet && (
        <div className="relative mt-2">
          <div className="bg-zinc-950 border border-zinc-800 rounded p-3 font-mono text-[10px] text-amber-500/80 break-all">
            {tip.promptSnippet}
          </div>
          <button 
            onClick={handleCopy}
            className={cn(
              "absolute top-2 right-2 p-1.5 border rounded transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5",
              copied 
                ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" 
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            )}
            title="Copy Instruction"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                <span className="text-[8px] font-mono uppercase tracking-tighter">Copied</span>
              </>
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isAutoAudit, setIsAutoAudit] = useState(true); // Default to true
  const [minAuditLength, setMinAuditLength] = useState(20); // Default sensitivity
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleAnalyze = async (textToAnalyze: string = inputText) => {
    if (!textToAnalyze.trim() || textToAnalyze.length < 10) return;
    
    setIsAnalyzing(true);
    try {
      const data = await analyzeTone(textToAnalyze);
      setResult(data);
      
      const newEntry = {
        id: Math.random().toString(36).substr(2, 9),
        title: textToAnalyze.slice(0, 30) + '...',
        timestamp: Date.now(),
        data
      };
      setHistory(prev => {
        // Prevent duplicate entries for the same text
        if (prev.length > 0 && prev[0].title === newEntry.title) return prev;
        return [newEntry, ...prev];
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto Audit Logic
  useEffect(() => {
    if (isAutoAudit && inputText.trim().length >= minAuditLength) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      
      debounceTimer.current = setTimeout(() => {
        handleAnalyze(inputText);
      }, 800); // Faster debounce for "continuous" feel
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputText, isAutoAudit, minAuditLength]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return [
      { subject: 'Gaslighting', A: result.scores.gaslighting, fullMark: 100 },
      { subject: 'Infantilizing', A: result.scores.infantilizing, fullMark: 100 },
      { subject: 'De-escalation', A: result.scores.de_escalation, fullMark: 100 },
      { subject: 'Karen Trigger', A: result.scores.karen_trigger, fullMark: 100 },
      { subject: 'Hedging', A: result.scores.hedging, fullMark: 100 },
      { subject: 'Dismissive', A: result.scores.dismissive, fullMark: 100 },
    ];
  }, [result]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col selection:bg-red-500/30">
      <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
      
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          history={history} 
          onSelect={(id) => {
            const item = history.find(h => h.id === id);
            if (item) {
              setResult(item.data);
              setInputText(item.title); // Simplified
            }
          }}
          onDelete={(id) => setHistory(prev => prev.filter(h => h.id !== id))}
          onClearAll={() => {
            if (window.confirm('Are you sure you want to clear all audit history? This action cannot be undone.')) {
              setHistory([]);
            }
          }}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            
            {/* Input Section */}
            <div className="lg:col-span-12 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Terminal className="w-3 h-3" /> Input AI Response
                </h2>
                <div className="flex flex-wrap gap-2 sm:gap-4 items-center">
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Min Chars:</span>
                    <select 
                      value={minAuditLength}
                      onChange={(e) => setMinAuditLength(Number(e.target.value))}
                      className="bg-transparent text-[10px] font-mono text-zinc-400 focus:outline-none cursor-pointer"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </div>
                  <button 
                    onClick={() => setIsAutoAudit(!isAutoAudit)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1 rounded-full border transition-all text-[10px] font-mono uppercase tracking-widest",
                      isAutoAudit 
                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                        : "bg-zinc-900 border-zinc-800 text-zinc-500"
                    )}
                  >
                    <Cpu className={cn("w-3 h-3", isAutoAudit && "animate-pulse")} />
                    <span className="hidden xs:inline">Auto Audit: {isAutoAudit ? 'Always On' : 'Standby'}</span>
                    <span className="xs:hidden">{isAutoAudit ? 'Auto: ON' : 'Auto: OFF'}</span>
                  </button>
                </div>
              </div>
              
              <div className="relative group">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste the AI response here for tone auditing..."
                  className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-sm focus:outline-none focus:border-red-500/50 transition-colors resize-none placeholder:text-zinc-700 pr-12"
                />
                {inputText && (
                  <button
                    onClick={() => setInputText('')}
                    className="absolute top-4 right-4 p-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-all shadow-lg"
                    title="Clear Input"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleAnalyze()}
                  disabled={isAnalyzing || !inputText.trim()}
                  className={cn(
                    "absolute bottom-4 right-4 px-4 md:px-6 py-2 rounded font-mono text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2 transition-all",
                    isAnalyzing 
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                      : "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 active:scale-95"
                  )}
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" /> Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3" /> Run Audit
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Results Section */}
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div 
                  key="results"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-8"
                >
                  {/* Summary Card */}
                  <div className="lg:col-span-7 space-y-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Activity className="w-16 h-16 md:w-24 md:h-24" />
                      </div>
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-[10px] font-mono uppercase tracking-widest bg-zinc-800 px-2 py-1 rounded text-zinc-400">
                            Executive Summary
                          </span>
                        </div>
                        <h3 className="text-xl md:text-2xl font-bold text-zinc-100 mb-2">{result.overallTone}</h3>
                        <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">{result.summary}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3" /> Pattern Detection Findings
                      </h2>
                      <div className="space-y-3">
                        {result.findings.map((finding, i) => (
                          <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 rounded-lg overflow-hidden transition-all hover:border-zinc-700/50">
                            <div className="p-4 flex gap-4 items-start">
                              <div className={cn(
                                "mt-1 p-1.5 rounded",
                                finding.severity === 'high' ? "bg-red-500/10 text-red-500" :
                                finding.severity === 'medium' ? "bg-amber-500/10 text-amber-500" :
                                "bg-blue-500/10 text-blue-500"
                              )}>
                                <AlertTriangle className="w-4 h-4" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                                    {finding.category}
                                  </span>
                                  <span className={cn(
                                    "text-[10px] uppercase font-mono px-1.5 py-0.5 rounded",
                                    finding.severity === 'high' ? "bg-red-500/20 text-red-400" :
                                    finding.severity === 'medium' ? "bg-amber-500/20 text-amber-400" :
                                    "bg-blue-500/20 text-blue-400"
                                  )}>
                                    {finding.severity} SEVERITY
                                  </span>
                                </div>
                                <p className="text-sm text-zinc-400 mb-2 italic">"{finding.text}"</p>
                                <p className="text-xs text-zinc-500 leading-relaxed mb-3">{finding.explanation}</p>
                                
                                <button 
                                  onClick={() => setExpandedFinding(expandedFinding === i ? null : i)}
                                  className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors"
                                >
                                  <Layers className="w-3 h-3" />
                                  {expandedFinding === i ? 'Hide Deconstruction' : 'Deconstruct RLHF Logic'}
                                  {expandedFinding === i ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                            
                            <AnimatePresence>
                              {expandedFinding === i && (
                                <motion.div 
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
                                      <h4 className="text-[10px] font-mono uppercase tracking-widest text-emerald-500">RLHF Alignment Logic (The "Nanny" Source)</h4>
                                      <p className="text-xs text-zinc-400 leading-relaxed">
                                        {finding.rlhfLogic || "Analyzing safety-alignment weights for this specific pattern..."}
                                      </p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tuning Tips Section */}
                    <div className="space-y-4">
                      <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                        <Lightbulb className="w-3 h-3 text-amber-500" /> AI Personality Tuning Tips
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {result.recommendations.map((tip, i) => (
                          <RecommendationCard key={i} tip={tip} index={i} />
                        ))}
                      </div>
                    </div>

                    {/* Personalization Profile Section */}
                    <div className="space-y-4">
                      <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                        <Settings2 className="w-3 h-3 text-blue-500" /> Personalization Profile
                      </h2>
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800 pb-4 gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-zinc-200">Base style and tone</h4>
                            <p className="text-[10px] text-zinc-500">Set the style and tone of how the AI responds to you.</p>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded text-xs font-mono text-blue-400 w-fit">
                            {result.personalization.baseStyle}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Characteristics</h4>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 p-3 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Flame className="w-3.5 h-3.5 text-orange-500" />
                                <span className="text-xs text-zinc-400">Warm</span>
                              </div>
                              <span className={cn(
                                "text-[10px] font-mono px-2 py-0.5 rounded",
                                result.personalization.warmth === 'More' ? "bg-orange-500/10 text-orange-500" : "bg-zinc-800 text-zinc-500"
                              )}>
                                {result.personalization.warmth}
                              </span>
                            </div>

                            <div className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 p-3 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Smile className="w-3.5 h-3.5 text-yellow-500" />
                                <span className="text-xs text-zinc-400">Enthusiastic</span>
                              </div>
                              <span className={cn(
                                "text-[10px] font-mono px-2 py-0.5 rounded",
                                result.personalization.enthusiasm === 'More' ? "bg-yellow-500/10 text-yellow-500" : "bg-zinc-800 text-zinc-500"
                              )}>
                                {result.personalization.enthusiasm}
                              </span>
                            </div>

                            <div className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 p-3 rounded-lg">
                              <div className="flex items-center gap-2">
                                <LayoutList className="w-3.5 h-3.5 text-blue-500" />
                                <span className="text-xs text-zinc-400">Headers & Lists</span>
                              </div>
                              <span className={cn(
                                "text-[10px] font-mono px-2 py-0.5 rounded",
                                result.personalization.structure === 'More' ? "bg-blue-500/10 text-blue-500" : "bg-zinc-800 text-zinc-500"
                              )}>
                                {result.personalization.structure}
                              </span>
                            </div>

                            <div className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 p-3 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Sticker className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-xs text-zinc-400">Emoji</span>
                              </div>
                              <span className={cn(
                                "text-[10px] font-mono px-2 py-0.5 rounded",
                                result.personalization.emoji === 'More' ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-800 text-zinc-500"
                              )}>
                                {result.personalization.emoji}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Karen Remediation Strategy */}
                        <div className="pt-4 border-t border-zinc-800">
                          <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/10 p-4 rounded-lg">
                            <div className="mt-1 p-1.5 bg-red-500/10 rounded">
                              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                            </div>
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-mono uppercase tracking-widest text-red-500">Anti-Karen Remediation Strategy</h4>
                                <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">Active Counter-Measure</span>
                              </div>
                              <p className="text-xs text-zinc-300 leading-relaxed">
                                {result.personalization.karenRemediation}
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

                    {/* Contextual Heatmap Section */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                          <Map className="w-3 h-3 text-blue-500" /> Contextual Heatmap
                        </h2>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-600 font-mono">DENSITY:</span>
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            result.contextAnalysis.score < 40 ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          )}>
                            {result.contextAnalysis.score}%
                          </span>
                        </div>
                      </div>
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6 space-y-4">
                        <p className="text-[11px] md:text-xs text-zinc-400 leading-relaxed italic border-l-2 border-zinc-800 pl-4 py-1">
                          {result.contextAnalysis.feedback}
                        </p>
                        <div className="p-3 md:p-4 bg-zinc-950 rounded-lg border border-zinc-800 flex flex-wrap gap-1 leading-relaxed">
                          {result.contextAnalysis.heatmap.map((chunk, i) => (
                            <HeatmapChunk key={i} chunk={chunk} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sanitization Glossary Section */}
                    {result.euphemisms.length > 0 && (
                      <div className="space-y-4">
                        <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                          <BookOpen className="w-3 h-3 text-amber-500" /> Sanitization Glossary
                        </h2>
                        <div className="grid grid-cols-1 gap-3">
                          {result.euphemisms.map((item, i) => (
                            <div key={i} className="group bg-zinc-900 border border-zinc-800 p-4 rounded-xl hover:border-amber-500/30 transition-colors flex items-start gap-4">
                              <div className="mt-1 p-1.5 bg-amber-500/10 rounded">
                                <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-amber-500 uppercase tracking-wide">{item.term}</span>
                                  <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">Evasive Euphemism</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-zinc-500 font-mono text-[10px]">DIRECT TRANSLATION:</span>
                                  <span className="text-emerald-500 font-bold">{item.translation}</span>
                                </div>
                                <p className="text-[11px] text-zinc-500 italic leading-relaxed">
                                  {item.context}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-5 space-y-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6">
                      <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-6">Tone Distribution Profile</h3>
                      <div className="h-48 sm:h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                            <PolarGrid stroke="#27272a" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 8 }} />
                            <Radar
                              name="Analysis"
                              dataKey="A"
                              stroke="#ef4444"
                              fill="#ef4444"
                              fillOpacity={0.3}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="mt-6 space-y-3">
                        {Object.entries(TONE_CATEGORIES).map(([key, cat]) => {
                          const score = result.scores[cat.id as keyof typeof result.scores] || 0;
                          return (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-[10px] font-mono uppercase">
                                <span className="text-zinc-500">{cat.label}</span>
                                <span className={cn(
                                  score > 70 ? "text-red-500" : score > 40 ? "text-amber-500" : "text-emerald-500"
                                )}>{score}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${score}%` }}
                                  className={cn(
                                    "h-full rounded-full",
                                    score > 70 ? "bg-red-500" : score > 40 ? "bg-amber-500" : "bg-emerald-500"
                                  )}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6">
                      <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        Trigger Word Analysis
                        <span className="text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded w-fit">
                          {TRIGGER_WORDS.filter(w => inputText.toLowerCase().includes(w.word.toLowerCase())).length} DETECTED
                        </span>
                      </h3>
                      <TriggerHighlighter text={inputText} />
                      <div className="mt-4 p-3 bg-zinc-950 rounded border border-zinc-800">
                        <p className="text-[10px] text-zinc-600 font-mono leading-tight">
                          <Info className="w-3 h-3 inline mr-1 mb-0.5" />
                          Highlighted words are part of the internal "Karen/Gaslight" dictionary. These phrases are often used to signal bureaucratic evasion or condescension.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="lg:col-span-12 py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center">
                    <Search className="w-8 h-8 text-zinc-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-zinc-500">Awaiting Input Data</h3>
                    <p className="text-sm text-zinc-600 max-w-xs mx-auto">
                      Paste a response from an AI model to begin the tone integrity audit.
                    </p>
                  </div>
                </div>
              )}
            </AnimatePresence>

          </div>
        </main>
      </div>

      {/* Footer Status Bar */}
      <footer className="border-t border-zinc-800 bg-zinc-950 px-4 md:px-6 py-3 md:py-2 flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] font-mono text-zinc-600">
        <div className="flex flex-wrap justify-center gap-4 md:gap-6">
          <span>ENCRYPTION: AES-256</span>
          <span className="hidden xs:inline">AUDIT_MODE: SEMANTIC_DEEP_SCAN</span>
          <span className="hidden sm:inline">MODEL: GEMINI-3-FLASH</span>
        </div>
        <div className="text-center md:text-right">
          &copy; 2026 AI TONE AUDITOR CORE
        </div>
      </footer>
    </div>
  );
}
