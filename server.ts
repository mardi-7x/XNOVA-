import { synthesizeSovereignDossier } from './src/pipeline/sovereignDossierSynthesizer';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import {
  PipelineLog,
  PipelineRun,
  ProviderHealth,
  VerificationLedgerItem
} from './src/types/pipeline';
import {
  defaultDiscoverEvidence,
  defaultGeminiExtract,
  defaultGroqExtract,
  defaultOpenRouterVerify,
  deterministicExtractFallback,
  extractDomain,
  formatDurationSeconds,
  geminiQuotaTracker,
  getModelsConfig,
  isRealKey,
  maskApiKey,
  parseGeminiError,
  reconcileAndEnforcePolicy,
  redactSecrets,
  runDualEnginePipeline,
  sanitizeCanonicalUrl,
  validateStoryUrl
} from './src/pipeline/engine';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '5mb' }));

// CORS & Preflight headers for iframe / AI Studio host compatibility
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

let lastVerifiedProviders: ProviderHealth[] | null = null;
let activeLogs: PipelineLog[] = [];

const { GEMINI_MODEL, GROQ_MODEL, OPENROUTER_MODEL } = getModelsConfig();

let latestRun: PipelineRun = {
  id: 'init-000',
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  status: 'IDLE',
  dryRun: false,
  windowHours: 24,
  articlesCollected: 0,
  uniqueArticles: 0,
  duplicatesRemoved: 0,
  invalidUrlsRejected: 0,
  verifiedCount: 0,
  partiallyVerifiedCount: 0,
  partiallySupportedCount: 0,
  conflictingCount: 0,
  disputedCount: 0,
  needsReviewCount: 0,
  unverifiedCount: 0,
  rejectedCount: 0,
  publishedCount: 0,
  cacheHits: 0,
  activeProvider: `groq/${GROQ_MODEL} -> openrouter/${OPENROUTER_MODEL}`,
  extractionEngine: `groq/${GROQ_MODEL}`,
  verificationEngine: `openrouter/${OPENROUTER_MODEL}`,
  isLiveData: false,
  executionDurationMs: 0,
  ledger: []
};

function addLog(log: PipelineLog) {
  activeLogs.unshift({
    ...log,
    message: redactSecrets(log.message)
  });
  if (activeLogs.length > 250) {
    activeLogs = activeLogs.slice(0, 250);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, errMsg = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errMsg)), ms))
  ]);
}

// ---------------------------------------------------------------------------
// INITIAL UNTESTED PROVIDER CONFIGURATION SNAPSHOT
// ---------------------------------------------------------------------------
function getInitialProviderConfig(): ProviderHealth[] {
  const newsKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const models = getModelsConfig();

  return [
    {
      id: 'newsapi',
      name: 'NewsAPI',
      role: 'Global news & article metadata collection',
      status: isRealKey(newsKey) ? 'CONFIGURED' : 'NO_KEY',
      keyConfigured: isRealKey(newsKey),
      keyMasked: maskApiKey(newsKey),
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      errorMessage: isRealKey(newsKey)
        ? 'API key configured. Awaiting live connectivity check.'
        : 'NEWS_API_KEY is not set.'
    },
    {
      id: 'tavily',
      name: 'Tavily API',
      role: 'Independent corroborating evidence discovery',
      status: isRealKey(tavilyKey) ? 'CONFIGURED' : 'NO_KEY',
      keyConfigured: isRealKey(tavilyKey),
      keyMasked: maskApiKey(tavilyKey),
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      errorMessage: isRealKey(tavilyKey)
        ? 'API key configured. Awaiting live connectivity check.'
        : 'TAVILY_API_KEY is not set.'
    },
    {
      id: 'groq',
      name: 'Groq API',
      role: 'Primary fast-processing & claim extraction engine',
      status: isRealKey(groqKey) ? 'CONFIGURED' : 'NO_KEY',
      keyConfigured: isRealKey(groqKey),
      keyMasked: maskApiKey(groqKey),
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: models.GROQ_MODEL,
      errorMessage: isRealKey(groqKey)
        ? 'API key configured. Awaiting live connectivity check.'
        : 'GROQ_API_KEY is not set.'
    },
    {
      id: 'openrouter',
      name: 'OpenRouter API',
      role: 'NVIDIA Nemotron 3 Super independent verification engine',
      status: isRealKey(openRouterKey) ? 'CONFIGURED' : 'NO_KEY',
      keyConfigured: isRealKey(openRouterKey),
      keyMasked: maskApiKey(openRouterKey),
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: models.OPENROUTER_MODEL,
      errorMessage: isRealKey(openRouterKey)
        ? 'API key configured. Awaiting live connectivity check.'
        : 'OPENROUTER_API_KEY is not set.'
    },
    {
      id: 'gemini',
      name: 'Gemini API',
      role: 'Optional intelligence fallback engine',
      status: isRealKey(geminiKey) ? 'CONFIGURED' : 'NO_KEY',
      keyConfigured: isRealKey(geminiKey),
      keyMasked: maskApiKey(geminiKey),
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: models.GEMINI_MODEL,
      errorMessage: isRealKey(geminiKey)
        ? 'API key configured. Awaiting live connectivity check.'
        : 'GEMINI_API_KEY is not set.'
    }
  ];
}

