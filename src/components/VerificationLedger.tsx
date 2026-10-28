import React, { useState } from 'react';
import {
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  FileText,
  Globe,
  Layers,
  ArrowUpRight,
  Search,
  Ban,
  Link2
} from 'lucide-react';
import { VerificationLedgerItem, VerificationStatus } from '../types/pipeline';

interface VerificationLedgerProps {
  ledger: VerificationLedgerItem[];
  onInspectItem: (item: VerificationLedgerItem) => void;
}

export const VerificationLedger: React.FC<VerificationLedgerProps> = ({
  ledger,
  onInspectItem
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const getStatusBadge = (status: VerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>VERIFIED</span>
          </span>
        );
      case 'PARTIALLY_VERIFIED':
      case 'PARTIALLY_SUPPORTED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>PARTIALLY VERIFIED</span>
          </span>
        );
      case 'CONFLICTING':
      case 'DISPUTED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400">
            <XCircle className="w-3.5 h-3.5" />
            <span>DISPUTED / CONFLICTING</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-red-400">
            <Ban className="w-3.5 h-3.5" />
            <span>REJECTED</span>
          </span>
        );
      case 'NEEDS_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>NEEDS REVIEW</span>
          </span>
        );
      case 'UNVERIFIED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-400">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>UNVERIFIED</span>
          </span>
        );
    }
  };

  const matchesStatusFilter = (itemStatus: VerificationStatus, filter: string) => {
    if (filter === 'ALL') return true;
    if (filter === 'PARTIALLY_VERIFIED') {
      return itemStatus === 'PARTIALLY_VERIFIED' || itemStatus === 'PARTIALLY_SUPPORTED';
    }
    if (filter === 'CONFLICTING') {
      return itemStatus === 'CONFLICTING' || itemStatus === 'DISPUTED';
    }
    if (filter === 'UNVERIFIED') {
      return itemStatus === 'UNVERIFIED' || itemStatus === 'NEEDS_REVIEW';
    }
    return itemStatus === filter;
  };

  const filteredLedger = ledger.filter((item) => {
    if (!matchesStatusFilter(item.verificationStatus, statusFilter)) {
      return false;
    }
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      return (
        item.headline.toLowerCase().includes(q) ||
        item.publisher.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-[#060c1d]/90 holo-border rounded-xl p-4 sm:p-5 box-glow">
      {/* Ledger Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-cyan-900/40">
        <div>
          <h2 className="text-base font-bold text-cyan-100 flex items-center gap-2 font-['Plus_Jakarta_Sans']">
            <span>Global News Verification &amp; Source Link Ledger</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
              {filteredLedger.length} Records
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Parallel NewsAPI + Tavily ingestion with clickable primary source URLs and independent corroborating source links
          </p>
        </div>

        {/* Ledger Filter Tabs & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center bg-[#07132a] p-1 rounded-lg border border-cyan-900/60">
            {['ALL', 'VERIFIED', 'PARTIALLY_VERIFIED', 'CONFLICTING', 'UNVERIFIED', 'REJECTED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                    : 'text-slate-400 hover:text-cyan-200'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter ledger..."
              className="bg-[#07132a] border border-cyan-900/60 focus:border-cyan-400 rounded-lg pl-7 pr-2.5 py-1 text-xs text-cyan-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Ledger Records Table / Feed */}
      {filteredLedger.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-cyan-900/40 rounded-lg bg-[#071022]/40">
          <FileText className="w-8 h-8 text-cyan-500/40 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-medium">No ledger entries match current filter criteria.</p>
          <p className="text-xs text-slate-500 mt-1">Run a new collection cycle or clear the active filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLedger.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-lg border transition-all ${
                item.verificationStatus === 'VERIFIED'
                  ? 'bg-[#07142b]/80 border-cyan-500/30 hover:border-cyan-400/60'
                  : item.verificationStatus === 'CONFLICTING' ||
                    item.verificationStatus === 'DISPUTED' ||
                    item.verificationStatus === 'REJECTED'
                  ? 'bg-[#1a0c10]/80 border-rose-500/40 hover:border-rose-400/60'
                  : item.verificationStatus === 'UNVERIFIED' || item.verificationStatus === 'NEEDS_REVIEW'
                  ? 'bg-[#181207]/80 border-amber-500/30 hover:border-amber-400/60'
                  : 'bg-[#071022]/80 border-slate-800 hover:border-cyan-800'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                {/* Left: Article Details */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                    <span className="text-cyan-300 font-medium">{item.category}</span>
                    {item.isDualRelevant && item.secondaryCategory && (
                      <span className="text-amber-300/90 text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-500/40 font-sans font-medium">
                        Dual: {item.secondaryCategory}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-300">{item.publisher}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Pub:{' '}
                      {new Date(item.publishedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={item.isWithinRollingWindow ? 'text-emerald-400' : 'text-amber-400'}>
                      {item.isWithinRollingWindow ? 'Within Window' : 'Outside Window'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={item.published ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>
                      {item.published ? 'PUBLISHED' : 'HELD BY POLICY'}
                    </span>
                    {item.cachedHit && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-cyan-400">CACHE HIT</span>
                      </>
                    )}
                    {item.syndicatedDuplicateCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-400">
                          {item.syndicatedDuplicateCount} duplicate{item.syndicatedDuplicateCount > 1 ? 's' : ''} clustered
                        </span>
                      </>
                    )}
                  </div>

                  {/* Clickable Headline */}
                  <h3 className="text-sm sm:text-base font-semibold text-cyan-50 hover:text-cyan-300 transition-colors">
                    {item.originalUrl ? (
                      <a
                        href={item.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline inline-flex items-center gap-1.5"
                      >
                        <span>{item.headline}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      </a>
                    ) : (
                      item.headline
                    )}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                    {item.summary}
                  </p>

                  {/* Extracted Entities & Numbers */}
                  {((item.entities && item.entities.length > 0) ||
                    (item.importantNumbers && item.importantNumbers.length > 0)) && (
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 pt-0.5">
                      {item.entities && item.entities.length > 0 && (
                        <span>
                          Entities: <span className="text-cyan-200">{item.entities.slice(0, 4).join(', ')}</span>
                        </span>
                      )}
                      {item.importantNumbers && item.importantNumbers.length > 0 && (
                        <span>
                          Figures: <span className="text-emerald-300">{item.importantNumbers.slice(0, 4).join(', ')}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Rejection / Review Reasons */}
                  {item.rejectionOrReviewReasons.length > 0 && (
                    <div className="text-xs text-amber-300/90 font-mono pt-1">
                      <span className="text-slate-400">Verification Note:</span> {item.rejectionOrReviewReasons[0]}
                    </div>
                  )}

                  {/* Direct Clickable Source Links (Original + Corroborating Sources) */}
                  <div className="pt-2 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                      {item.originalUrl && (
                        <a
                          href={item.originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100 underline decoration-cyan-400/50 hover:decoration-cyan-200 transition-colors font-semibold"
                          title={item.originalUrl}
                        >
                          <Globe className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Primary Source: {item.publisherDomain}</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      )}

                      <span aria-hidden="true" className="text-slate-600">·</span>

                      <span className="text-slate-400 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{item.evidenceUrls.length} Corroborating Sources</span>
                        <span className="text-emerald-400">({item.independentSourceCount} Independent)</span>
                      </span>

                      <span aria-hidden="true" className="text-slate-600">·</span>

                      <span className="text-slate-400">
                        Engine: <span className="text-cyan-300">{item.processingProvider}</span>
                      </span>
                    </div>

                    {/* Inline Clickable Corroborating Source Links */}
                    {item.evidenceList && item.evidenceList.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Link2 className="w-3 h-3 text-cyan-400" />
                          <span>Verified Source Links:</span>
                        </span>
                        {item.evidenceList.map((ev, idx) => (
                          <a
                            key={ev.id || idx}
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                              ev.stance === 'disputes'
                                ? 'bg-rose-950/50 border-rose-500/40 text-rose-300 hover:border-rose-400'
                                : ev.isIndependent
                                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:border-emerald-400'
                                : 'bg-cyan-950/40 border-cyan-800/50 text-cyan-300 hover:border-cyan-400'
                            }`}
                            title={`${ev.title} (${ev.url})`}
                          >
                            <span>{ev.domain}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Status Badge & Inspect Action */}
                <div className="flex md:flex-col items-center md:items-end justify-between gap-2.5 pt-2 md:pt-0 border-t md:border-t-0 border-cyan-950">
                  {getStatusBadge(item.verificationStatus)}

                  <div className="text-xs font-mono text-slate-400">
                    Score: <span className="text-cyan-300 font-bold">{item.corroborationScore}%</span>
                  </div>

                  <button
                    onClick={() => onInspectItem(item)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-mono text-cyan-300 hover:text-cyan-100 bg-[#081734] hover:bg-cyan-900/60 border border-cyan-700/50 hover:border-cyan-400 transition-all cursor-pointer"
                  >
                    <span>Inspect Audit</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
