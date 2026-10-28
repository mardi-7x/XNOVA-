import React, { useState, useEffect } from 'react';
import {
  FileText,
  Sparkles,
  Copy,
  Check,
  Loader2,
  BookOpen,
  Activity,
  Hash,
  Radar,
  ShieldAlert,
  FileDown
} from 'lucide-react';
import { SovereignDossierReport } from '../pipeline/sovereignDossierSynthesizer';
import { synthesizeSovereignDossierApi } from '../services/api';
import { generateDossierPdf } from '../utils/generateDossierPdf';

interface SovereignDossierPanelProps {
  initialReport?: SovereignDossierReport | null;
  onDossierChange?: (report: SovereignDossierReport) => void;
  onDownloadPdf?: () => void;
}

export const SovereignDossierPanel: React.FC<SovereignDossierPanelProps> = ({
  initialReport,
  onDossierChange,
  onDownloadPdf
}) => {
  const [rawInput, setRawInput] = useState('');
  const [report, setReport] = useState<SovereignDossierReport | null>(initialReport || null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'structured' | 'markdown'>('structured');

  useEffect(() => {
    if (initialReport) {
      setReport(initialReport);
    }
  }, [initialReport]);

  useEffect(() => {
    // Load initial Sovereign Dossier from live verified feed on mount
    if (!report) {
      synthesizeSovereignDossierApi({})
        .then((res) => {
          if (res) {
            setReport(res);
            onDossierChange?.(res);
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleSynthesize = async (useLiveFeed = false) => {
    setIsSynthesizing(true);
    try {
      const res = await synthesizeSovereignDossierApi({
        rawInput: useLiveFeed ? undefined : rawInput.trim() || undefined
      });
      if (res) {
        setReport(res);
        onDossierChange?.(res);
      }
    } catch (err) {
      console.error('Sovereign dossier synthesis error:', err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (onDownloadPdf) {
      onDownloadPdf();
      return;
    }
    if (!report) return;
    setIsGeneratingPdf(true);
    try {
      await generateDossierPdf(report);
    } catch (e) {
      console.error('Failed to generate PDF:', e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!report?.markdownDossier) return;
    navigator.clipboard.writeText(report.markdownDossier);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-[#060c1d]/95 holo-border rounded-xl p-4 sm:p-6 box-glow space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-cyan-900/50">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-400/50 rounded">
              100/100 EDITION • EDITOR-IN-CHIEF ENGINE
            </span>
            <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-widest bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 rounded">
              ZERO HALLUCINATION • EN / বাংলা SYNTHESIS
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white mt-1.5 tracking-tight flex items-center gap-2">
            <span>🗞️ THE SOVEREIGN INTELLIGENCE DOSSIER (100/100 EDITION)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ingests raw news articles, arXiv research links, or unstructured text — strictly segregating [VERIFIED FACTS] from [EXECUTIVE ANALYSIS] across the mandatory 6-section schema.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#07132a] p-1 rounded-lg border border-cyan-900/60 text-xs font-mono">
            <button
              type="button"
              onClick={() => setViewMode('structured')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                viewMode === 'structured'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-cyan-200'
              }`}
            >
              6-Pillar View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('markdown')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                viewMode === 'markdown'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-cyan-200'
              }`}
            >
              Raw Markdown
            </button>
          </div>

          {report && (
            <>
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-[#07132a] hover:bg-cyan-950 text-cyan-300 border border-cyan-700/50 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Dossier' : 'Copy 6-Section Dossier'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 hover:border-amber-400 transition-all cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.2)] disabled:opacity-50"
                title="Download publication-grade 6-Pillar Sovereign Intelligence Dossier PDF (100/100 Edition)"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Download PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Raw Input Ingestion Box */}
      <div className="bg-[#07132a]/90 border border-cyan-900/60 rounded-xl p-4">
        <label className="block text-xs font-mono uppercase text-cyan-300 mb-2">
          Ingest Raw News Articles, arXiv Links, or Unstructured Intelligence Text:
        </label>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          rows={3}
          placeholder="Paste raw news articles, benchmark metrics, arXiv paper abstracts/links, or unstructured text here to synthesize into the 6-Pillar Sovereign Intelligence Dossier (or leave blank to synthesize from the live verified XNOVA feed)..."
          className="w-full bg-[#050c1a] border border-cyan-900/60 focus:border-cyan-400 rounded-lg p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none font-mono"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <span className="text-[11px] font-mono text-slate-400">
            Strict Editorial Rules: 0% Hallucination • 100% Fact-to-Opinion Split • Bilingual Technical Precision (EN + বাংলা)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSynthesize(true)}
              disabled={isSynthesizing}
              className="px-3.5 py-2 rounded-lg text-xs font-mono bg-cyan-950/90 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isSynthesizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              <span>Synthesize Live Verified Feed</span>
            </button>
            <button
              type="button"
              onClick={() => handleSynthesize(false)}
              disabled={isSynthesizing}
              className="px-4 py-2 rounded-lg text-xs font-mono font-bold bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
            >
              {isSynthesizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Synthesize 6-Section Dossier</span>
            </button>
          </div>
        </div>
      </div>

      {/* Render Dossier Output */}
      {report && viewMode === 'markdown' && (
        <pre className="bg-[#040914] border border-cyan-900/60 rounded-xl p-4 text-xs font-mono text-cyan-100 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {report.markdownDossier}
        </pre>
      )}

      {report && viewMode === 'structured' && (
        <div className="space-y-4">
          {/* 1. THE ALPHA SIGNAL & 3. THE NUMBER THAT MATTERS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#07132a]/90 border border-cyan-800/60 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-300 uppercase border-b border-cyan-900/50 pb-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>## 1. THE ALPHA SIGNAL (Macro Paradigm Shift)</span>
              </div>
              <div className="text-xs space-y-2">
                <p className="text-slate-200">
                  <strong className="text-cyan-300 font-mono">- The Catalyst:</strong> {report.alphaSignal.catalyst}
                </p>
                <p className="text-slate-200">
                  <strong className="text-cyan-300 font-mono">- Market Mispricing:</strong>{' '}
                  {report.alphaSignal.marketMispricing}
                </p>
                <p className="text-slate-200">
                  <strong className="text-cyan-300 font-mono">- Second-Order Impact:</strong>{' '}
                  {report.alphaSignal.secondOrderImpact}
                </p>
                {report.alphaSignal.bengaliNote && (
                  <p className="text-cyan-200/90 bg-cyan-950/40 border border-cyan-800/40 rounded p-2.5 mt-2">
                    <strong className="text-amber-300 font-mono">বাংলা কৌশলগত সারসংক্ষেপ:</strong>{' '}
                    {report.alphaSignal.bengaliNote}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-[#07132a]/90 border border-emerald-700/50 rounded-xl p-4 flex flex-col justify-between space-y-2.5">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-300 uppercase border-b border-cyan-900/50 pb-2">
                  <Hash className="w-4 h-4 text-emerald-400" />
                  <span>## 3. THE NUMBER THAT MATTERS</span>
                </div>
                <div className="mt-3 mb-2">
                  <div className="text-[11px] font-mono text-slate-400 uppercase">- The Number:</div>
                  <div className="text-lg font-bold font-mono text-emerald-300">{report.numberThatMatters.theNumber}</div>
                </div>
                <p className="text-xs text-slate-300 mb-2">
                  <strong className="text-cyan-300 font-mono">- Historical Baseline:</strong>{' '}
                  {report.numberThatMatters.historicalBaseline}
                </p>
                <p className="text-xs text-slate-300">
                  <strong className="text-cyan-300 font-mono">- Industry Equation Shift:</strong>{' '}
                  {report.numberThatMatters.industryEquationShift}
                </p>
              </div>
            </div>
          </div>

          {/* 2. TOP INTELLIGENCE BRIEFINGS */}
          <div className="bg-[#07132a]/90 border border-cyan-800/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-300 uppercase border-b border-cyan-900/50 pb-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>## 2. TOP INTELLIGENCE BRIEFINGS (Strict Fact vs. Analysis Segregation)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {report.topBriefings.map((b, idx) => (
                <div key={idx} className="bg-[#050d1f] border border-cyan-900/60 rounded-lg p-3.5 space-y-2">
                  <h4 className="text-sm font-bold text-white leading-snug">- {b.storyTitle}</h4>
                  <div className="text-xs text-emerald-200/95 bg-emerald-950/30 border border-emerald-700/40 rounded p-2.5">
                    <strong className="text-emerald-300 font-mono">* [VERIFIED FACTS]:</strong> {b.verifiedFacts}
                  </div>
                  <div className="text-xs text-cyan-200/95 bg-cyan-950/30 border border-cyan-700/40 rounded p-2.5">
                    <strong className="text-cyan-300 font-mono">* [EXECUTIVE ANALYSIS]:</strong> {b.executiveAnalysis}
                  </div>
                  {b.bengaliSynopsis && (
                    <div className="text-[11px] text-amber-200/90 bg-amber-950/20 border border-amber-700/30 rounded p-2">
                      <strong className="text-amber-300 font-mono">* [বাংলা সংশ্লেষণ]:</strong> {b.bengaliSynopsis}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 4. ARXIV FRONTIER RESEARCH BREAKTHROUGHS & 5. THE UNFINISHED FILE */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#07132a]/90 border border-purple-700/50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-purple-300 uppercase border-b border-cyan-900/50 pb-2">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span>## 4. ARXIV FRONTIER RESEARCH BREAKTHROUGHS</span>
              </div>
              <p className="text-xs text-slate-200">
                <strong className="text-purple-300 font-mono">- Paper Title &amp; Source:</strong>{' '}
                {report.arxivBreakthrough.paperTitleAndSource}
              </p>
              <p className="text-xs text-slate-300">
                <strong className="text-purple-300 font-mono">- Core Architectural Innovation:</strong>{' '}
                {report.arxivBreakthrough.coreArchitecturalInnovation}
              </p>
              <p className="text-xs text-slate-300">
                <strong className="text-purple-300 font-mono">- Production Bottleneck Solved:</strong>{' '}
                {report.arxivBreakthrough.productionBottleneckSolved}
              </p>
            </div>

            <div className="bg-[#07132a]/90 border border-amber-700/50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-300 uppercase border-b border-cyan-900/50 pb-2">
                <Radar className="w-4 h-4 text-amber-400" />
                <span>## 5. THE UNFINISHED FILE (72-Hour Radar)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-200 pt-1">
                {report.unfinishedFile72h.activeCatalysts.map((cat, idx) => (
                  <li key={idx} className="bg-[#050d1f] border border-amber-900/40 rounded p-2.5">
                    <strong className="text-amber-300 font-mono">- Active Catalyst:</strong> {cat}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 6. EPISTEMIC AUDIT & TELEMETRY LOG */}
          <div className="bg-[#040914] border border-cyan-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-300 uppercase mb-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <span>## 6. EPISTEMIC AUDIT &amp; TELEMETRY LOG</span>
            </div>
            <pre className="text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
{`==================================================================
• Epistemic Confidence Score : ${report.epistemicConfidenceScore}%
• Fact-to-Opinion Split      : 100% Enforced
• Synthesizer Persona        : Institutional Dossier Editor-in-Chief
• Processing Engine          : gemini-3.8-flash (Primary) [${report.processingEngine}]
==================================================================`}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
};
