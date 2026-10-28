import React, { useState } from 'react';
import { ShieldAlert, Send, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { verifyCustomClaim } from '../services/api';
import { VerificationLedgerItem } from '../types/pipeline';

interface ClaimVerifierToolProps {
  onClaimVerified: (item: VerificationLedgerItem) => void;
}

export const ClaimVerifierTool: React.FC<ClaimVerifierToolProps> = ({ onClaimVerified }) => {
  const [headline, setHeadline] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [publisher, setPublisher] = useState('');
  const [category, setCategory] = useState('Tech');
  const [isVerifying, setIsVerifying] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headline.trim()) return;

    setIsVerifying(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const verifiedItem = await verifyCustomClaim({
        headline: headline.trim(),
        url: sourceUrl.trim() || undefined,
        publisher: publisher.trim() || 'Analyst Custom Dispatch',
        category
      });

      onClaimVerified(verifiedItem);
      setSuccessMessage(`Verified & Ledgered: Status is ${verifiedItem.verificationStatus} (Corroboration Score: ${verifiedItem.corroborationScore}%)`);
      setHeadline('');
      setSourceUrl('');
      setPublisher('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Claim verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="bg-[#060c1d]/90 holo-border rounded-xl p-4 sm:p-5 box-glow">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-cyan-900/40">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-cyan-100 font-mono tracking-wider uppercase">
            Ad-Hoc Intelligence Claim Cross-Examiner
          </h3>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          Instant multi-source verification
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-mono text-slate-300 mb-1">
            Headline or News Claim to Verify:
          </label>
          <input
            type="text"
            required
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="e.g. Fusion reactor sustains net positive energy generation for 30 minutes in Switzerland"
            className="w-full bg-[#07132a] border border-cyan-900/60 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs text-cyan-50 placeholder:text-slate-500 focus:outline-none transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Source URL (Optional):
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-[#07132a] border border-cyan-900/60 focus:border-cyan-400 rounded-lg px-3 py-1.5 text-xs text-cyan-50 placeholder:text-slate-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Publisher / Wire (Optional):
            </label>
            <input
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="e.g. Swiss Tech Wire"
              className="w-full bg-[#07132a] border border-cyan-900/60 focus:border-cyan-400 rounded-lg px-3 py-1.5 text-xs text-cyan-50 placeholder:text-slate-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Intelligence Category:
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#07132a] border border-cyan-900/60 focus:border-cyan-400 rounded-lg px-3 py-1.5 text-xs text-cyan-50 focus:outline-none transition-colors font-mono"
            >
              <option value="Tech">Technology</option>
              <option value="Science">Science &amp; Energy</option>
              <option value="Business">Finance &amp; Markets</option>
              <option value="World">Geopolitics</option>
              <option value="Health">Health</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex-1 mr-4">
            {successMessage && (
              <p className="text-xs text-emerald-300 font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>{successMessage}</span>
              </p>
            )}
            {errorMessage && (
              <p className="text-xs text-rose-300 font-mono flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isVerifying || !headline.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 border border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.25)] disabled:opacity-50 transition-all cursor-pointer"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Cross-Checking Evidence...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Verify Claim</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
