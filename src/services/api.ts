import { ProviderHealth, PipelineRun, PipelineLog, VerificationLedgerItem } from '../types/pipeline';

async function safeFetch(url: string, options?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options?.signal || controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function fetchProviderConfig(): Promise<{ timestamp: string; providers: ProviderHealth[] } | null> {
  try {
    const resp = await safeFetch('/api/providers/config', undefined, 6000);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function fetchProviderHealth(force = false): Promise<{ timestamp: string; providers: ProviderHealth[] } | null> {
  try {
    const url = force ? '/api/providers/health?force=true' : '/api/providers/health';
    const resp = await safeFetch(url, undefined, 15000);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function fetchPipelineStatus(): Promise<{
  latestRun: PipelineRun;
  logs: PipelineLog[];
  systemTime: string;
} | null> {
  try {
    const resp = await safeFetch('/api/pipeline/status', undefined, 8000);
    if (!resp.ok) {
      return null;
    }
    return await resp.json();
  } catch {
    return null;
  }
}

export async function runPipeline(options: {
  rollingWindowHours: number;
  category?: string;
  customQuery?: string;
  dryRun?: boolean;
  batchSize?: number;
  concurrencyLimit?: number;
}): Promise<PipelineRun> {
  const resp = await safeFetch('/api/pipeline/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  }, 45000);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Pipeline execution failed: HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function fetchLedger(): Promise<{
  runId: string;
  timestamp: string;
  count: number;
  ledger: VerificationLedgerItem[];
} | null> {
  try {
    const resp = await safeFetch('/api/ledger', undefined, 8000);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function verifyCustomClaim(data: {
  headline: string;
  publisher?: string;
  url?: string;
  category?: string;
}): Promise<VerificationLedgerItem> {
  const resp = await safeFetch('/api/pipeline/verify-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }, 35000);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Claim verification failed: HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function synthesizeSovereignDossierApi(data: { rawInput?: string }): Promise<any> {
  const resp = await safeFetch('/api/dossier/sovereign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }, 30000);
  if (!resp.ok) return null;
  return resp.json();
}
