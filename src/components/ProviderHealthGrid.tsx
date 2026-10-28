import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  KeyRound,
  Clock,
  Zap,
  Globe,
  Search,
  Brain,
  Cpu,
  Shuffle,
  Loader2,
  ShieldAlert,
  AlertTriangle
} from 'lucide-react';
import { ProviderHealth, ProviderStatusType } from '../types/pipeline';

interface ProviderHealthGridProps {
  providers: ProviderHealth[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const ProviderHealthGrid: React.FC<ProviderHealthGridProps> = ({
  providers,
  isLoading,
  onRefresh
}) => {
  const getProviderIcon = (id: string) => {
    switch (id) {
      case 'newsapi':
        return <Globe className="w-4 h-4 text-cyan-400" />;
      case 'tavily':
        return <Search className="w-4 h-4 text-cyan-400" />;
      case 'gemini':
        return <Brain className="w-4 h-4 text-emerald-400" />;
      case 'groq':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'openrouter':
        return <Shuffle className="w-4 h-4 text-purple-400" />;
      default:
        return <Cpu className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getStatusBadge = (status: ProviderStatusType) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>HEALTHY</span>
          </span>
        );
      case 'CHECKING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-cyan-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>CHECKING</span>
          </span>
        );
      case 'CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-sky-300">
            <KeyRound className="w-3.5 h-3.5 text-sky-400" />
            <span>CONFIGURED</span>
          </span>
        );
      case 'RATE_LIMITED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>RATE_LIMITED</span>
          </span>
        );
      case 'MODEL_UNAVAILABLE':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-orange-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>MODEL_UNAVAILABLE</span>
          </span>
        );
      case 'AUTH_ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-rose-400">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>AUTH_ERROR</span>
          </span>
        );
      case 'OFFLINE':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-rose-400">
            <XCircle className="w-3.5 h-3.5" />
            <span>OFFLINE</span>
          </span>
        );
      case 'NO_KEY':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-slate-400">
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            <span>NO_KEY</span>
          </span>
        );
    }
  };

  const getCardStyle = (status: ProviderStatusType) => {
    switch (status) {
      case 'HEALTHY':
        return 'bg-[#071328]/80 border-emerald-500/35 hover:border-emerald-400/60';
      case 'CHECKING':
        return 'bg-[#07162c]/80 border-cyan-400/40 animate-pulse';
      case 'CONFIGURED':
        return 'bg-[#071226]/80 border-sky-500/30 hover:border-sky-400/50';
      case 'RATE_LIMITED':
        return 'bg-[#171106]/80 border-amber-500/40 hover:border-amber-400/60';
      case 'MODEL_UNAVAILABLE':
        return 'bg-[#190e06]/80 border-orange-500/40 hover:border-orange-400/60';
      case 'AUTH_ERROR':
      case 'OFFLINE':
        return 'bg-[#19080c]/75 border-rose-500/35 hover:border-rose-400/60';
      case 'NO_KEY':
      default:
        return 'bg-[#060a16]/60 border-slate-800';
    }
  };

  return (
    <div className="bg-[#060c1c]/90 holo-border rounded-xl p-4 sm:p-5 box-glow">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-cyan-900/40">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-cyan-100 uppercase font-mono flex items-center gap-2">
            <span>Provider Telemetry &amp; Connectivity Matrix</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Live API verification status, measured latency, quota diagnostics, and intelligent fallback routing
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400 font-mono">
            Pipeline: <span className="text-amber-300">Groq (Fast Extraction)</span> &rarr; <span className="text-purple-300">Nemotron 3 Super (Verification)</span> (Fallback: Gemini)
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="px-2.5 py-1 text-[11px] font-mono rounded bg-[#091936] hover:bg-cyan-950 text-cyan-300 border border-cyan-700/50 hover:border-cyan-400 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? 'Testing...' : 'Run Live Check'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {providers.map((p) => {
          const displayStatus: ProviderStatusType = isLoading && p.keyConfigured ? 'CHECKING' : p.status;
          return (
            <div
              key={p.id}
              className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${getCardStyle(displayStatus)}`}
            >
              <div>
                {/* Provider Header */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1 rounded bg-[#091834] border border-cyan-800/60 shrink-0">
                      {getProviderIcon(p.id)}
                    </div>
                    <span className="font-semibold text-sm text-cyan-100 truncate">{p.name}</span>
                  </div>
                  {getStatusBadge(displayStatus)}
                </div>

                {/* Role */}
                <p className="text-[11px] text-slate-400 leading-snug mb-3">
                  {p.role}
                </p>
              </div>

              {/* Provider Technical Telemetry */}
              <div className="pt-2 border-t border-cyan-950/80 space-y-1.5 text-[11px] font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Key</span>
                  <span className={p.keyConfigured ? 'text-cyan-300' : 'text-slate-500'}>
                    {p.keyMasked}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Latency
                  </span>
                  <span
                    className={`font-semibold ${
                      p.latencyMs === 0
                        ? 'text-slate-500'
                        : p.latencyMs < 600
                        ? 'text-emerald-400'
                        : p.latencyMs < 1800
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {p.latencyMs > 0 ? `${p.latencyMs}ms` : '—'}
                  </span>
                </div>

                {p.modelUsed && (
                  <div className="flex items-center justify-between text-slate-400 gap-2">
                    <span className="shrink-0">Model</span>
                    <span className="text-cyan-300 truncate text-right" title={p.modelUsed}>
                      {p.modelUsed}
                    </span>
                  </div>
                )}

                {p.quotaResetHint && (
                  <div className="text-[10px] text-amber-300/90 pt-1 border-t border-amber-950/60">
                    {p.quotaResetHint}
                  </div>
                )}

                {p.errorMessage && (
                  <p
                    className={`text-[10px] line-clamp-3 pt-1 border-t ${
                      displayStatus === 'RATE_LIMITED'
                        ? 'text-amber-300/90 border-amber-950/60'
                        : displayStatus === 'MODEL_UNAVAILABLE'
                        ? 'text-orange-300/90 border-orange-950/60'
                        : displayStatus === 'AUTH_ERROR' || displayStatus === 'OFFLINE'
                        ? 'text-rose-300/90 border-rose-950/60'
                        : 'text-slate-400 border-cyan-950/60'
                    }`}
                    title={p.errorMessage}
                  >
                    {p.errorMessage}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