// ---------------------------------------------------------------------------
// REAL API PROVIDER HEALTH TESTS
// ---------------------------------------------------------------------------
async function checkNewsApiHealth(): Promise<ProviderHealth> {
  const key = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  const start = Date.now();
  if (!isRealKey(key)) {
    return {
      id: 'newsapi',
      name: 'NewsAPI',
      role: 'Global news & article metadata collection',
      status: 'NO_KEY',
      keyConfigured: false,
      keyMasked: 'Not Configured',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      errorMessage: 'NEWS_API_KEY is not configured.'
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://newsapi.org/v2/top-headlines?country=us&pageSize=1', {
      headers: { 'X-Api-Key': key! },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (resp.ok) {
      return {
        id: 'newsapi',
        name: 'NewsAPI',
        role: 'Global news & article metadata collection',
        status: 'HEALTHY',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString()
      };
    }

    const errJson: any = await resp.json().catch(() => ({}));
    const msg = redactSecrets(errJson?.message || `HTTP ${resp.status} ${resp.statusText}`);

    if (resp.status === 401 || resp.status === 403 || errJson?.code === 'apiKeyInvalid') {
      return {
        id: 'newsapi',
        name: 'NewsAPI',
        role: 'Global news & article metadata collection',
        status: 'AUTH_ERROR',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        errorCode: 'HTTP_401_AUTH',
        errorMessage: `NewsAPI authentication failed: ${msg}`
      };
    }

    if (resp.status === 429 || errJson?.code === 'rateLimited') {
      return {
        id: 'newsapi',
        name: 'NewsAPI',
        role: 'Global news & article metadata collection',
        status: 'RATE_LIMITED',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        errorCode: 'HTTP_429_RATE_LIMITED',
        errorMessage: `NewsAPI rate limit reached: ${msg}`
      };
    }

    return {
      id: 'newsapi',
      name: 'NewsAPI',
      role: 'Global news & article metadata collection',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: latency,
      lastCheck: new Date().toISOString(),
      errorMessage: msg
    };
  } catch (err: any) {
    return {
      id: 'newsapi',
      name: 'NewsAPI',
      role: 'Global news & article metadata collection',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
      errorMessage: redactSecrets(err.message || 'Connection failed')
    };
  }
}

async function checkTavilyHealth(): Promise<ProviderHealth> {
  const key = process.env.TAVILY_API_KEY;
  const start = Date.now();
  if (!isRealKey(key)) {
    return {
      id: 'tavily',
      name: 'Tavily API',
      role: 'Independent corroborating evidence discovery',
      status: 'NO_KEY',
      keyConfigured: false,
      keyMasked: 'Not Configured',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      errorMessage: 'TAVILY_API_KEY is not configured.'
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: 'global technology news',
        max_results: 1
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (resp.ok) {
      return {
        id: 'tavily',
        name: 'Tavily API',
        role: 'Independent corroborating evidence discovery',
        status: 'HEALTHY',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString()
      };
    }

    const errText = redactSecrets(await resp.text());
    if (resp.status === 401 || resp.status === 403) {
      return {
        id: 'tavily',
        name: 'Tavily API',
        role: 'Independent corroborating evidence discovery',
        status: 'AUTH_ERROR',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        errorCode: `HTTP_${resp.status}`,
        errorMessage: `Tavily authentication error: ${errText.slice(0, 120)}`
      };
    }

    if (resp.status === 429 || resp.status === 432 || resp.status === 433) {
      return {
        id: 'tavily',
        name: 'Tavily API',
        role: 'Independent corroborating evidence discovery',
        status: 'RATE_LIMITED',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        errorCode: `HTTP_${resp.status}`,
        errorMessage: `Tavily rate/quota limit reached: ${errText.slice(0, 120)}`
      };
    }

    return {
      id: 'tavily',
      name: 'Tavily API',
      role: 'Independent corroborating evidence discovery',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: latency,
      lastCheck: new Date().toISOString(),
      errorMessage: `HTTP ${resp.status}: ${errText.slice(0, 100)}`
    };
  } catch (err: any) {
    return {
      id: 'tavily',
      name: 'Tavily API',
      role: 'Independent corroborating evidence discovery',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
      errorMessage: redactSecrets(err.message || 'Connection failed')
    };
  }
}

async function checkGeminiHealth(forceProbe = false): Promise<ProviderHealth> {
  const key = process.env.GEMINI_API_KEY;
  const { GEMINI_MODEL: model } = getModelsConfig();
  const start = Date.now();
  if (!isRealKey(key)) {
    return {
      id: 'gemini',
      name: 'Gemini API',
      role: 'Optional intelligence fallback engine',
      status: 'NO_KEY',
      keyConfigured: false,
      keyMasked: 'Not Configured',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorMessage: 'GEMINI_API_KEY is not configured.'
    };
  }

  if (
    !forceProbe &&
    geminiQuotaTracker.isExhausted &&
    geminiQuotaTracker.isDailyQuota &&
    Date.now() < geminiQuotaTracker.cooldownUntil
  ) {
    const remainingSec = Math.max(1, Math.round((geminiQuotaTracker.cooldownUntil - Date.now()) / 1000));
    return {
      id: 'gemini',
      name: 'Gemini API',
      role: 'Optional intelligence fallback engine',
      status: 'RATE_LIMITED',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: geminiQuotaTracker.lastLatencyMs,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorCode: 'HTTP_429_DAILY_QUOTA_EXHAUSTED',
      quotaResetHint: `Daily Free Tier quota exhausted • Resets in ~${formatDurationSeconds(remainingSec)}`,
      errorMessage: geminiQuotaTracker.errorMessage
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: key!,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const resp = await withTimeout(
      ai.models.generateContent({
        model,
        contents: 'Respond with: OK'
      }),
      6000,
      'Gemini health check timed out after 6s'
    );

    const latency = Date.now() - start;
    if (resp && resp.text) {
      geminiQuotaTracker.isExhausted = false;
      geminiQuotaTracker.isDailyQuota = false;
      geminiQuotaTracker.cooldownUntil = 0;
      return {
        id: 'gemini',
        name: 'Gemini API',
        role: 'Optional intelligence fallback engine',
        status: 'HEALTHY',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model
      };
    }

    return {
      id: 'gemini',
      name: 'Gemini API',
      role: 'Optional intelligence fallback engine',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: latency,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorMessage: 'Empty response returned from Gemini API'
    };
  } catch (err: any) {
    const latency = Date.now() - start;
    const parsed = parseGeminiError(err);

    // Only set quota tracker on actual HTTP 429 RATE_LIMITED, never on timeout!
    if (parsed.status === 'RATE_LIMITED' && !parsed.isTimeout) {
      geminiQuotaTracker.isExhausted = true;
      geminiQuotaTracker.isDailyQuota = parsed.isDailyQuota;
      geminiQuotaTracker.exhaustedAt = Date.now();
      geminiQuotaTracker.retryDelaySeconds = parsed.retryDelaySeconds;
      geminiQuotaTracker.cooldownUntil = Date.now() + parsed.retryDelaySeconds * 1000;
      geminiQuotaTracker.errorMessage = parsed.userMessage;
      geminiQuotaTracker.quotaResetHint = parsed.quotaResetHint;
      geminiQuotaTracker.lastLatencyMs = latency;
    }

    return {
      id: 'gemini',
      name: 'Gemini API',
      role: 'Optional intelligence fallback engine',
      status: parsed.status,
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: latency,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorCode: parsed.errorCode,
      quotaResetHint: parsed.quotaResetHint,
      errorMessage: parsed.userMessage
    };
  }
}

async function checkGroqHealth(): Promise<ProviderHealth> {
  const key = process.env.GROQ_API_KEY;
  const { GROQ_MODEL: model } = getModelsConfig();
  const start = Date.now();
  if (!isRealKey(key)) {
    return {
      id: 'groq',
      name: 'Groq API',
      role: 'Primary fast-processing & claim extraction engine',
      status: 'NO_KEY',
      keyConfigured: false,
      keyMasked: 'Not Configured',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorMessage: 'GROQ_API_KEY is not configured.'
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const reqBody: Record<string, any> = {
      model,
      messages: [{ role: 'user', content: 'Respond with OK' }],
      max_tokens: 80,
      temperature: 0
    };
    if (model.includes('gpt-oss')) {
      reqBody.reasoning_effort = 'low';
    }

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(reqBody),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (resp.ok) {
      return {
        id: 'groq',
        name: 'Groq API',
        role: 'Primary fast-processing & claim extraction engine',
        status: 'HEALTHY',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model
      };
    }

    const errJson: any = await resp.json().catch(() => ({}));
    const errMsg = redactSecrets(errJson?.error?.message || `HTTP ${resp.status} ${resp.statusText}`);
    const errCode = String(errJson?.error?.code || '');

    if (resp.status === 401 || resp.status === 403 || errCode === 'invalid_api_key') {
      return {
        id: 'groq',
        name: 'Groq API',
        role: 'Primary fast-processing & claim extraction engine',
        status: 'AUTH_ERROR',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model,
        errorCode: 'HTTP_401_AUTH_ERROR',
        errorMessage: `Groq authentication failed: ${errMsg}`
      };
    }

    if (resp.status === 429 || errCode === 'rate_limit_exceeded') {
      return {
        id: 'groq',
        name: 'Groq API',
        role: 'Primary fast-processing & claim extraction engine',
        status: 'RATE_LIMITED',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model,
        errorCode: 'HTTP_429_RATE_LIMITED',
        errorMessage: `Groq rate limit reached: ${errMsg.slice(0, 140)}`
      };
    }

    if (
      resp.status === 404 ||
      errCode === 'model_decommissioned' ||
      errCode === 'model_not_found' ||
      errMsg.toLowerCase().includes('decommissioned') ||
      errMsg.toLowerCase().includes('not found') ||
      errMsg.toLowerCase().includes('deprecated')
    ) {
      return {
        id: 'groq',
        name: 'Groq API',
        role: 'Primary fast-processing & claim extraction engine',
        status: 'MODEL_UNAVAILABLE',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model,
        errorCode: errCode || 'MODEL_UNAVAILABLE',
        errorMessage: `Groq model (${model}) unavailable: ${errMsg.slice(0, 140)}`
      };
    }

    return {
      id: 'groq',
      name: 'Groq API',
      role: 'Primary fast-processing & claim extraction engine',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: latency,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorMessage: `HTTP ${resp.status}: ${errMsg.slice(0, 120)}`
    };
  } catch (err: any) {
    return {
      id: 'groq',
      name: 'Groq API',
      role: 'Primary fast-processing & claim extraction engine',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorMessage: redactSecrets(err.message || 'Groq connection failed')
    };
  }
}

async function checkOpenRouterHealth(): Promise<ProviderHealth> {
  const key = process.env.OPENROUTER_API_KEY;
  const { OPENROUTER_MODEL: model } = getModelsConfig();
  const start = Date.now();
  if (!isRealKey(key)) {
    return {
      id: 'openrouter',
      name: 'OpenRouter API',
      role: 'NVIDIA Nemotron 3 Super independent verification engine',
      status: 'NO_KEY',
      keyConfigured: false,
      keyMasked: 'Not Configured',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorMessage: 'OPENROUTER_API_KEY is not configured.'
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Respond with OK' }],
        max_tokens: 150
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (resp.ok) {
      return {
        id: 'openrouter',
        name: 'OpenRouter API',
        role: 'NVIDIA Nemotron 3 Super independent verification engine',
        status: 'HEALTHY',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model
      };
    }

    const errJson: any = await resp.json().catch(() => ({}));
    const errMsg = redactSecrets(errJson?.error?.message || `HTTP ${resp.status}`);

    if (resp.status === 401 || resp.status === 403) {
      return {
        id: 'openrouter',
        name: 'OpenRouter API',
        role: 'NVIDIA Nemotron 3 Super independent verification engine',
        status: 'AUTH_ERROR',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model,
        errorCode: `HTTP_${resp.status}`,
        errorMessage: `OpenRouter authentication failed: ${errMsg}`
      };
    }

    if (resp.status === 429 || resp.status === 402) {
      return {
        id: 'openrouter',
        name: 'OpenRouter API',
        role: 'NVIDIA Nemotron 3 Super independent verification engine',
        status: 'RATE_LIMITED',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model,
        errorCode: `HTTP_${resp.status}`,
        errorMessage: `OpenRouter rate/credit limit: ${errMsg}`
      };
    }

    if (resp.status === 404) {
      return {
        id: 'openrouter',
        name: 'OpenRouter API',
        role: 'NVIDIA Nemotron 3 Super independent verification engine',
        status: 'MODEL_UNAVAILABLE',
        keyConfigured: true,
        keyMasked: maskApiKey(key),
        latencyMs: latency,
        lastCheck: new Date().toISOString(),
        modelUsed: model,
        errorCode: 'HTTP_404',
        errorMessage: `OpenRouter model (${model}) unavailable: ${errMsg}`
      };
    }

    return {
      id: 'openrouter',
      name: 'OpenRouter API',
      role: 'Independent Stage-2 source verification layer',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: latency,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorMessage: `HTTP ${resp.status}: ${errMsg}`
    };
  } catch (err: any) {
    return {
      id: 'openrouter',
      name: 'OpenRouter API',
      role: 'Independent Stage-2 source verification layer',
      status: 'OFFLINE',
      keyConfigured: true,
      keyMasked: maskApiKey(key),
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
      modelUsed: model,
      errorMessage: redactSecrets(err.message || 'OpenRouter connection failed')
    };
  }
}

// ---------------------------------------------------------------------------
// API ENDPOINTS
// ---------------------------------------------------------------------------

app.get('/api/providers/config', (_req: Request, res: Response) => {
  res.json({
    timestamp: new Date().toISOString(),
    providers: lastVerifiedProviders || getInitialProviderConfig()
  });
});

app.get('/api/providers/health', async (req: Request, res: Response) => {
  try {
    const forceProbe = req.query.force === 'true';
    const [newsapi, tavily, groq, openrouter, gemini] = await Promise.all([
      checkNewsApiHealth(),
      checkTavilyHealth(),
      checkGroqHealth(),
      checkOpenRouterHealth(),
      checkGeminiHealth(forceProbe)
    ]);

    lastVerifiedProviders = [newsapi, tavily, groq, openrouter, gemini];

    res.json({
      timestamp: new Date().toISOString(),
      providers: lastVerifiedProviders
    });
  } catch (err: any) {
    res.status(500).json({ error: redactSecrets(err.message || 'Failed to poll provider health') });
  }
});

app.get('/api/pipeline/status', (_req: Request, res: Response) => {
  res.json({
    latestRun,
    logs: activeLogs.slice(0, 60),
    systemTime: new Date().toISOString()
  });
});

app.post('/api/pipeline/run', async (req: Request, res: Response) => {
  try {
    const { rollingWindowHours, category, customQuery, dryRun, batchSize, concurrencyLimit } = req.body || {};
    latestRun.status = 'RUNNING';

    const run = await runDualEnginePipeline({
      rollingWindowHours: Number(rollingWindowHours) || 24,
      category: category || 'all',
      customQuery: customQuery || undefined,
      dryRun: Boolean(dryRun),
      batchSize: Number(batchSize) || 5,
      concurrencyLimit: Number(concurrencyLimit) || 2,
      onLog: addLog
    });

    if (!dryRun) {
      latestRun = run;
    } else {
      // In dry-run diagnostic mode, update diagnostics snapshot without publishing live news
      latestRun = {
        ...run,
        publishedCount: 0
      };
    }

    res.json(run);
  } catch (err: any) {
    latestRun.status = 'FAILED';
    const msg = redactSecrets(err.message || 'Pipeline execution failed');
    addLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      stage: 'SYNTHESIS',
      message: `Pipeline execution failed: ${msg}`
    });
    res.status(500).json({ error: msg });
  }
});

app.post('/api/dossier/sovereign', async (req: Request, res: Response) => {
  try {
    const { rawInput } = req.body || {};
    const report = await synthesizeSovereignDossier({
      rawInput: typeof rawInput === 'string' ? rawInput : undefined,
      ledger: latestRun.ledger,
      executiveDossier: latestRun.executiveDossier
    });
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: redactSecrets(err.message || 'Failed to synthesize sovereign dossier') });
  }
});

app.get('/api/ledger', (_req: Request, res: Response) => {
  res.json({
    runId: latestRun.id,
    timestamp: latestRun.completedAt || latestRun.startedAt,
    count: latestRun.ledger.length,
    ledger: latestRun.ledger
  });
});

app.post('/api/pipeline/verify-claim', async (req: Request, res: Response) => {
  try {
    const { headline, publisher, url, category } = req.body || {};
    if (!headline || typeof headline !== 'string') {
      res.status(400).json({ error: 'Headline or claim text is required' });
      return;
    }

    const candidateUrl = url && String(url).trim() ? String(url).trim() : 'https://xnova.intelligence/claim-submission';
    const urlCheck = validateStoryUrl(candidateUrl);
    const pubDomain = urlCheck.valid ? extractDomain(urlCheck.canonicalUrl) : 'analyst-submission.org';
    const retrievedAt = new Date().toISOString();

    const discovered = urlCheck.valid
      ? await defaultDiscoverEvidence(headline.trim(), pubDomain, urlCheck.canonicalUrl).catch(() => ({
          evidence: [],
          latencyMs: 0
        }))
      : { evidence: [], latencyMs: 0 };

    const evidenceList = discovered.evidence;
    const indepCount = evidenceList.filter((e) => e.isIndependent && !e.isSyndicatedCopy).length;

    const extractionInput = {
      headline: headline.trim(),
      publisher: publisher || 'Analyst Submission',
      publisherDomain: pubDomain,
      canonicalUrl: urlCheck.canonicalUrl || candidateUrl,
      publishedAt: retrievedAt,
      summary: headline.trim(),
      isWithinWindow: true,
      evidenceCount: indepCount
    };

    // Stage 1: Groq Primary Fast Extraction (with Gemini -> Deterministic fallback)
    let extraction = null;
    try {
      extraction = await defaultGroqExtract(extractionInput);
    } catch {
      try {
        extraction = await defaultGeminiExtract(extractionInput);
      } catch {
        extraction = deterministicExtractFallback(extractionInput);
      }
    }

    // Stage 2: OpenRouter Independent Verification Layer
    let verification = null;
    try {
      verification = await defaultOpenRouterVerify({
        headline: headline.trim(),
        publisher: publisher || 'Analyst Submission',
        publisherDomain: pubDomain,
        originalUrl: candidateUrl,
        publishedAt: retrievedAt,
        extraction,
        evidence: evidenceList,
        isWithinWindow: true
      });
    } catch {
      verification = null;
    }

    const reconciled = reconcileAndEnforcePolicy({
      headline: headline.trim(),
      publisher: publisher || 'Analyst Submission',
      publisherDomain: pubDomain,
      originalUrl: candidateUrl,
      canonicalUrl: urlCheck.canonicalUrl || candidateUrl,
      urlValid: urlCheck.valid,
      urlInvalidReason: urlCheck.reason,
      isWithinWindow: true,
      ageHours: 0,
      windowHours: 24,
      extraction,
      verification,
      evidence: evidenceList,
      minIndependentSources: 2,
      dryRun: false
    });

    const verProviderLabel = verification?.providerUsed || 'deterministic-evidence-verifier';
    const combinedProvider = `${extraction.providerUsed} -> ${verProviderLabel}`;

    const ledgerItem: VerificationLedgerItem = {
      id: `adhoc-${Date.now()}`,
      headline: headline.trim(),
      publisher: publisher || 'Direct Claim Submission',
      publisherDomain: pubDomain,
      originalUrl: candidateUrl,
      canonicalUrl: urlCheck.canonicalUrl || candidateUrl,
      publishedAt: retrievedAt,
      category: (category as any) || extraction.category || 'General',
      secondaryCategory: extraction.secondaryCategory,
      isDualRelevant: extraction.isDualRelevant,
      classificationMethod: extraction.classificationMethod,
      summary: extraction.summary || headline.trim(),
      coreClaims: extraction.coreClaims,
      entities: extraction.entities,
      importantNumbers: extraction.importantNumbers,
      flags: extraction.flags,
      evidenceUrls: evidenceList.map((e) => e.url),
      evidenceList,
      verificationStatus: reconciled.status,
      extractionProvider: extraction.providerUsed,
      verificationProvider: verProviderLabel,
      processingProvider: combinedProvider,
      rejectionOrReviewReasons: reconciled.reasons,
      discrepancyNotes: reconciled.discrepancyNotes,
      independentSourceCount: reconciled.independentSourceCount,
      corroborationScore: reconciled.corroborationScore,
      isWithinRollingWindow: true,
      syndicatedDuplicateCount: 0,
      published: reconciled.published,
      nemotronVerification: reconciled.nemotronVerification,
      approximateCost: reconciled.approximateCost,
      rawAuditTrail: [
        {
          timestamp: retrievedAt,
          step: 'AD_HOC_INGEST',
          detail: `Analyst submitted claim: "${headline.trim()}"`
        },
        {
          timestamp: new Date().toISOString(),
          step: 'GROQ_FAST_EXTRACTION',
          detail: `Extracted ${extraction.coreClaims.length} claims via ${extraction.providerUsed}`
        },
        {
          timestamp: new Date().toISOString(),
          step: 'OPENROUTER_VERIFICATION',
          detail: `Verified against ${evidenceList.length} sources (${reconciled.independentSourceCount} independent) via ${verProviderLabel} -> ${reconciled.status}`
        }
      ]
    };

    latestRun.ledger.unshift(ledgerItem);
    latestRun.articlesCollected++;
    latestRun.uniqueArticles++;
    latestRun.activeProvider = combinedProvider;

    res.json(ledgerItem);
  } catch (err: any) {
    res.status(500).json({ error: redactSecrets(err.message || 'Claim verification failed') });
  }
});

// ---------------------------------------------------------------------------
// VITE SPA INTEGRATION & SERVER BOOTSTRAP
// ---------------------------------------------------------------------------
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[XNOVA Dual-Engine Server] Running on http://0.0.0.0:${PORT}`);
  });
}

// Initial warm-up: check provider health & execute initial live dual-engine pipeline run
(async () => {
  try {
    const [newsapi, tavily, groq, openrouter, gemini] = await Promise.all([
      checkNewsApiHealth(),
      checkTavilyHealth(),
      checkGroqHealth(),
      checkOpenRouterHealth(),
      checkGeminiHealth(false)
    ]);
    lastVerifiedProviders = [newsapi, tavily, groq, openrouter, gemini];
    latestRun = await runDualEnginePipeline({
      rollingWindowHours: 24,
      batchSize: 4,
      concurrencyLimit: 2,
      onLog: addLog
    });
  } catch (err: any) {
    console.error('Initial pipeline warm-up note:', redactSecrets(err.message || String(err)));
  }
})();

startServer().catch((err) => {
  console.error('Failed to start XNOVA server:', redactSecrets(err.message || String(err)));
  process.exit(1);
});
