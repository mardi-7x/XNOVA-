import React from 'react';
import { Layers, FileCheck2, CopySlash, ShieldAlert, CheckCircle, Clock, Zap, Activity } from 'lucide-react';
import { PipelineRun } from '../types/pipeline';

interface PipelineMetricsProps {
  run: PipelineRun;
}

export const PipelineMetrics: React.FC<PipelineMetricsProps> = ({ run }) => {
  const diag = run.stageDiagnostics;

  const getStageBadgeClass = (st?: string) => {
    if (st === 'HEALTHY') return 'text-emerald-300 border-emerald-500/40 bg-emerald-950/40';
    if (st === 'DEGRADED') return 'text-amber-300 border-amber-500/40 bg-amber-950/40';
    if (st === 'FAILED') return 'text-rose-300 border-rose-500/40 bg-rose-950/40';
    return 'text-slate-400 border-slate-700 bg-slate-900/40';
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Collected */}
        <div className="p-3.5 rounded-lg bg-[#071024]/85 border border-cyan-800/40 relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1.5">
            <span>Collected</span>
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-100 tracking-tight">
            {run.articlesCollected}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
            <span>Window:</span>
            <span className="text-cyan-300 font-semibold">{run.windowHours}h</span>
          </div>
        </div>

        {/* Metric 2: Unique Articles */}
        <div className="p-3.5 rounded-lg bg-[#071024]/85 border border-cyan-800/40 relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1.5">
            <span>Unique Articles</span>
            <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-200 tracking-tight">
            {run.uniqueArticles}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {run.cacheHits ? `${run.cacheHits} Cache Hits` : 'Canonical URLs'}
          </div>
        </div>

        {/* Metric 3: Duplicates & Invalid URLs Removed */}
        <div className="p-3.5 rounded-lg bg-[#071024]/85 border border-cyan-800/40 relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1.5">
            <span>Duplicates Removed</span>
            <CopySlash className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300 tracking-tight">
            {run.duplicatesRemoved}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {run.invalidUrlsRejected ? `+${run.invalidUrlsRejected} invalid URLs` : 'Syndications clustered'}
          </div>
        </div>

        {/* Metric 4: Verified Candidates */}
        <div className="p-3.5 rounded-lg bg-[#071024]/85 border border-emerald-900/40 relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1.5">
            <span>Verified &amp; Published</span>
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300 tracking-tight">
            {run.verifiedCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {run.dryRun ? 'Dry-Run (0 published)' : `Published: ${run.publishedCount ?? run.verifiedCount}`}
          </div>
        </div>

        {/* Metric 5: Partially Verified / Unverified / Conflicting */}
        <div className="p-3.5 rounded-lg bg-[#071024]/85 border border-amber-900/40 relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1.5">
            <span>Held / Partial / Conflict</span>
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300 tracking-tight">
            {(run.partiallySupportedCount || 0) + (run.unverifiedCount || 0) + (run.disputedCount || 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            P:{run.partiallySupportedCount} · U:{run.unverifiedCount} · C:{run.disputedCount}
          </div>
        </div>

        {/* Metric 6: Dual-Engine Execution Speed */}
        <div className="p-3.5 rounded-lg bg-[#071024]/85 border border-cyan-800/40 relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1.5">
            <span>Dual-Engine Pipeline</span>
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xs font-bold font-mono text-cyan-300 tracking-tight truncate" title={run.activeProvider}>
            {run.activeProvider}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3" />
            <span>{run.executionDurationMs > 0 ? `${run.executionDurationMs}ms` : 'Instant'}</span>
          </div>
        </div>
      </div>

      {/* Stage-Specific Health Diagnostics Telemetry Bar */}
      {diag && (
        <div className="p-3 rounded-lg bg-[#060d1f]/90 border border-cyan-900/50 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>STAGE DIAGNOSTICS:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded border ${getStageBadgeClass(diag.sourceCollection.status)}`}>
              1. Collection: {diag.sourceCollection.status} ({diag.sourceCollection.storiesFetched} fetched, {diag.sourceCollection.latencyMs}ms)
            </span>

            <span className={`px-2 py-0.5 rounded border ${getStageBadgeClass(diag.deduplication.status)}`}>
              2. Dedupe: {diag.deduplication.uniqueRemaining} unique ({diag.deduplication.duplicatesRejected} dupes)
            </span>

            <span className={`px-2 py-0.5 rounded border ${getStageBadgeClass(diag.groqProcessing.status)}`}>
              3. Groq Extract: {diag.groqProcessing.status} ({diag.groqProcessing.succeeded} ok / {diag.groqProcessing.failed} fail, {diag.groqProcessing.latencyMs}ms)
            </span>

            <span className={`px-2 py-0.5 rounded border ${getStageBadgeClass(diag.openRouterVerification.status)}`}>
              4. OpenRouter Verify: {diag.openRouterVerification.status} ({diag.openRouterVerification.succeeded} ok / {diag.openRouterVerification.failed} fail, {diag.openRouterVerification.latencyMs}ms)
            </span>

            <span className={`px-2 py-0.5 rounded border ${getStageBadgeClass(diag.publication.status)}`}>
              5. Policy: {diag.publication.publishedCount} published / {diag.publication.heldCount} held
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
