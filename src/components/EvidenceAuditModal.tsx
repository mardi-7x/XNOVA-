import React, { useState } from 'react';
import { X, ExternalLink, ShieldCheck, Check, Copy, AlertTriangle, Layers, FileCode, CheckCircle2, XCircle } from 'lucide-react';
import { VerificationLedgerItem } from '../types/pipeline';

interface EvidenceAuditModalProps {
  item: VerificationLedgerItem | null;
  onClose: () => void;
}

export const EvidenceAuditModal: React.FC<EvidenceAuditModalProps> = ({ item, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'evidence' | 'nemotron' | 'trail' | 'json'>('evidence');

  if (!item) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(item, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div 
        className="relative w-full max-w-4xl bg-[#060c1d] border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(0,240,255,0.25)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic Header */}
        <div className="px-5 py-4 border-b border-cyan-900/50 bg-[#07132a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-cyan-100 font-mono tracking-wider uppercase">
                Audit Trail &amp; Source Provenance Inspector
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Item ID: <span className="text-cyan-300">{item.id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded bg-[#091834] hover:bg-cyan-950 text-cyan-200 border border-cyan-800 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-200 hover:bg-cyan-950 border border-transparent hover:border-cyan-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Article Summary Banner */}
        <div className="p-5 border-b border-cyan-900/30 bg-[#08152e]/50 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="text-cyan-300 font-semibold">{item.category}</span>
            <span aria-hidden="true">·</span>
            <span>{item.publisher}</span>
            <span aria-hidden="true">·</span>
            <span>{new Date(item.publishedAt).toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span className={item.isWithinRollingWindow ? 'text-emerald-400' : 'text-amber-400'}>
              {item.isWithinRollingWindow ? 'Within Rolling Window' : 'Outside 24h Window'}
            </span>
            {item.approximateCost !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-purple-300 font-mono">
                  Inference Cost: ${item.approximateCost.toFixed(6)}
                </span>
              </>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-bold text-cyan-50">
            {item.headline}
          </h2>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono pt-1">
            <a
              href={item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-200 underline decoration-cyan-400/50"
            >
              <span>Original Source URL</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <span className="text-slate-400">
              Evaluator: <span className="text-cyan-300 font-semibold">{item.processingProvider}</span>
            </span>

            <span className="text-slate-400">
              Corroboration Score: <span className="text-emerald-400 font-bold">{item.corroborationScore}%</span>
            </span>

            <span className="text-slate-400">
              Status: <span className="text-cyan-200 font-bold">{item.verificationStatus}</span>
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-cyan-900/40 flex items-center gap-2 bg-[#060d20]">
          <button
            onClick={() => setActiveTab('evidence')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-t border-b-2 transition-all cursor-pointer ${
              activeTab === 'evidence'
                ? 'border-cyan-400 text-cyan-200 bg-[#081838]'
                : 'border-transparent text-slate-400 hover:text-cyan-300'
            }`}
          >
            Evidence Corroboration ({item.evidenceList.length})
          </button>
          <button
            onClick={() => setActiveTab('nemotron')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-t border-b-2 transition-all cursor-pointer ${
              activeTab === 'nemotron'
                ? 'border-purple-400 text-purple-200 bg-[#160c28]'
                : 'border-transparent text-purple-400/70 hover:text-purple-300'
            }`}
          >
            Nemotron 3 Super Audit {item.nemotronVerification ? '⚡' : ''}
          </button>
          <button
            onClick={() => setActiveTab('trail')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-t border-b-2 transition-all cursor-pointer ${
              activeTab === 'trail'
                ? 'border-cyan-400 text-cyan-200 bg-[#081838]'
                : 'border-transparent text-slate-400 hover:text-cyan-300'
            }`}
          >
            Audit Trail ({item.rawAuditTrail.length})
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-t border-b-2 transition-all cursor-pointer ${
              activeTab === 'json'
                ? 'border-cyan-400 text-cyan-200 bg-[#081838]'
                : 'border-transparent text-slate-400 hover:text-cyan-300'
            }`}
          >
            Raw Ledger JSON
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'evidence' && (
            <div className="space-y-4">
              {/* Claims extracted */}
              {item.coreClaims.length > 0 && (
                <div className="p-3.5 rounded-lg bg-[#071328] border border-cyan-800/50">
                  <h4 className="text-xs font-mono font-bold text-cyan-300 uppercase mb-2">
                    Extracted Factual Claims Under Test
                  </h4>
                  <ul className="space-y-1 text-xs text-slate-200 list-disc list-inside">
                    {item.coreClaims.map((claim, idx) => (
                      <li key={idx} className="leading-relaxed">{claim}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Review Reasons */}
              {item.rejectionOrReviewReasons.length > 0 && (
                <div className="p-3.5 rounded-lg bg-[#181109] border border-amber-600/40">
                  <h4 className="text-xs font-mono font-bold text-amber-300 uppercase mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Auditor Findings &amp; Rejection/Review Criteria</span>
                  </h4>
                  <ul className="space-y-1 text-xs text-amber-100/90 list-disc list-inside">
                    {item.rejectionOrReviewReasons.map((reason, idx) => (
                      <li key={idx} className="leading-relaxed">{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Evidence Items */}
              <div>
                <h4 className="text-xs font-mono font-bold text-cyan-300 uppercase mb-2.5 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Cross-Referenced Evidence Outlets &amp; Provenance</span>
                </h4>

                {item.evidenceList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 rounded bg-[#071024]">
                    No external corroborating evidence found. Marked for analyst review.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {item.evidenceList.map((ev, idx) => (
                      <div
                        key={ev.id || idx}
                        className="p-3 rounded-lg bg-[#07142a] border border-cyan-900/60 hover:border-cyan-600/60 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="text-cyan-300 font-bold">{ev.domain}</span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span className={ev.isIndependent ? 'text-emerald-400' : 'text-amber-400'}>
                              {ev.isIndependent ? 'Independent Root Domain' : 'Same Origin / Circular'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[11px]">
                            {ev.stance === 'supports' ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Supports
                              </span>
                            ) : ev.stance === 'disputes' ? (
                              <span className="text-rose-400 flex items-center gap-1">
                                <XCircle className="w-3 h-3" /> Disputes
                              </span>
                            ) : (
                              <span className="text-slate-400">Neutral</span>
                            )}
                          </div>
                        </div>

                        <h5 className="text-xs font-semibold text-cyan-100 mb-1">
                          {ev.title}
                        </h5>

                        <p className="text-xs text-slate-300 leading-relaxed bg-[#050b18] p-2 rounded border border-cyan-950 mb-2">
                          &ldquo;{ev.snippet}&rdquo;
                        </p>

                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-cyan-400 hover:text-cyan-200 underline inline-flex items-center gap-1 break-all"
                        >
                          <span>{ev.url}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'nemotron' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#0e0a1f] border border-purple-500/40 font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-300 font-bold text-xs uppercase tracking-wider">
                      Engine: NVIDIA Nemotron 3 Super
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-200 border border-purple-800">
                      nvidia/nemotron-3-super-120b-a12b
                    </span>
                  </div>
                  {item.approximateCost !== undefined && (
                    <span className="text-xs text-purple-300">
                      Inference Cost: <span className="font-bold text-emerald-400">${item.approximateCost.toFixed(6)}</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-purple-200/90 leading-relaxed">
                  Dedicated independent claim-verification layer. Audits corroborated evidence without rubber-stamping extraction or fabricating sources.
                </p>
              </div>

              {item.nemotronVerification ? (
                <div className="space-y-3.5">
                  <div className="p-3.5 rounded-lg bg-[#071328] border border-cyan-800/60">
                    <h4 className="text-xs font-mono font-bold text-cyan-300 uppercase mb-1.5">
                      Auditor Evaluation &amp; Stance
                    </h4>
                    <div className="flex items-center gap-3 text-xs font-mono mb-2">
                      <span className="text-slate-400">Status:</span>
                      <span className="font-bold text-cyan-200 px-2 py-0.5 rounded bg-[#0b1d3d] border border-cyan-700">
                        {item.nemotronVerification.status}
                      </span>
                      <span className="text-slate-400">Score:</span>
                      <span className="font-bold text-emerald-400">
                        {item.nemotronVerification.corroborationScore ?? item.corroborationScore}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed bg-[#050e1e] p-2.5 rounded border border-cyan-950 font-sans">
                      {item.nemotronVerification.rationale}
                    </p>
                  </div>

                  {item.nemotronVerification.claimsChecked && item.nemotronVerification.claimsChecked.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-[#071328] border border-cyan-800/60 font-mono">
                      <h4 className="text-xs font-bold text-cyan-300 uppercase mb-2">
                        Factual Claims Audited ({item.nemotronVerification.claimsChecked.length})
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-200 list-disc list-inside">
                        {item.nemotronVerification.claimsChecked.map((claim, idx) => (
                          <li key={idx} className="leading-relaxed">{claim}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.nemotronVerification.supportingEvidence && item.nemotronVerification.supportingEvidence.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-[#061a1a] border border-emerald-500/40 font-mono">
                      <h4 className="text-xs font-bold text-emerald-300 uppercase mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Supporting Evidence Recognized</span>
                      </h4>
                      <ul className="space-y-1 text-xs text-emerald-100/90 list-disc list-inside">
                        {item.nemotronVerification.supportingEvidence.map((ev, idx) => (
                          <li key={idx} className="leading-relaxed">{ev}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.nemotronVerification.contradictingEvidence && item.nemotronVerification.contradictingEvidence.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-[#1e0a0f] border border-rose-500/40 font-mono">
                      <h4 className="text-xs font-bold text-rose-300 uppercase mb-2 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span>Contradictions &amp; Discrepancies</span>
                      </h4>
                      <ul className="space-y-1 text-xs text-rose-100/90 list-disc list-inside">
                        {item.nemotronVerification.contradictingEvidence.map((con, idx) => (
                          <li key={idx} className="leading-relaxed">{con}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.nemotronVerification.missingEvidence && (
                    <div className="p-3.5 rounded-lg bg-[#181109] border border-amber-500/40 font-mono">
                      <h4 className="text-xs font-bold text-amber-300 uppercase mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Missing Evidence &amp; Verification Gaps</span>
                      </h4>
                      {Array.isArray(item.nemotronVerification.missingEvidence) ? (
                        <ul className="space-y-1 text-xs text-amber-100/90 list-disc list-inside">
                          {item.nemotronVerification.missingEvidence.map((gap, idx) => (
                            <li key={idx} className="leading-relaxed">{gap}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-amber-100/90">
                          {item.nemotronVerification.missingEvidence}
                        </p>
                      )}
                    </div>
                  )}

                  {((item.nemotronVerification.sourceUrls && item.nemotronVerification.sourceUrls.length > 0) ||
                    (item.nemotronVerification.sourceUrlsSupplied && item.nemotronVerification.sourceUrlsSupplied.length > 0)) && (
                    <div className="p-3.5 rounded-lg bg-[#071328] border border-cyan-800/60 font-mono">
                      <h4 className="text-xs font-bold text-cyan-300 uppercase mb-2">
                        Audited Source URLs
                      </h4>
                      <div className="space-y-1">
                        {(item.nemotronVerification.sourceUrls || item.nemotronVerification.sourceUrlsSupplied || []).map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-cyan-400 hover:text-cyan-200 underline break-all"
                          >
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#081226] border border-cyan-900/60 font-mono text-xs text-slate-300">
                  <p>
                    Verification provider for this item: <span className="text-cyan-300 font-bold">{item.verificationProvider}</span>
                  </p>
                  <p className="mt-1 text-slate-400">
                    Deterministic evidence cross-checker evaluated {item.independentSourceCount} independent source(s) and assigned status <span className="text-cyan-200 font-bold">{item.verificationStatus}</span>.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'trail' && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-mono font-bold text-cyan-300 uppercase mb-3">
                Deterministic Processing Audit Log
              </h4>
              {item.rawAuditTrail.map((log, idx) => (
                <div key={idx} className="p-2.5 rounded bg-[#071328] border border-cyan-950 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-[10px]">
                      {log.step}
                    </span>
                    <span className="text-slate-200 text-[11px]">{log.detail}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'json' && (
            <div className="relative">
              <pre className="p-4 rounded-lg bg-[#040814] border border-cyan-900/60 font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed max-h-[400px]">
                {JSON.stringify(item, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-cyan-900/40 bg-[#060c1d] flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>XNOVA Verification Rule: AI confidence is not proof. Evidence requires traceable provenance.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-200 border border-cyan-700 transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
