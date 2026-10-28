import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Trash2, ArrowDownCircle, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { PipelineLog } from '../types/pipeline';

interface PipelineConsoleLogsProps {
  logs: PipelineLog[];
  onClearLogs?: () => void;
}

export const PipelineConsoleLogs: React.FC<PipelineConsoleLogsProps> = ({ logs, onClearLogs }) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter((log) => {
    if (filterLevel === 'ALL') return true;
    return log.level === filterLevel;
  });

  const getLogIcon = (level: PipelineLog['level']) => {
    switch (level) {
      case 'SUCCESS':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
      case 'WARN':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case 'ERROR':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />;
      case 'INFO':
      default:
        return <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="bg-[#050917]/95 holo-border rounded-xl p-4 sm:p-5 box-glow font-mono">
      {/* Console Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-cyan-900/40">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-cyan-200 tracking-wider uppercase">
            Pipeline Execution &amp; Retry Telemetry Log
          </h3>
          <span className="text-[10px] text-slate-500 px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-900">
            {filteredLogs.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Level Filter */}
          <div className="flex items-center bg-[#07132a] p-0.5 rounded border border-cyan-900/60 text-[10px]">
            {['ALL', 'INFO', 'SUCCESS', 'WARN', 'ERROR'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  filterLevel === lvl
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-cyan-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
              title="Clear Console"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Console Scroll Container */}
      <div
        ref={scrollRef}
        className="h-44 overflow-y-auto space-y-1.5 text-xs pr-1 scrollbar-thin"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 italic py-6 text-center text-xs">
            No telemetry records matching filter.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 py-1 px-1.5 rounded hover:bg-cyan-950/30 transition-colors"
            >
              {getLogIcon(log.level)}
              
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>

              <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-900/60 shrink-0 font-bold">
                {log.stage}
              </span>

              <p className={`text-[11px] leading-relaxed flex-1 ${
                log.level === 'SUCCESS'
                  ? 'text-emerald-300'
                  : log.level === 'WARN'
                  ? 'text-amber-300'
                  : log.level === 'ERROR'
                  ? 'text-rose-300'
                  : 'text-slate-300'
              }`}>
                {log.message}
              </p>

              {log.provider && (
                <span className="text-[10px] text-cyan-300/80 shrink-0">
                  [{log.provider}]
                </span>
              )}

              {typeof log.latencyMs === 'number' && (
                <span className="text-[10px] text-slate-400 shrink-0">
                  {log.latencyMs}ms
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
