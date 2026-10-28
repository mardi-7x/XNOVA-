import React, { useState, useEffect, useCallback } from 'react';
import { HolographicBackground } from './components/HolographicBackground';
import { Header } from './components/Header';
import { ProviderHealthGrid } from './components/ProviderHealthGrid';
import { PipelineMetrics } from './components/PipelineMetrics';
import { PipelineControls } from './components/PipelineControls';
import { VerificationTrendChart } from './components/VerificationTrendChart';
import { VerificationLedger } from './components/VerificationLedger';
import { EvidenceAuditModal } from './components/EvidenceAuditModal';
import { ClaimVerifierTool } from './components/ClaimVerifierTool';
import { PipelineConsoleLogs } from './components/PipelineConsoleLogs';
import { SovereignDossierPanel } from './components/SovereignDossierPanel';
import { fetchProviderConfig, fetchProviderHealth, fetchPipelineStatus, runPipeline, synthesizeSovereignDossierApi } from './services/api';
import { ProviderHealth, PipelineRun, PipelineLog, VerificationLedgerItem } from './types/pipeline';
import { SovereignDossierReport } from './pipeline/sovereignDossierSynthesizer';
import { generateDossierPdf } from './utils/generateDossierPdf';

export default function App() {
  const [providers, setProviders] = useState<ProviderHealth[]>([
    {
      id: 'newsapi',
      name: 'NewsAPI',
      role: 'Global news & article metadata collection',
      status: 'CHECKING',
      keyConfigured: false,
      keyMasked: 'Checking...',
      latencyMs: 0,
      lastCheck: new Date().toISOString()
    },
    {
      id: 'tavily',
      name: 'Tavily API',
      role: 'Independent corroborating evidence discovery',
      status: 'CHECKING',
      keyConfigured: false,
      keyMasked: 'Checking...',
      latencyMs: 0,
      lastCheck: new Date().toISOString()
    },
    {
      id: 'groq',
      name: 'Groq API',
      role: 'Primary fast-processing & claim extraction engine',
      status: 'CHECKING',
      keyConfigured: false,
      keyMasked: 'Checking...',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: 'openai/gpt-oss-120b'
    },
    {
      id: 'openrouter',
      name: 'OpenRouter API',
      role: 'NVIDIA Nemotron 3 Super independent verification engine',
      status: 'CHECKING',
      keyConfigured: false,
      keyMasked: 'Checking...',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: 'nvidia/nemotron-3-super-120b-a12b'
    },
    {
      id: 'gemini',
      name: 'Gemini API',
      role: 'Optional intelligence fallback engine',
      status: 'CHECKING',
      keyConfigured: false,
      keyMasked: 'Checking...',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: 'gemini-3.8-flash'
    }
  ]);

  const [pipelineRun, setPipelineRun] = useState<PipelineRun>({
    id: 'init-000',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'HEALTHY',
    windowHours: 24,
    articlesCollected: 0,
    uniqueArticles: 0,
    duplicatesRemoved: 0,
    verifiedCount: 0,
    partiallySupportedCount: 0,
    disputedCount: 0,
    needsReviewCount: 0,
    unverifiedCount: 0,
    activeProvider: 'groq/openai/gpt-oss-120b -> openrouter/nvidia/nemotron-3-super-120b-a12b',
    isLiveData: false,
    executionDurationMs: 0,
    ledger: []
  });

  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [rollingWindowHours, setRollingWindowHours] = useState(24);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customQuery, setCustomQuery] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [inspectedItem, setInspectedItem] = useState<VerificationLedgerItem | null>(null);
  const [currentDossier, setCurrentDossier] = useState<SovereignDossierReport | null>(null);
  const [isDownloadingDossier, setIsDownloadingDossier] = useState(false);

  // Poll Provider Health via live API tests
  const loadProviderHealth = useCallback(async (force = false) => {
    setIsRefreshingHealth(true);
    try {
      const data = await fetchProviderHealth(force);
      if (data && data.providers) {
        setProviders(data.providers);
      }
    } catch {
      // Silently defer on transient network disconnects
    } finally {
      setIsRefreshingHealth(false);
    }
  }, []);

  // Poll Pipeline Status & Logs
  const loadPipelineStatus = useCallback(async () => {
    try {
      const data = await fetchPipelineStatus();
      if (data) {
        if (data.latestRun) {
          setPipelineRun(data.latestRun);
          if (data.latestRun.status === 'RUNNING') {
            setIsRunning(true);
          } else {
            setIsRunning(false);
          }
        }
        if (data.logs) {
          setLogs(data.logs);
        }
      }
    } catch {
      // Silently defer on transient network disconnects during startup or reload
    }
  }, []);

  useEffect(() => {
    fetchProviderConfig()
      .then((cfg) => {
        if (cfg && cfg.providers) {
          setProviders(cfg.providers);
        }
      })
      .catch(() => {})
      .finally(() => {
        loadProviderHealth(false);
      });

    loadPipelineStatus();

    const interval = setInterval(() => {
      loadPipelineStatus();
    }, 3500);

    return () => clearInterval(interval);
  }, [loadProviderHealth, loadPipelineStatus]);

  // Execute Pipeline Run
  const handleExecutePipeline = async () => {
    setIsRunning(true);
    try {
      const result = await runPipeline({
        rollingWindowHours,
        category: selectedCategory,
        customQuery: customQuery.trim() || undefined,
        dryRun
      });
      setPipelineRun(result);
      await loadPipelineStatus();
    } catch (err: any) {
      console.error('Execution error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // Export Auditable Ledger to JSON file
  const handleExportLedger = () => {
    const exportData = {
      exportTimestamp: new Date().toISOString(),
      runId: pipelineRun.id,
      systemRules: 'XNOVA Step 1 Dual-Engine Verification Doctrine v2.0',
      totalEntries: pipelineRun.ledger.length,
      metrics: {
        collected: pipelineRun.articlesCollected,
        unique: pipelineRun.uniqueArticles,
        duplicatesRemoved: pipelineRun.duplicatesRemoved,
        verified: pipelineRun.verifiedCount,
        partiallySupported: pipelineRun.partiallySupportedCount,
        disputed: pipelineRun.disputedCount,
        needsReview: pipelineRun.needsReviewCount
      },
      ledger: pipelineRun.ledger
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `xnova-verification-ledger-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle ad-hoc verified claim
  const handleClaimVerified = (newItem: VerificationLedgerItem) => {
    setPipelineRun((prev) => ({
      ...prev,
      articlesCollected: prev.articlesCollected + 1,
      uniqueArticles: prev.uniqueArticles + 1,
      ledger: [newItem, ...prev.ledger]
    }));
  };

  // Download 6-Pillar Sovereign Intelligence Dossier PDF
  const handleDownloadDossier = async () => {
    setIsDownloadingDossier(true);
    try {
      let reportToDownload = currentDossier;
      if (!reportToDownload) {
        reportToDownload = await synthesizeSovereignDossierApi({});
        if (reportToDownload) {
          setCurrentDossier(reportToDownload);
        }
      }
      if (reportToDownload) {
        await generateDossierPdf(reportToDownload);
      }
    } catch (err) {
      console.error('Failed to generate Dossier PDF:', err);
    } finally {
      setIsDownloadingDossier(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-100 relative">
      <HolographicBackground />

      {/* Futuristic Command Header */}
      <Header
        status={pipelineRun.status}
        isLiveData={pipelineRun.isLiveData}
        onRefreshHealth={() => loadProviderHealth(true)}
        onExportLedger={handleExportLedger}
        onDownloadDossier={handleDownloadDossier}
        isRefreshing={isRefreshingHealth}
        isDownloadingDossier={isDownloadingDossier}
      />

      {/* Main Command Center Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Row 1: Pipeline Execution Controls & Newspaper Category Beats */}
        <PipelineControls
          isRunning={isRunning}
          rollingWindowHours={rollingWindowHours}
          onWindowChange={setRollingWindowHours}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          customQuery={customQuery}
          onQueryChange={setCustomQuery}
          dryRun={dryRun}
          onDryRunChange={setDryRun}
          onExecute={handleExecutePipeline}
        />

        {/* Row 2: Sovereign Intelligence Dossier (100/100 Edition) 6-Pillar System */}
        <SovereignDossierPanel
          initialReport={currentDossier}
          onDossierChange={(rep) => setCurrentDossier(rep)}
          onDownloadPdf={handleDownloadDossier}
        />

        {/* Row 3: Tactical HUD Metrics & Stage-Specific Health Diagnostics */}
        <PipelineMetrics run={pipelineRun} />

        {/* Row 3: Recharts 7-Day Verified vs Disputed Frequency Visualization */}
        <VerificationTrendChart
          trendData={pipelineRun.sevenDayTrend}
          ledger={pipelineRun.ledger}
        />

        {/* Row 4: Provider Telemetry Matrix (All 5 Providers) */}
        <ProviderHealthGrid
          providers={providers}
          isLoading={isRefreshingHealth}
          onRefresh={() => loadProviderHealth(true)}
        />

        {/* Row 5: Source Verification & Evidence Ledger (with Clickable Source Links) */}
        <VerificationLedger
          ledger={pipelineRun.ledger}
          onInspectItem={(item) => setInspectedItem(item)}
        />

        {/* Row 6: Ad-Hoc Claim Verifier Tool & Telemetry Console */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ClaimVerifierTool onClaimVerified={handleClaimVerified} />
          <PipelineConsoleLogs logs={logs} onClearLogs={() => setLogs([])} />
        </div>
      </main>

      {/* Deep Evidence Audit & Provenance Modal */}
      <EvidenceAuditModal
        item={inspectedItem}
        onClose={() => setInspectedItem(null)}
      />
    </div>
  );
}
