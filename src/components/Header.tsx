import React from 'react';
import { ShieldCheck, Download, RefreshCw, Activity, AlertTriangle, FileDown } from 'lucide-react';
import { PipelineStatus } from '../types/pipeline';

interface HeaderProps {
  status: PipelineStatus;
  isLiveData: boolean;
  systemTime?: string;
  onRefreshHealth: () => void;
  onExportLedger: () => void;
  onDownloadDossier?: () => void;
  isRefreshing?: boolean;
  isDownloadingDossier?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  isLiveData,
  systemTime,
  onRefreshHealth,
  onExportLedger,
  onDownloadDossier,
  isRefreshing = false,
  isDownloadingDossier = false
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'RUNNING':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 text-xs font-mono rounded">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-semibold tracking-wider">PIPELINE: RUNNING</span>
          </div>
        );
      case 'DEGRADED':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-mono rounded">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold tracking-wider">PIPELINE: DEGRADED</span>
          </div>
        );
      case 'FAILED':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-mono rounded">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="font-semibold tracking-wider">PIPELINE: FAILED</span>
          </div>
        );
      case 'HEALTHY':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/60 border border-emerald-400/40 text-emerald-300 text-xs font-mono rounded">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-semibold tracking-wider">PIPELINE: HEALTHY</span>
          </div>
        );
      case 'IDLE':
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs font-mono rounded">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-semibold tracking-wider">PIPELINE: READY</span>
          </div>
        );
    }
  };

  return (
    <header className="border-b border-cyan-900/40 bg-[#060b18]/80 backdrop-blur-md sticky top-0 z-40 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-400/50 shadow-[0_0_15px_rgba(0,240,255,0.25)]">
            <ShieldCheck className="w-6 h-6 text-cyan-300" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold tracking-widest text-cyan-50 font-['Plus_Jakarta_Sans'] flex items-center gap-2">
                <span>XNOVA</span>
                <span className="text-cyan-400 text-xs px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30 font-mono font-medium">
                  STEP 1 ENGINE
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 tracking-wide font-normal mt-0.5">
              Global News Collection &amp; Source Verification Intelligence
            </p>
          </div>
        </div>

        {/* Status Indicators & Action Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Data Provenance Badge */}
          <div className="flex items-center gap-2 text-xs font-mono px-2.5 py-1 rounded bg-[#09152b] border border-cyan-800/50">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            {isLiveData ? (
              <span className="text-emerald-300 font-medium">LIVE API INGESTION</span>
            ) : (
              <span className="text-cyan-300 font-medium" title="Running with curated verification dispatches. Add NEWS_API_KEY for real-time NewsAPI ingestion.">
                VERIFICATION BENCHMARK FEED
              </span>
            )}
          </div>

          {/* Pipeline State Badge */}
          {getStatusBadge()}

          {/* Refresh Providers Button */}
          <button
            onClick={onRefreshHealth}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#0a1835] hover:bg-cyan-950 text-cyan-200 border border-cyan-700/40 hover:border-cyan-400/60 transition-colors disabled:opacity-50"
            title="Poll all 5 provider health endpoints"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Health Check</span>
          </button>

          {/* Export Auditable Ledger Button */}
          <button
            onClick={onExportLedger}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-cyan-900/30 hover:bg-cyan-800/50 text-cyan-100 border border-cyan-500/40 hover:border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.15)] transition-all cursor-pointer"
            title="Export JSON audit ledger with complete provenance"
          >
            <Download className="w-3.5 h-3.5 text-cyan-300" />
            <span>Export JSON Ledger</span>
          </button>

          {/* Download Dossier PDF Button */}
          {onDownloadDossier && (
            <button
              onClick={onDownloadDossier}
              disabled={isDownloadingDossier}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-gradient-to-r from-amber-600/30 to-amber-500/20 hover:from-amber-600/50 hover:to-amber-500/40 text-amber-200 border border-amber-500/50 hover:border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)] transition-all cursor-pointer disabled:opacity-50"
              title="Download publication-grade 6-Pillar Sovereign Intelligence Dossier PDF (100/100 Edition)"
            >
              {isDownloadingDossier ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Download Dossier</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
