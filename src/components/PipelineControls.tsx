import React from 'react';
import { Play, Filter, Clock, Search, Loader2, FlaskConical } from 'lucide-react';

interface PipelineControlsProps {
  isRunning: boolean;
  rollingWindowHours: number;
  onWindowChange: (hours: number) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  customQuery: string;
  onQueryChange: (query: string) => void;
  dryRun?: boolean;
  onDryRunChange?: (dryRun: boolean) => void;
  onExecute: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All World News' },
  { id: 'world', label: 'World & Geopolitics' },
  { id: 'politics', label: 'Politics & Policy' },
  { id: 'business', label: 'Business & Economy' },
  { id: 'finance', label: 'Finance & Markets' },
  { id: 'technology', label: 'Technology' },
  { id: 'ai', label: 'AI & Machine Learning' },
  { id: 'science', label: 'Science' },
  { id: 'space', label: 'Space & Aerospace' },
  { id: 'semiconductors', label: 'Semiconductors' },
  { id: 'cybersecurity', label: 'Cybersecurity' },
  { id: 'health', label: 'Health & Medicine' },
  { id: 'environment', label: 'Climate & Environment' },
  { id: 'sports', label: 'Sports' },
  { id: 'entertainment', label: 'Culture & Entertainment' },
  { id: 'education', label: 'Education' }
];

const TIME_WINDOWS = [6, 12, 24, 48];

export const PipelineControls: React.FC<PipelineControlsProps> = ({
  isRunning,
  rollingWindowHours,
  onWindowChange,
  selectedCategory,
  onCategoryChange,
  customQuery,
  onQueryChange,
  dryRun = false,
  onDryRunChange,
  onExecute
}) => {
  return (
    <div className="bg-[#060c1d]/90 holo-border rounded-xl p-4 sm:p-5 box-glow">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Prominent COLLECT & VERIFY NOW Action Button + Dry-Run Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onExecute}
            disabled={isRunning}
            className={`relative group px-6 py-3.5 rounded-lg font-bold text-sm tracking-wider uppercase font-mono transition-all flex items-center justify-center gap-2.5 overflow-hidden ${
              isRunning
                ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-500/50 cursor-wait'
                : 'bg-gradient-to-r from-cyan-600 via-cyan-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 border border-cyan-300 shadow-[0_0_25px_rgba(0,240,255,0.4)] hover:shadow-[0_0_35px_rgba(0,240,255,0.6)] cursor-pointer'
            }`}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span>Collecting &amp; Verifying...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>{dryRun ? 'Run Diagnostic Dry-Run' : 'Collect & Verify Now'}</span>
              </>
            )}

            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
          </button>

          {onDryRunChange && (
            <button
              type="button"
              onClick={() => onDryRunChange(!dryRun)}
              disabled={isRunning}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                dryRun
                  ? 'bg-amber-950/70 text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                  : 'bg-[#07132a] text-slate-400 border-cyan-900/60 hover:text-cyan-200'
              }`}
              title="Diagnostic Dry-Run Mode runs Groq extraction and OpenRouter verification without publishing stories"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Dry-Run Mode: {dryRun ? 'ON' : 'OFF'}</span>
            </button>
          )}
        </div>

        {/* Middle: Rolling Window Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mr-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400" /> Rolling Window (UTC):
          </span>
          <div className="flex items-center bg-[#07132a] p-1 rounded-lg border border-cyan-900/60">
            {TIME_WINDOWS.map((hours) => (
              <button
                key={hours}
                onClick={() => onWindowChange(hours)}
                disabled={isRunning}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                  rollingWindowHours === hours
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_8px_rgba(0,240,255,0.4)]'
                    : 'text-slate-400 hover:text-cyan-200'
                }`}
              >
                {hours}h
              </button>
            ))}
          </div>
        </div>

        {/* Right: Custom Filter Search */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={customQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search global newspapers or claims..."
            disabled={isRunning}
            className="w-full bg-[#07132a] border border-cyan-900/60 focus:border-cyan-400 rounded-lg pl-8 pr-3 py-1.5 text-xs text-cyan-100 placeholder:text-slate-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Full Newspaper Category Filter Bar */}
      <div className="mt-3.5 pt-3 border-t border-cyan-900/40 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400 font-mono flex items-center gap-1 mr-1.5">
          <Filter className="w-3 h-3 text-cyan-400" /> Newspaper Beat:
        </span>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(cat.id)}
            disabled={isRunning}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-all cursor-pointer ${
              selectedCategory === cat.id
                ? 'bg-cyan-950 text-cyan-200 border border-cyan-400/50 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                : 'text-slate-400 hover:text-cyan-300 border border-transparent hover:border-cyan-900/50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
};
