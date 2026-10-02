/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  AlertTriangle,
  Info,
  Terminal,
  Activity,
  Zap,
  Trash2,
  XCircle,
  Cpu,
  Lightbulb,
  BookOpen,
  Map,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { analyzeTone, getLastAnalysisRuntimeMeta, getProviderTelemetrySnapshot } from './services/analyzeClient';
import { TONE_CATEGORIES, TRIGGER_WORDS } from './constants';
import { cn } from './lib/utils';
import type { AnalysisResult } from './types/analysis';
import type { ProviderRuntimeMeta } from './types/provider';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { TriggerHighlighter } from './components/TriggerHighlighter';
import { HeatmapChunk } from './components/HeatmapChunk';
import { RecommendationCard } from './components/RecommendationCard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExportButton } from './components/ExportButton';
import { FindingCard } from './components/FindingCard';
import { PersonalizationProfile } from './components/PersonalizationProfile';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem('audit-history');
      return stored ? (JSON.parse(stored) as any[]) : [];
    } catch {
      return [];
    }
  });
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAutoAudit, setIsAutoAudit] = useState(true);
  const [minAuditLength, setMinAuditLength] = useState(20);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [runtimeMeta, setRuntimeMeta] = useState<ProviderRuntimeMeta>(getLastAnalysisRuntimeMeta());
  const [telemetry, setTelemetry] = useState(getProviderTelemetrySnapshot());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAnalyze = async (textToAnalyze: string = inputText) => {
    if (!textToAnalyze.trim() || textToAnalyze.length < 10) return;

    abortControllerRef.current = new AbortController();
    setAnalysisError(null);
    setIsAnalyzing(true);
    const startTime = performance.now();
    try {
      const { result: data, meta } = await analyzeTone(textToAnalyze, abortControllerRef.current.signal);
      setLatencyMs(Math.round(performance.now() - startTime));
      setResult(data);
      setRuntimeMeta(meta);
      setTelemetry(getProviderTelemetrySnapshot());
      
      const newEntry = {
        id: Math.random().toString(36).substr(2, 9),
        title: textToAnalyze.slice(0, 30) + '...',
        timestamp: Date.now(),
        data,
        meta,
      };
      setHistory(prev => {
        if (prev.length > 0 && prev[0].title === newEntry.title) return prev;
        return [newEntry, ...prev].slice(0, 50);
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error(error);
      setAnalysisError(error instanceof Error ? error.message : 'Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  // Auto Audit Logic
  useEffect(() => {
    if (isAutoAudit && !isAnalyzing && inputText.trim().length >= minAuditLength) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      
      debounceTimer.current = setTimeout(() => {
        handleAnalyze(inputText);
      }, 800);
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputText, isAutoAudit, isAnalyzing, minAuditLength]);

  useEffect(() => {
    try {
      localStorage.setItem('audit-history', JSON.stringify(history.slice(0, 50)));
    } catch {
      // ignore write errors (storage full, private browsing)
    }
  }, [history]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return [
      { subject: 'Gaslighting', A: result.scores.gaslighting, fullMark: 100 },
      { subject: 'Infantilizing', A: result.scores.infantilizing, fullMark: 100 },
      { subject: 'De-escalation', A: result.scores.de_escalation, fullMark: 100 },
      { subject: 'Karen Trigger', A: result.scores.karen_trigger, fullMark: 100 },
      { subject: 'Hedging', A: result.scores.hedging, fullMark: 100 },
      { subject: 'Dismissive', A: result.scores.dismissive, fullMark: 100 },
      { subject: 'Sycophancy', A: result.scores.sycophancy, fullMark: 100 },
      { subject: 'Over-apologizing', A: result.scores.over_apologizing, fullMark: 100 },
      { subject: 'Repetitive Filler', A: result.scores.repetitive_filler, fullMark: 100 },
    ];
  }, [result]);

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col selection:bg-red-500/30">
      <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} latencyMs={latencyMs} />
      
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
              if (item.meta) {
                setRuntimeMeta(item.meta);
              }
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
                  onClick={isAnalyzing ? handleCancel : () => handleAnalyze()}
                  disabled={!isAnalyzing && !inputText.trim()}
                  className={cn(
                    "absolute bottom-4 right-4 px-4 md:px-6 py-2 rounded font-mono text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2 transition-all",
                    isAnalyzing 
                      ? "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-red-400 hover:border-red-500/50" 
                      : "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 active:scale-95"
                  )}
                >
                  {isAnalyzing ? (
                    <>
                      <X className="w-3 h-3" /> Cancel
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3" /> Run Audit
                    </>
                  )}
                </button>
              </div>
              {analysisError && (
                <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="flex-1 text-red-400 text-xs leading-relaxed">{analysisError}</p>
                  <button onClick={() => setAnalysisError(null)} aria-label="Dismiss error" className="p-0.5 text-zinc-600 hover:text-zinc-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
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
                  <div className="lg:col-span-12 flex justify-end">
                    <ExportButton result={result} />
                  </div>
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
                          <FindingCard key={i} finding={finding} index={i} />
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
                    <PersonalizationProfile personalization={result.personalization} />

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
          <span className="hidden xs:inline">AUDIT_MODE: SEMANTIC_DEEP_SCAN</span>
          <span className="hidden sm:inline">PROVIDER: {runtimeMeta.providerLabel.toUpperCase()}</span>
          <span className="hidden sm:inline">MODEL: {runtimeMeta.model.toUpperCase()}</span>
          {runtimeMeta.usedFallback && <span className="text-amber-500">FALLBACK: ACTIVE</span>}
          <span className="hidden md:inline">
            FALLBACK_RATE: {telemetry.fallbackRatePercent}% ({telemetry.fallbackActivations}/{telemetry.totalAnalyses || 0})
          </span>
          <span className="hidden lg:inline">
            RECENT: {telemetry.recentFallbackRatePercent}% ({telemetry.recentWindowSize || 0})
          </span>
          <span className={cn(
            'hidden lg:inline',
            telemetry.fallbackTrend === 'up' ? 'text-red-400' : telemetry.fallbackTrend === 'down' ? 'text-emerald-400' : 'text-zinc-500'
          )}>
            TREND: {telemetry.fallbackTrend.toUpperCase()}
          </span>
        </div>
        <div className="text-center md:text-right space-y-1">
          <div>&copy; 2026 AI TONE AUDITOR CORE</div>
          <div className="text-[9px] text-zinc-500">
            Diagnostic output only; verify conclusions before policy, compliance, or operational decisions.
          </div>
        </div>
      </footer>
    </div>
    </ErrorBoundary>
  );
}
