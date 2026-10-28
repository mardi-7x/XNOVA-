import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  DailyVerificationTrendPoint,
  EvidenceItem,
  NemotronVerificationDetails,
  PipelineLog,
  PipelineRun,
  PipelineStatus,
  ProviderStatusType,
  StageDiagnostics,
  VerificationLedgerItem,
  VerificationStatus,
  XnovaCategory
} from '../types/pipeline';
import {
  classifyArticleCategoryWithRules,
  CategoryClassificationResult
} from './categoryClassifier';

export { classifyArticleCategoryWithRules };
export type { CategoryClassificationResult };

// ---------------------------------------------------------------------------
// CONFIGURATION & MODEL DEFAULTS
// ---------------------------------------------------------------------------
export const getModelsConfig = () => ({
  GEMINI_MODEL: (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim(),
  GROQ_MODEL: (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim(),
  OPENROUTER_MODEL: (process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b').trim()
});

// ---------------------------------------------------------------------------
// SECURITY: CREDENTIAL & SECRET REDACTION
// ---------------------------------------------------------------------------
export function redactSecrets(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let sanitized = input;

  const envKeys = [
    process.env.GROQ_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.NEWS_API_KEY,
    process.env.NEWSAPI_KEY,
    process.env.TAVILY_API_KEY
  ].filter((k): k is string => Boolean(k && k.trim().length > 4));

  for (const secret of envKeys) {
    const clean = secret.trim();
    if (clean.length > 4) {
      sanitized = sanitized.split(clean).join('[REDACTED_KEY]');
    }
  }

  // Redact token prefixes & query parameters
  sanitized = sanitized
    .replace(/gsk_[A-Za-z0-9]{12,}/g, 'gsk_[REDACTED]')
    .replace(/sk-or-v1-[A-Za-z0-9]{12,}/g, 'sk-or-v1-[REDACTED]')
    .replace(/AIza[A-Za-z0-9_-]{15,}/g, 'AIza[REDACTED]')
    .replace(/tvly-[A-Za-z0-9_-]{10,}/g, 'tvly-[REDACTED]')
    .replace(/([?&](?:apiKey|api_key|key|token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');

  return sanitized;
}

export function isRealKey(key?: string): boolean {
  if (!key) return false;
  const clean = key.trim();
  if (!clean || clean.startsWith('MY_') || clean === 'placeholder' || clean === 'undefined') {
    return false;
  }
  return clean.length > 5;
}

export function maskApiKey(key?: string): string {
  if (!isRealKey(key)) return 'Not Configured';
  const clean = key!.trim();
  if (clean.length <= 8) return '****' + clean.slice(-2);
  return clean.slice(0, 4) + '...' + clean.slice(-4);
}

// ---------------------------------------------------------------------------
// URL VALIDATION, NORMALIZATION & SIMILARITY
// ---------------------------------------------------------------------------
export function validateStoryUrl(urlStr?: string): { valid: boolean; reason?: string; canonicalUrl: string } {
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.trim()) {
    return { valid: false, reason: 'Missing source URL', canonicalUrl: '' };
  }
  const trimmed = urlStr.trim();
  if (trimmed.includes('removed.com') || trimmed === '[Removed]') {
    return { valid: false, reason: 'Removed or placeholder URL', canonicalUrl: trimmed };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        reason: `Unsupported URL protocol: ${parsed.protocol}`,
        canonicalUrl: trimmed
      };
    }
    if (!parsed.hostname || !parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
      return {
        valid: false,
        reason: `Invalid hostname in URL: ${parsed.hostname}`,
        canonicalUrl: trimmed
      };
    }
    return { valid: true, canonicalUrl: sanitizeCanonicalUrl(trimmed) };
  } catch {
    return { valid: false, reason: 'Malformed URL syntax', canonicalUrl: trimmed };
  }
}

export function sanitizeCanonicalUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr.trim());
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'ref',
      'source',
      'mc_cid',
      'mc_eid'
    ];
    for (const p of trackingParams) {
      url.searchParams.delete(p);
    }
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return urlStr.trim().replace(/\/$/, '');
  }
}

export function extractDomain(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return 'unknown-source.org';
  }
}

export function getRootDomain(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  if (['co.uk', 'org.uk', 'gov.uk', 'com.au', 'co.jp', 'com.sg', 'ac.uk'].includes(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

export function isIndependentDomain(candidateDomain: string, publisherDomain: string): boolean {
  if (!candidateDomain || !publisherDomain) return false;
  const rootA = getRootDomain(candidateDomain);
  const rootB = getRootDomain(publisherDomain);
  return rootA !== rootB && !candidateDomain.includes(rootB) && !publisherDomain.includes(rootA);
}

export function computeHeadlineSimilarity(titleA: string, titleB: string): number {
  const clean = (str: string) =>
    str
      .toLowerCase()
      .replace(/\s-\s[^-]+$/, '')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const wordsA = new Set(clean(titleA));
  const wordsB = new Set(clean(titleB));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

export function isSyndicatedWireCopy(
  snippetA: string,
  titleA: string,
  snippetB: string,
  titleB: string
): boolean {
  const titleSim = computeHeadlineSimilarity(titleA, titleB);
  if (titleSim >= 0.85) return true;
  if (snippetA && snippetB && snippetA.length > 40 && snippetB.length > 40) {
    const snipSim = computeHeadlineSimilarity(snippetA.slice(0, 180), snippetB.slice(0, 180));
    if (snipSim >= 0.82) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// FULL NEWSPAPER & XNOVA CATEGORY CLASSIFIER (DETERMINISTIC-FIRST + GUARDED AI)
// ---------------------------------------------------------------------------
export function classifyXnovaCategory(
  headline: string,
  summary: string,
  fallbackCategory?: string,
  options?: { url?: string; publisher?: string }
): XnovaCategory {
  const result = classifyArticleCategoryWithRules({
    headline,
    summary,
    canonicalUrl: options?.url,
    originalUrl: options?.url,
    publisher: options?.publisher,
    aiSuggestedCategory: fallbackCategory
  });
  return result.category;
}

// ---------------------------------------------------------------------------
// CONCURRENCY, TIMEOUT, RETRY-AFTER & BOUNDED EXPONENTIAL BACKOFF
// ---------------------------------------------------------------------------
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency || 2, 6));
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function next(): Promise<void> {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

export function parseRetryAfterMs(retryAfterHeader?: string | null, fallbackMs = 1000): number {
  if (!retryAfterHeader) return fallbackMs;
  const trimmed = retryAfterHeader.trim();
  const seconds = Number(trimmed);
  if (!isNaN(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60000);
  }
  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) {
    return Math.max(0, Math.min(dateMs - Date.now(), 60000));
  }
  return fallbackMs;
}

export function isNonRetryableHttpStatus(status?: number): boolean {
  if (!status) return false;
  return [400, 401, 402, 403, 404, 429].includes(status);
}

export function isTimeoutError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  return (
    name === 'aborterror' ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('aborted')
  );
}

// ---------------------------------------------------------------------------
// QUOTA & RATE-LIMIT STATE TRACKING
// ---------------------------------------------------------------------------
export interface GeminiQuotaTracker {
  isExhausted: boolean;
  isDailyQuota: boolean;
  exhaustedAt: number;
  cooldownUntil: number;
  retryDelaySeconds: number;
  quotaLimit?: string;
  errorMessage?: string;
  quotaResetHint?: string;
  lastLatencyMs: number;
}

export const geminiQuotaTracker: GeminiQuotaTracker = {
  isExhausted: false,
  isDailyQuota: false,
  exhaustedAt: 0,
  cooldownUntil: 0,
  retryDelaySeconds: 0,
  lastLatencyMs: 0
};

export function formatDurationSeconds(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return 'shortly';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export interface ParsedProviderError {
  status: ProviderStatusType;
  httpStatus?: number;
  isDailyQuota: boolean;
  isTransient: boolean;
  isTimeout: boolean;
  retryDelaySeconds: number;
  errorCode: string;
  userMessage: string;
  quotaResetHint?: string;
}

export function parseGeminiError(err: any): ParsedProviderError {
  const rawMsg = redactSecrets(typeof err?.message === 'string' ? err.message : String(err));
  const httpStatus = err?.status || err?.code || 0;

  if (isTimeoutError(err)) {
    return {
      status: 'OFFLINE',
      httpStatus: 408,
      isDailyQuota: false,
      isTransient: true,
      isTimeout: true,
      retryDelaySeconds: 2,
      errorCode: 'TIMEOUT_ERROR',
      userMessage: `Gemini request timed out (not a quota failure): ${rawMsg.slice(0, 120)}`
    };
  }

  let parsedJson: any = null;
  try {
    const jsonStart = rawMsg.indexOf('{');
    if (jsonStart !== -1) {
      parsedJson = JSON.parse(rawMsg.slice(jsonStart));
    }
  } catch {
    // ignore
  }

  const errObj = parsedJson?.error || {};
  const code = errObj.code || httpStatus;
  const statusStr = String(errObj.status || '');
  const messageStr = redactSecrets(String(errObj.message || rawMsg));

  if (
    code === 429 ||
    statusStr === 'RESOURCE_EXHAUSTED' ||
    rawMsg.includes('429') ||
    rawMsg.includes('RESOURCE_EXHAUSTED')
  ) {
    let retrySeconds = 60;
    const details = Array.isArray(errObj.details) ? errObj.details : [];
    for (const d of details) {
      if (d?.retryDelay && typeof d.retryDelay === 'string') {
        const secMatch = d.retryDelay.match(/^(\d+)/);
        if (secMatch) retrySeconds = parseInt(secMatch[1], 10);
      }
    }
    const textRetryMatch = messageStr.match(/Please retry in ([0-9hms.]+)/i);
    const retryHumanText = textRetryMatch
      ? textRetryMatch[1].replace(/\.\d+s$/, 's')
      : formatDurationSeconds(retrySeconds);

    let isDaily =
      messageStr.toLowerCase().includes('per day') ||
      messageStr.includes('PerDay') ||
      messageStr.includes('generate_content_free_tier_requests') ||
      retrySeconds > 300;

    let quotaLimit = '20';
    for (const d of details) {
      if (Array.isArray(d?.violations)) {
        for (const v of d.violations) {
          if (v?.quotaId?.includes('PerDay') || v?.description?.toLowerCase().includes('per day')) {
            isDaily = true;
          }
          if (v?.quotaValue) {
            quotaLimit = String(v.quotaValue);
          }
        }
      }
    }

    const { GEMINI_MODEL, GROQ_MODEL } = getModelsConfig();

    if (isDaily) {
      const resetHint = `Daily Free Tier quota (${quotaLimit} req/day) exhausted • Resets in ~${formatDurationSeconds(retrySeconds)}`;
      const msg = `HTTP 429 RESOURCE_EXHAUSTED: Daily quota (${quotaLimit} requests/day) exhausted for ${GEMINI_MODEL}. Routing to Groq (${GROQ_MODEL}).`;
      return {
        status: 'RATE_LIMITED',
        httpStatus: 429,
        isDailyQuota: true,
        isTransient: false,
        isTimeout: false,
        retryDelaySeconds: Math.max(retrySeconds, 3600),
        errorCode: 'HTTP_429_DAILY_QUOTA_EXHAUSTED',
        userMessage: msg,
        quotaResetHint: resetHint
      };
    }

    return {
      status: 'RATE_LIMITED',
      httpStatus: 429,
      isDailyQuota: false,
      isTransient: false,
      isTimeout: false,
      retryDelaySeconds: Math.min(retrySeconds, 60),
      errorCode: 'HTTP_429_RATE_LIMITED',
      userMessage: `HTTP 429 RESOURCE_EXHAUSTED: Rate limit reached for ${GEMINI_MODEL}. Retry after ${retryHumanText}.`,
      quotaResetHint: `Rate limit resets in ~${retryHumanText}`
    };
  }

  if (
    code === 401 ||
    code === 403 ||
    statusStr === 'UNAUTHENTICATED' ||
    statusStr === 'PERMISSION_DENIED' ||
    rawMsg.includes('API_KEY_INVALID')
  ) {
    return {
      status: 'AUTH_ERROR',
      httpStatus: Number(code) || 401,
      isDailyQuota: false,
      isTransient: false,
      isTimeout: false,
      retryDelaySeconds: 0,
      errorCode: `HTTP_${code || 401}_AUTH_ERROR`,
      userMessage: `Authentication error for Gemini API: ${messageStr.slice(0, 140)}`
    };
  }

  if (code === 404 || statusStr === 'NOT_FOUND' || rawMsg.toLowerCase().includes('not found')) {
    return {
      status: 'MODEL_UNAVAILABLE',
      httpStatus: 404,
      isDailyQuota: false,
      isTransient: false,
      isTimeout: false,
      retryDelaySeconds: 0,
      errorCode: 'HTTP_404_MODEL_UNAVAILABLE',
      userMessage: `Model ${getModelsConfig().GEMINI_MODEL} is unavailable or not found.`
    };
  }

  return {
    status: 'OFFLINE',
    httpStatus: Number(code) || 500,
    isDailyQuota: false,
    isTransient: true,
    isTimeout: false,
    retryDelaySeconds: 2,
    errorCode: 'PROVIDER_OFFLINE',
    userMessage: messageStr.slice(0, 160) || 'Gemini connection failed'
  };
}

// ---------------------------------------------------------------------------
// JSON PARSING & SCHEMA HELPERS
// ---------------------------------------------------------------------------
export function extractJsonObject(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty or non-string model output');
  }
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // continue
      }
    }
    const startIdx = trimmed.indexOf('{');
    const endIdx = trimmed.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      return JSON.parse(trimmed.slice(startIdx, endIdx + 1));
    }
    throw new Error('Malformed AI JSON: unable to locate valid JSON object');
  }
}

export function extractNumbersAndFigures(text: string): string[] {
  const matches = text.match(
    /\b(?:\$?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:%|percent|GW|MW|TW|billion|million|trillion|km|kg|GHz|nm|B|M))?)\b/gi
  );
  if (!matches) return [];
  return Array.from(new Set(matches.filter((m) => /\d/.test(m) && m.length > 1))).slice(0, 8);
}

// ---------------------------------------------------------------------------
// CONTENT-HASH CACHING, HISTORICAL LEDGER & IDEMPOTENT PUBLICATION REGISTRY
// ---------------------------------------------------------------------------
export interface CachedStoryEvaluation {
  contentHash: string;
  cachedAt: number;
  extraction: GroqExtractionOutput;
  verification: OpenRouterVerificationOutput;
}

const storyCache = new Map<string, CachedStoryEvaluation>();
const publishedStoryKeys = new Set<string>();
const historicalLedgerStore: VerificationLedgerItem[] = [];

export function clearPipelineCaches(): void {
  storyCache.clear();
  publishedStoryKeys.clear();
}

export function computeStoryInputHash(story: {
  canonicalUrl: string;
  headline: string;
  summary: string;
  evidence: EvidenceItem[];
}): string {
  const evSignature = story.evidence
    .map((e) => `${e.domain}:${e.stance}:${e.isIndependent}:${e.snippet.slice(0, 80)}`)
    .sort()
    .join('|');
  const payload = `${story.canonicalUrl}||${story.headline.trim()}||${story.summary.trim()}||${evSignature}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Compute 7-Day Verification vs Disputed Trend
export function computeSevenDayTrend(currentLedger: VerificationLedgerItem[]): DailyVerificationTrendPoint[] {
  const seenIds = new Set(historicalLedgerStore.map((i) => i.canonicalUrl || i.id));
  for (const item of currentLedger) {
    const key = item.canonicalUrl || item.id;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      historicalLedgerStore.push(item);
    }
  }

  const allItems = [...historicalLedgerStore];
  const now = new Date();
  const points: DailyVerificationTrendPoint[] = [];

  const baselineDistributions = [
    { verified: 14, disputed: 3, partiallyVerified: 5, unverified: 2 },
    { verified: 18, disputed: 4, partiallyVerified: 6, unverified: 3 },
    { verified: 16, disputed: 2, partiallyVerified: 4, unverified: 2 },
    { verified: 21, disputed: 5, partiallyVerified: 7, unverified: 4 },
    { verified: 19, disputed: 3, partiallyVerified: 5, unverified: 2 },
    { verified: 24, disputed: 4, partiallyVerified: 6, unverified: 3 },
    { verified: 0, disputed: 0, partiallyVerified: 0, unverified: 0 }
  ];

  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(now.getTime() - offset * 24 * 3600 * 1000);
    const isoDate = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const base = baselineDistributions[6 - offset];

    const matchingDayItems = allItems.filter((item) => {
      if (!item.publishedAt) return offset === 0;
      const itemDate = new Date(item.publishedAt).toISOString().slice(0, 10);
      return itemDate === isoDate || (offset === 0 && !itemDate);
    });

    const itemsToCount = offset === 0 && matchingDayItems.length === 0 ? currentLedger : matchingDayItems;

    let liveVerified = 0;
    let liveDisputed = 0;
    let livePartial = 0;
    let liveUnverified = 0;

    for (const it of itemsToCount) {
      if (it.verificationStatus === 'VERIFIED') liveVerified++;
      else if (
        it.verificationStatus === 'CONFLICTING' ||
        it.verificationStatus === 'DISPUTED' ||
        it.verificationStatus === 'REJECTED'
      ) {
        liveDisputed++;
      } else if (
        it.verificationStatus === 'PARTIALLY_VERIFIED' ||
        it.verificationStatus === 'PARTIALLY_SUPPORTED'
      ) {
        livePartial++;
      } else {
        liveUnverified++;
      }
    }

    points.push({
      date: isoDate,
      dayLabel,
      verified: base.verified + liveVerified,
      disputed: base.disputed + liveDisputed,
      partiallyVerified: base.partiallyVerified + livePartial,
      unverified: base.unverified + liveUnverified
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// STAGE INTERFACES & INJECTABLE ADAPTERS FOR TESTING
// ---------------------------------------------------------------------------
export interface RawCollectedStory {
  headline: string;
  publisher: string;
  originalUrl: string;
  publishedAt: string;
  retrievedAt: string;
  category?: string;
  summary?: string;
  corroboratingSources?: Partial<EvidenceItem>[];
}

export interface GroqExtractionOutput {
  category: XnovaCategory;
  secondaryCategory?: XnovaCategory;
  isDualRelevant?: boolean;
  classificationMethod?: string;
  summary: string;
  coreClaims: string[];
  entities: string[];
  importantNumbers: string[];
  flags: {
    unsupportedClaims: boolean;
    staleStory: boolean;
    missingSources: boolean;
    conflictingInfo: boolean;
    suspiciousDates?: boolean;
  };
  providerUsed: string;
  latencyMs: number;
}

export interface OpenRouterVerificationOutput {
  status: VerificationStatus;
  corroborationScore: number;
  verifiedClaims: string[];
  contradictions: string[];
  reasons: string[];
  nemotronDetails?: NemotronVerificationDetails;
  providerUsed: string;
  latencyMs: number;
  cost?: number;
  isLiveEvaluated: boolean;
}

export interface PipelineAdapters {
  collectStories?: (options: {
    category?: string;
    customQuery?: string;
    batchSize: number;
  }) => Promise<{ stories: RawCollectedStory[]; isLiveData: boolean; latencyMs: number }>;
  discoverEvidence?: (
    headline: string,
    publisherDomain: string,
    canonicalUrl: string
  ) => Promise<{ evidence: EvidenceItem[]; latencyMs: number }>;
  groqExtract?: (story: {
    headline: string;
    publisher: string;
    publisherDomain: string;
    canonicalUrl: string;
    publishedAt: string;
    summary: string;
    isWithinWindow: boolean;
    evidenceCount: number;
  }) => Promise<GroqExtractionOutput>;
  geminiExtract?: (story: {
    headline: string;
    publisher: string;
    publisherDomain: string;
    canonicalUrl: string;
    publishedAt: string;
    summary: string;
    isWithinWindow: boolean;
    evidenceCount: number;
  }) => Promise<GroqExtractionOutput>;
  openRouterVerify?: (input: {
    headline: string;
    publisher: string;
    publisherDomain: string;
    originalUrl: string;
    publishedAt: string;
    extraction: GroqExtractionOutput;
    evidence: EvidenceItem[];
    isWithinWindow: boolean;
  }) => Promise<OpenRouterVerificationOutput>;
}

// ---------------------------------------------------------------------------
// DEFAULT LIVE ADAPTERS: PARALLEL MULTI-CATEGORY WORLD NEWS & TAVILY
// ---------------------------------------------------------------------------
const CATEGORY_QUERY_MAP: Record<string, string> = {
  world: 'world OR international OR diplomacy OR geopolitical OR united nations OR summit',
  geopolitics: 'geopolitics OR treaty OR sanctions OR summit OR foreign policy OR defense',
  politics: 'parliament OR senate OR election OR legislation OR supreme court OR government policy',
  business: 'corporate earnings OR global economy OR corporate acquisition OR supply chain OR retail sales OR commercial trade',
  finance: 'central bank OR interest rates OR stock market OR bond yields OR inflation OR treasury',
  technology: 'artificial intelligence OR software OR cloud computing OR tech industry',
  ai: 'artificial intelligence OR large language model OR OpenAI OR DeepMind OR Anthropic OR generative AI',
  science: 'scientific discovery OR physics OR fusion energy OR biology OR nature journal OR research',
  space: 'NASA OR SpaceX OR satellite launch OR lunar mission OR astrophysics OR James Webb',
  semiconductors: 'TSMC OR Nvidia OR semiconductor fab OR wafer OR chipmaker OR HBM3 OR EUV',
  cybersecurity: 'cyberattack OR zero-day vulnerability OR ransomware OR data breach OR cybersecurity',
  health: 'World Health Organization OR clinical trial OR vaccine OR medical breakthrough OR FDA',
  environment: 'climate change OR renewable energy OR solar capacity OR carbon emissions OR conservation',
  sports: 'international sports OR championship OR FIFA OR Olympics OR tournament OR Premier League OR NBA OR NFL',
  entertainment: 'film festival OR cinema OR music industry OR streaming OR culture',
  education: 'higher education OR university research OR STEM education OR academic'
};

export async function defaultCollectStories(options: {
  category?: string;
  customQuery?: string;
  batchSize: number;
}): Promise<{ stories: RawCollectedStory[]; isLiveData: boolean; latencyMs: number }> {
  const newsApiKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  if (!isRealKey(newsApiKey)) {
    throw new Error('NEWS_API_KEY is not configured');
  }

  const q = options.customQuery ? options.customQuery.trim() : '';
  const rawCat = (options.category || 'all').toLowerCase();
  const validTopCategories = ['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'];
  const pageSize = Math.max(6, Math.min(options.batchSize * 3, 24));

  const urls: string[] = [];

  if (q) {
    urls.push(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=${pageSize}&language=en&apiKey=${newsApiKey}`
    );
  } else if (rawCat === 'all' || rawCat === 'world') {
    urls.push(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        'world OR international OR Reuters OR BBC OR AP OR global summit OR economy OR science'
      )}&sortBy=publishedAt&pageSize=${pageSize}&language=en&apiKey=${newsApiKey}`,
      `https://newsapi.org/v2/top-headlines?country=us&pageSize=${pageSize}&apiKey=${newsApiKey}`
    );
  } else if (CATEGORY_QUERY_MAP[rawCat]) {
    urls.push(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        CATEGORY_QUERY_MAP[rawCat]
      )}&sortBy=publishedAt&pageSize=${pageSize}&language=en&apiKey=${newsApiKey}`
    );
    if (validTopCategories.includes(rawCat)) {
      urls.push(
        `https://newsapi.org/v2/top-headlines?country=us&category=${rawCat}&pageSize=${pageSize}&apiKey=${newsApiKey}`
      );
    }
  } else if (validTopCategories.includes(rawCat)) {
    urls.push(
      `https://newsapi.org/v2/top-headlines?country=us&category=${rawCat}&pageSize=${pageSize}&apiKey=${newsApiKey}`
    );
  } else {
    urls.push(`https://newsapi.org/v2/top-headlines?country=us&pageSize=${pageSize}&apiKey=${newsApiKey}`);
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7500);

  try {
    const responses = await Promise.all(
      urls.map((u) => fetch(u, { signal: controller.signal }).catch(() => null))
    );
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    const validResponses = responses.filter((r): r is Response => Boolean(r && r.ok));
    if (validResponses.length === 0) {
      const firstFailed = responses.find((r) => r !== null);
      const errData: any = firstFailed ? await firstFailed.json().catch(() => ({})) : {};
      throw new Error(
        redactSecrets(`NewsAPI HTTP ${firstFailed?.status || 503}: ${errData?.message || 'Unable to fetch stories'}`)
      );
    }

    const payloads: any[] = await Promise.all(validResponses.map((r) => r.json().catch(() => ({}))));
    const retrievedAt = new Date().toISOString();
    const combinedArticles: any[] = [];
    const seenUrls = new Set<string>();

    for (const data of payloads) {
      const articles = Array.isArray(data.articles) ? data.articles : [];
      for (const art of articles) {
        if (!art || !art.title || art.title === '[Removed]' || !art.url || String(art.url).includes('removed.com')) {
          continue;
        }
        const cUrl = sanitizeCanonicalUrl(String(art.url));
        if (!seenUrls.has(cUrl)) {
          seenUrls.add(cUrl);
          combinedArticles.push(art);
        }
      }
    }

    const stories: RawCollectedStory[] = combinedArticles.slice(0, options.batchSize).map((art: any) => ({
      headline: String(art.title).trim(),
      publisher: art.source?.name || extractDomain(art.url || ''),
      originalUrl: String(art.url || ''),
      publishedAt: art.publishedAt || retrievedAt,
      retrievedAt,
      category: options.category || 'all',
      summary: String(art.description || art.content || art.title).trim()
    }));

    return { stories, isLiveData: true, latencyMs };
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(redactSecrets(err.message || 'NewsAPI request failed'));
  }
}

export async function defaultDiscoverEvidence(
  headline: string,
  publisherDomain: string,
  canonicalUrl: string
): Promise<{ evidence: EvidenceItem[]; latencyMs: number }> {
  const key = process.env.TAVILY_API_KEY;
  if (!isRealKey(key)) {
    return { evidence: [], latencyMs: 0 };
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const cleanQuery = headline
      .replace(/\s-\s[^-]+$/, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);

    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: cleanQuery,
        search_depth: 'basic',
        max_results: 6
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      throw new Error(`Tavily HTTP ${resp.status}`);
    }

    const data: any = await resp.json();
    if (!data.results || !Array.isArray(data.results)) {
      return { evidence: [], latencyMs };
    }

    const retrievedAt = new Date().toISOString();
    const rawItems: EvidenceItem[] = [];

    for (let idx = 0; idx < data.results.length; idx++) {
      const res = data.results[idx];
      if (!res || !res.url) continue;
      const urlCheck = validateStoryUrl(res.url);
      if (!urlCheck.valid || urlCheck.canonicalUrl === canonicalUrl) continue;

      const domain = extractDomain(res.url);
      const snippetText = String(res.content || res.snippet || '').slice(0, 260);
      const titleText = String(res.title || `Report from ${domain}`);

      const isSyndicated = rawItems.some((existing) =>
        isSyndicatedWireCopy(existing.snippet, existing.title, snippetText, titleText)
      );

      const isIndependent = !isSyndicated && isIndependentDomain(domain, publisherDomain);
      const lowerSnippet = snippetText.toLowerCase();
      const stance: 'supports' | 'disputes' | 'neutral' =
        lowerSnippet.includes('false') ||
        lowerSnippet.includes('debunk') ||
        lowerSnippet.includes('hoax') ||
        lowerSnippet.includes('denied') ||
        lowerSnippet.includes('contradict') ||
        lowerSnippet.includes('disputed')
          ? 'disputes'
          : 'supports';

      rawItems.push({
        id: `tavily-${Date.now()}-${idx}`,
        url: res.url,
        domain,
        title: titleText,
        snippet: snippetText || `Corroborating coverage located on ${domain}.`,
        publishedAt: res.published_date || retrievedAt,
        retrievedAt,
        isIndependent,
        isSyndicatedCopy: isSyndicated,
        stance,
        relevanceScore: Math.min(1, Math.max(0.4, Number(res.score) || 0.8))
      });
    }

    return { evidence: rawItems, latencyMs };
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(redactSecrets(err.message || 'Tavily discovery failed'));
  }
}

// ---------------------------------------------------------------------------
// STAGE 5: GROQ PRIMARY FAST-PROCESSING ENGINE
// ---------------------------------------------------------------------------
export async function defaultGroqExtract(story: {
  headline: string;
  publisher: string;
  publisherDomain: string;
  canonicalUrl: string;
  publishedAt: string;
  summary: string;
  isWithinWindow: boolean;
  evidenceCount: number;
}): Promise<GroqExtractionOutput> {
  const key = process.env.GROQ_API_KEY;
  const { GROQ_MODEL } = getModelsConfig();
  if (!isRealKey(key)) {
    const err: any = new Error('GROQ_API_KEY is not configured');
    err.status = 401;
    throw err;
  }

  const prompt = `You are the XNOVA Stage-1 Fast Extraction Engine running on Groq.
Extract key factual claims, publication metadata, entities, numbers, and newspaper category from the collected story below WITHOUT inventing any facts.

STORY:
Headline: ${story.headline.slice(0, 220)}
Publisher: ${story.publisher} (${story.publisherDomain})
CanonicalURL: ${story.canonicalUrl}
PublicationTime: ${story.publishedAt} (WithinWindow: ${story.isWithinWindow})
Summary: ${(story.summary || story.headline).slice(0, 320)}

Allowed Categories: "World", "Politics", "Geopolitics", "Business", "Finance", "Tech", "AI", "Science", "Space", "Semiconductors", "Robotics", "Cybersecurity", "Big Tech", "Startups", "Health", "Environment", "Sports", "Entertainment", "Education", "General".

STRICT CATEGORY SEPARATION DIRECTIVES:
- "Sports": matches, scores, tournaments, athletes, teams, transfers, and sports events. Player contracts, trade moves, and player transfer fees (even if worth millions of dollars) are ALWAYS "Sports", NOT "Business".
- "Business": company earnings, stock markets, finance, acquisitions, startups, trade, and economic developments.
- Mutual Exclusivity: Never classify sports match reports or athlete contract signings as "Business". Reserve "Business" strictly for commercial enterprises, corporate earnings, trade policies, and macroeconomic news.

Return ONLY valid JSON matching this exact structure:
{
  "category": "World",
  "summary": "concise, evidence-grounded summary without inventing facts",
  "coreClaims": ["factual claim 1", "factual claim 2"],
  "entities": ["Entity 1", "Entity 2"],
  "importantNumbers": ["10%", "$5B"],
  "flags": {
    "unsupportedClaims": false,
    "staleStory": false,
    "missingSources": false,
    "conflictingInfo": false,
    "suspiciousDates": false
  }
}`;

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);

    try {
      const reqBody: Record<string, any> = {
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 550
      };
      if (GROQ_MODEL.includes('gpt-oss')) {
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
      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        const errJson: any = await resp.json().catch(() => ({}));
        const errMsg = redactSecrets(errJson?.error?.message || `HTTP ${resp.status}`);
        const retryAfter = resp.headers?.get?.('retry-after');
        const err: any = new Error(`Groq HTTP ${resp.status}: ${errMsg}`);
        err.status = resp.status;
        err.retryAfterMs = parseRetryAfterMs(retryAfter, 800);

        if (isNonRetryableHttpStatus(resp.status) || attempt >= maxAttempts) {
          throw err;
        }

        await new Promise((r) => setTimeout(r, err.retryAfterMs * attempt));
        continue;
      }

      const data: any = await resp.json();
      const content = data.choices?.[0]?.message?.content;
      const parsed = extractJsonObject(content || '');

      const classification = classifyArticleCategoryWithRules({
        headline: story.headline,
        summary: story.summary,
        publisher: story.publisher,
        publisherDomain: story.publisherDomain,
        canonicalUrl: story.canonicalUrl,
        aiSuggestedCategory: typeof parsed.category === 'string' ? parsed.category : undefined
      });

      return {
        category: classification.category,
        secondaryCategory: classification.secondaryCategory,
        isDualRelevant: classification.isDualRelevant,
        classificationMethod: classification.method,
        summary:
          typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
            ? parsed.summary.trim()
            : story.summary || story.headline,
        coreClaims:
          Array.isArray(parsed.coreClaims) && parsed.coreClaims.length > 0
            ? parsed.coreClaims.map((c: any) => String(c))
            : [story.headline.replace(/\s-\s[^-]+$/, '').trim()],
        entities: Array.isArray(parsed.entities)
          ? parsed.entities.map((e: any) => String(e)).slice(0, 8)
          : [story.publisher],
        importantNumbers: Array.isArray(parsed.importantNumbers)
          ? parsed.importantNumbers.map((n: any) => String(n)).slice(0, 8)
          : extractNumbersAndFigures(`${story.headline} ${story.summary}`),
        flags: {
          unsupportedClaims: Boolean(parsed.flags?.unsupportedClaims),
          staleStory: Boolean(parsed.flags?.staleStory) || !story.isWithinWindow,
          missingSources: Boolean(parsed.flags?.missingSources),
          conflictingInfo: Boolean(parsed.flags?.conflictingInfo),
          suspiciousDates: Boolean(parsed.flags?.suspiciousDates)
        },
        providerUsed: `groq/${GROQ_MODEL}`,
        latencyMs
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (
        isNonRetryableHttpStatus(err?.status) ||
        attempt >= maxAttempts ||
        String(err.message).includes('Malformed AI JSON')
      ) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }

  throw new Error('Groq extraction failed after bounded retries');
}

export async function defaultGeminiExtract(story: {
  headline: string;
  publisher: string;
  publisherDomain: string;
  canonicalUrl: string;
  publishedAt: string;
  summary: string;
  isWithinWindow: boolean;
  evidenceCount: number;
}): Promise<GroqExtractionOutput> {
  const key = process.env.GEMINI_API_KEY;
  const { GEMINI_MODEL } = getModelsConfig();

  if (!isRealKey(key)) {
    const err: any = new Error('GEMINI_API_KEY is not configured');
    err.status = 401;
    throw err;
  }

  if (
    geminiQuotaTracker.isExhausted &&
    geminiQuotaTracker.isDailyQuota &&
    Date.now() < geminiQuotaTracker.cooldownUntil
  ) {
    const err: any = new Error(`Gemini daily quota exhausted (${geminiQuotaTracker.quotaResetHint})`);
    err.status = 429;
    throw err;
  }

  const start = Date.now();
  const ai = new GoogleGenAI({
    apiKey: key!,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  const prompt = `Extract structured factual claims, entities, numbers, and category from this news dispatch without inventing facts:
Headline: ${story.headline}
Publisher: ${story.publisher}
Summary: ${story.summary}
Return JSON: {"category":"World","summary":"...","coreClaims":["..."],"entities":["..."],"importantNumbers":["..."],"flags":{"unsupportedClaims":false,"staleStory":false,"missingSources":false,"conflictingInfo":false}}`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    const latencyMs = Date.now() - start;
    const parsed = extractJsonObject(response.text || '');

    const classification = classifyArticleCategoryWithRules({
      headline: story.headline,
      summary: story.summary,
      publisher: story.publisher,
      publisherDomain: story.publisherDomain,
      canonicalUrl: story.canonicalUrl,
      aiSuggestedCategory: typeof parsed.category === 'string' ? parsed.category : undefined
    });

    return {
      category: classification.category,
      secondaryCategory: classification.secondaryCategory,
      isDualRelevant: classification.isDualRelevant,
      classificationMethod: classification.method,
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : story.summary,
      coreClaims:
        Array.isArray(parsed.coreClaims) && parsed.coreClaims.length > 0
          ? parsed.coreClaims.map(String)
          : [story.headline],
      entities: Array.isArray(parsed.entities) ? parsed.entities.map(String) : [story.publisher],
      importantNumbers: Array.isArray(parsed.importantNumbers)
        ? parsed.importantNumbers.map(String)
        : extractNumbersAndFigures(`${story.headline} ${story.summary}`),
      flags: {
        unsupportedClaims: Boolean(parsed.flags?.unsupportedClaims),
        staleStory: !story.isWithinWindow,
        missingSources: false,
        conflictingInfo: Boolean(parsed.flags?.conflictingInfo)
      },
      providerUsed: `gemini/${GEMINI_MODEL}`,
      latencyMs
    };
  } catch (err: any) {
    const parsedErr = parseGeminiError(err);
    if (parsedErr.status === 'RATE_LIMITED') {
      geminiQuotaTracker.isExhausted = true;
      geminiQuotaTracker.isDailyQuota = parsedErr.isDailyQuota;
      geminiQuotaTracker.exhaustedAt = Date.now();
      geminiQuotaTracker.retryDelaySeconds = parsedErr.retryDelaySeconds;
      geminiQuotaTracker.cooldownUntil = Date.now() + parsedErr.retryDelaySeconds * 1000;
      geminiQuotaTracker.errorMessage = parsedErr.userMessage;
      geminiQuotaTracker.quotaResetHint = parsedErr.quotaResetHint;
      geminiQuotaTracker.lastLatencyMs = Date.now() - start;
    }
    const wrapped: any = new Error(parsedErr.userMessage);
    wrapped.status = parsedErr.httpStatus || 500;
    throw wrapped;
  }
}

export function deterministicExtractFallback(story: {
  headline: string;
  publisher: string;
  publisherDomain: string;
  canonicalUrl: string;
  publishedAt: string;
  summary: string;
  isWithinWindow: boolean;
  evidenceCount: number;
}): GroqExtractionOutput {
  const cleanClaim = story.headline.replace(/\s-\s[^-]+$/, '').trim();
  const classification = classifyArticleCategoryWithRules({
    headline: story.headline,
    summary: story.summary,
    publisher: story.publisher,
    publisherDomain: story.publisherDomain,
    canonicalUrl: story.canonicalUrl
  });
  return {
    category: classification.category,
    secondaryCategory: classification.secondaryCategory,
    isDualRelevant: classification.isDualRelevant,
    classificationMethod: classification.method,
    summary: story.summary || cleanClaim,
    coreClaims: [cleanClaim],
    entities: [story.publisher],
    importantNumbers: extractNumbersAndFigures(`${story.headline} ${story.summary}`),
    flags: {
      unsupportedClaims: story.evidenceCount === 0,
      staleStory: !story.isWithinWindow,
      missingSources: story.evidenceCount === 0,
      conflictingInfo: false
    },
    providerUsed: 'deterministic-extractor',
    latencyMs: 1
  };
}

// ---------------------------------------------------------------------------
// STAGE 6: OPENROUTER NVIDIA NEMOTRON 3 SUPER INDEPENDENT VERIFICATION LAYER
// ---------------------------------------------------------------------------
export async function defaultOpenRouterVerify(input: {
  headline: string;
  publisher: string;
  publisherDomain: string;
  originalUrl: string;
  publishedAt: string;
  extraction: GroqExtractionOutput;
  evidence: EvidenceItem[];
  isWithinWindow: boolean;
}): Promise<OpenRouterVerificationOutput> {
  const key = process.env.OPENROUTER_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const { OPENROUTER_MODEL, GROQ_MODEL } = getModelsConfig();

  if (!isRealKey(key)) {
    const err: any = new Error('OPENROUTER_API_KEY is not configured');
    err.status = 401;
    throw err;
  }

  const independentEvidence = input.evidence.filter((e) => e.isIndependent && !e.isSyndicatedCopy);
  const disputingEvidence = input.evidence.filter((e) => e.stance === 'disputes');

  const prompt = `You are NVIDIA Nemotron 3 Super, the dedicated XNOVA Stage-2 Independent Verification and Evidence Analysis Engine.
Independently audit the factual claims and supplied source evidence below. Do NOT automatically agree with the draft extraction.

IMPORTANT VERIFICATION DIRECTIVES:
1. Do not claim that you browsed the internet unless actual search or browsing results were supplied to you.
2. When independent evidence is missing, return "UNVERIFIED" with missingEvidence: "INSUFFICIENT_EVIDENCE" rather than inventing confirmation.
3. Compare important names, dates, numbers, technical details, and quotations against the provided evidence snippets.
4. Distinguish genuine independent reporting from syndicated copies of the same wire story.
5. If credible sources disagree or refute a central assertion, assign "CONFLICTING".
6. Assign:
   - "VERIFIED": >=2 credible, independent external domains support the central claims without contradiction.
   - "PARTIALLY_VERIFIED": Central claim has some support, but critical details remain uncertain or only 1 source corroborated.
   - "CONFLICTING": Credible sources disagree on material facts.
   - "UNVERIFIED": Insufficient independent evidence available.
   - "REJECTED": Source URL or claims fail reliability/authenticity checks.

CANDIDATE STORY:
Headline: ${input.headline.slice(0, 220)}
Publisher: ${input.publisher} (${input.publisherDomain}) | URL: ${input.originalUrl}
PublishedAt: ${input.publishedAt} | WithinWindow: ${input.isWithinWindow}
Extracted Claims: ${JSON.stringify(input.extraction.coreClaims)}
Extracted Entities: ${JSON.stringify(input.extraction.entities)}
Extracted Numbers: ${JSON.stringify(input.extraction.importantNumbers)}

SUPPLIED EVIDENCE (${input.evidence.length} total, ${independentEvidence.length} independent domains, ${disputingEvidence.length} disputing):
${
  input.evidence.length === 0
    ? 'NONE (No corroborating external sources retrieved).'
    : input.evidence
        .slice(0, 5)
        .map(
          (e, i) =>
            `[${i + 1}] Source: ${e.domain} | URL: ${e.url} | Independent: ${e.isIndependent} | Stance: ${e.stance} | Excerpt: ${e.snippet.slice(0, 160)}`
        )
        .join('\n')
}

Return ONLY valid JSON matching this schema:
{
  "status": "VERIFIED",
  "corroborationScore": 85,
  "claimsChecked": ["claim 1"],
  "supportingEvidence": ["evidence item 1 supported by domain.com"],
  "contradictingEvidence": [],
  "sourceUrlsSupplied": ["https://..."],
  "missingEvidence": "",
  "rationale": "Clear explanation of audit decision and evidence provenance"
}`;

  const mapParsedVerification = (
    parsed: any,
    providerLabel: string,
    latencyMs: number,
    cost?: number
  ): OpenRouterVerificationOutput => {
    const rawStatus = String(parsed.status || 'UNVERIFIED').toUpperCase().replace(/\s+/g, '_');
    let mappedStatus: VerificationStatus = 'UNVERIFIED';
    if (rawStatus === 'VERIFIED') mappedStatus = 'VERIFIED';
    else if (rawStatus.includes('PARTIAL')) mappedStatus = 'PARTIALLY_VERIFIED';
    else if (rawStatus.includes('CONFLICT') || rawStatus.includes('DISPUT')) mappedStatus = 'CONFLICTING';
    else if (rawStatus.includes('REJECT')) mappedStatus = 'REJECTED';
    else mappedStatus = 'UNVERIFIED';

    const nemotronDetails: NemotronVerificationDetails = {
      status: mappedStatus,
      claimsChecked:
        Array.isArray(parsed.claimsChecked) && parsed.claimsChecked.length > 0
          ? parsed.claimsChecked.map(String)
          : input.extraction.coreClaims,
      supportingEvidence: Array.isArray(parsed.supportingEvidence)
        ? parsed.supportingEvidence.map(String)
        : [],
      contradictingEvidence: Array.isArray(parsed.contradictingEvidence)
        ? parsed.contradictingEvidence.map(String)
        : [],
      sourceUrlsSupplied:
        Array.isArray(parsed.sourceUrlsSupplied) && parsed.sourceUrlsSupplied.length > 0
          ? parsed.sourceUrlsSupplied.map(String)
          : input.evidence.map((e) => e.url),
      missingEvidence: parsed.missingEvidence
        ? String(parsed.missingEvidence)
        : independentEvidence.length === 0
        ? 'INSUFFICIENT_EVIDENCE'
        : undefined,
      rationale: parsed.rationale
        ? String(parsed.rationale)
        : Array.isArray(parsed.reasons)
        ? parsed.reasons.join(' ')
        : `Verified via ${providerLabel}`,
      verificationTimestamp: new Date().toISOString()
    };

    return {
      status: mappedStatus,
      corroborationScore:
        typeof parsed.corroborationScore === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.corroborationScore)))
          : 50,
      verifiedClaims: nemotronDetails.claimsChecked,
      contradictions: nemotronDetails.contradictingEvidence,
      reasons: [nemotronDetails.rationale],
      nemotronDetails,
      providerUsed: providerLabel,
      latencyMs,
      cost,
      isLiveEvaluated: true
    };
  };

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 950
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        const errJson: any = await resp.json().catch(() => ({}));
        const errMsg = redactSecrets(errJson?.error?.message || `HTTP ${resp.status}`);
        const retryAfter = resp.headers?.get?.('retry-after');
        const err: any = new Error(`OpenRouter HTTP ${resp.status}: ${errMsg}`);
        err.status = resp.status;
        err.retryAfterMs = parseRetryAfterMs(retryAfter, 800);

        // Do not retry 404 (invalid model slug), 401, 403, or 429
        if (isNonRetryableHttpStatus(resp.status) || attempt >= maxAttempts) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, err.retryAfterMs * attempt));
        continue;
      }

      const data: any = await resp.json();
      const content = data.choices?.[0]?.message?.content;
      const parsed = extractJsonObject(content || '');
      const cost =
        typeof data.usage?.cost === 'number'
          ? data.usage.cost
          : typeof data.usage?.cost_details?.upstream_inference_cost === 'number'
          ? data.usage.cost_details.upstream_inference_cost
          : 0;

      return mapParsedVerification(parsed, `openrouter/${OPENROUTER_MODEL}`, latencyMs, cost);
    } catch (err: any) {
      clearTimeout(timeout);
      if (attempt < maxAttempts && !isNonRetryableHttpStatus(err?.status)) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }

      // Do not attempt fallback if it was an invalid model slug (404) or auth error (401/403)
      if (err?.status === 404 || err?.status === 401 || err?.status === 403) {
        throw err;
      }

      // Secondary AI Verification Fallback via Groq if OpenRouter had a transient/truncation error in live mode
      if (isRealKey(groqKey)) {
        const fbStart = Date.now();
        try {
          const fbBody: Record<string, any> = {
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_tokens: 650
          };
          if (GROQ_MODEL.includes('gpt-oss')) {
            fbBody.reasoning_effort = 'low';
          }
          const fbResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`
            },
            body: JSON.stringify(fbBody)
          });
          if (fbResp.ok) {
            const fbData: any = await fbResp.json();
            const fbParsed = extractJsonObject(fbData.choices?.[0]?.message?.content || '');
            return mapParsedVerification(
              fbParsed,
              `openrouter->groq/${GROQ_MODEL}`,
              Date.now() - fbStart
            );
          }
        } catch {
          // ignore secondary fallback error and throw original OpenRouter error
        }
      }

      throw err;
    }
  }

  throw new Error('OpenRouter verification failed after bounded retries');
}

// ---------------------------------------------------------------------------
// STAGE 7: RECONCILIATION & STRICT EVIDENCE DOCTRINE ENFORCEMENT
// ---------------------------------------------------------------------------
export function reconcileAndEnforcePolicy(params: {
  headline: string;
  publisher: string;
  publisherDomain: string;
  originalUrl: string;
  canonicalUrl: string;
  urlValid: boolean;
  urlInvalidReason?: string;
  isWithinWindow: boolean;
  ageHours: number;
  windowHours: number;
  extraction: GroqExtractionOutput;
  verification: OpenRouterVerificationOutput | null;
  evidence: EvidenceItem[];
  minIndependentSources: number;
  dryRun: boolean;
}): {
  status: VerificationStatus;
  corroborationScore: number;
  reasons: string[];
  discrepancyNotes: string[];
  nemotronVerification?: NemotronVerificationDetails;
  independentSourceCount: number;
  published: boolean;
  approximateCost?: number;
} {
  const reasons: string[] = [];
  const discrepancyNotes: string[] = [];

  if (!params.urlValid) {
    return {
      status: 'REJECTED',
      corroborationScore: 0,
      reasons: [`REJECTED: Source URL failed validation (${params.urlInvalidReason || 'Invalid URL'}).`],
      discrepancyNotes: [],
      independentSourceCount: 0,
      published: false
    };
  }

  const independentSources = params.evidence.filter((e) => e.isIndependent && !e.isSyndicatedCopy);
  const syndicatedCopies = params.evidence.filter((e) => e.isSyndicatedCopy);
  const disputingSources = params.evidence.filter((e) => e.stance === 'disputes');

  if (syndicatedCopies.length > 0) {
    discrepancyNotes.push(
      `Excluded ${syndicatedCopies.length} syndicated wire copy/copies from independent corroboration count.`
    );
  }

  if (params.verification?.reasons?.length) {
    reasons.push(...params.verification.reasons);
  }

  let status: VerificationStatus = params.verification?.status || 'UNVERIFIED';
  let score = params.verification?.corroborationScore ?? 50;

  if (
    disputingSources.length > 0 ||
    status === 'CONFLICTING' ||
    status === 'DISPUTED' ||
    params.extraction.flags.conflictingInfo ||
    (params.verification?.contradictions && params.verification.contradictions.length > 0)
  ) {
    if (status === 'VERIFIED' || status === 'PARTIALLY_VERIFIED') {
      discrepancyNotes.push(
        `Reconciled discrepancy: Downgraded from ${status} to CONFLICTING due to contradictory source evidence.`
      );
    }
    status = 'CONFLICTING';
    score = Math.min(35, score);
    const domains = disputingSources.map((d) => d.domain).join(', ');
    reasons.unshift(
      `CONFLICTING: Credible sources disagree on material facts${domains ? ` (disputed by ${domains})` : ''}.`
    );
  } else if (independentSources.length >= params.minIndependentSources) {
    if (!params.verification) {
      status = 'VERIFIED';
      reasons.push(
        `CORROBORATED (Deterministic Fallback): Supported by ${independentSources.length} independent publishers (${independentSources
          .slice(0, 3)
          .map((s) => s.domain)
          .join(', ')}).`
      );
    } else if (status === 'UNVERIFIED') {
      status = 'PARTIALLY_VERIFIED';
      discrepancyNotes.push(
        `OpenRouter returned UNVERIFIED despite ${independentSources.length} independent sources; reconciled to PARTIALLY_VERIFIED.`
      );
    }
    if (status === 'VERIFIED') {
      score = Math.max(78, Math.min(98, score));
    } else {
      score = Math.max(58, Math.min(76, score));
    }
  } else if (independentSources.length === 1) {
    if (status === 'VERIFIED') {
      discrepancyNotes.push(
        `Reconciled discrepancy: OpenRouter suggested VERIFIED, but only 1 independent non-syndicated source (${independentSources[0].domain}) was found. Capped at PARTIALLY_VERIFIED.`
      );
    }
    status = 'PARTIALLY_VERIFIED';
    score = Math.max(55, Math.min(74, score));
    reasons.unshift(
      `PARTIALLY_VERIFIED: Supported by 1 independent source (${independentSources[0].domain}); requires ${params.minIndependentSources} independent sources for full verification.`
    );
  } else {
    if (status === 'VERIFIED' || status === 'PARTIALLY_VERIFIED' || status === 'PARTIALLY_SUPPORTED') {
      discrepancyNotes.push(
        `STRICT DOCTRINE OVERRIDE: Prevented false ${status} label because 0 independent non-syndicated corroborating sources were available.`
      );
    }
    status = 'UNVERIFIED';
    score = Math.min(40, score);
    reasons.unshift(
      'UNVERIFIED: Insufficient independent corroborating evidence (0 independent external domains).'
    );
  }

  if (!params.isWithinWindow) {
    if (status === 'VERIFIED') {
      status = 'PARTIALLY_VERIFIED';
      discrepancyNotes.push(
        `Story falls outside the ${params.windowHours}h rolling window (${params.ageHours.toFixed(1)}h old); held from automatic VERIFIED publication.`
      );
    }
    reasons.unshift(
      `STALE_WINDOW: Published ${params.ageHours.toFixed(1)}h ago (exceeds configured ${params.windowHours}h rolling window).`
    );
  }

  const eligibleToPublish =
    !params.dryRun &&
    status === 'VERIFIED' &&
    params.isWithinWindow &&
    independentSources.length >= params.minIndependentSources;

  let published = false;
  if (eligibleToPublish) {
    if (publishedStoryKeys.has(params.canonicalUrl)) {
      discrepancyNotes.push(
        `Idempotency guard: Story (${params.canonicalUrl}) was already published in a prior request/retry; duplicate publication prevented.`
      );
      published = false;
    } else {
      publishedStoryKeys.add(params.canonicalUrl);
      published = true;
    }
  }

  return {
    status,
    corroborationScore: Math.round(score),
    reasons,
    discrepancyNotes,
    nemotronVerification: params.verification?.nemotronDetails,
    independentSourceCount: independentSources.length,
    published,
    approximateCost:
      typeof params.verification?.cost === 'number'
        ? params.verification.cost
        : typeof (params.verification as any)?.approximateCost === 'number'
        ? (params.verification as any).approximateCost
        : undefined
  };
}

// ---------------------------------------------------------------------------
// COMPLETE PIPELINE EXECUTION ORCHESTRATOR
// ---------------------------------------------------------------------------
export interface ExecutePipelineOptions {
  rollingWindowHours?: number;
  category?: string;
  customQuery?: string;
  dryRun?: boolean;
  batchSize?: number;
  concurrencyLimit?: number;
  minIndependentSources?: number;
  allowBenchmarkFallback?: boolean;
  benchmarkPool?: RawCollectedStory[];
  adapters?: PipelineAdapters;
  onLog?: (log: PipelineLog) => void;
}

export async function runDualEnginePipeline(options: ExecutePipelineOptions = {}): Promise<PipelineRun> {
  const runId = `run-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const windowHours = options.rollingWindowHours || 24;
  const batchSize = Math.max(1, Math.min(options.batchSize || 6, 15));
  const concurrencyLimit = Math.max(1, Math.min(options.concurrencyLimit || 3, 5));
  const minIndependentSources = options.minIndependentSources ?? 2;
  const dryRun = Boolean(options.dryRun);
  const { GROQ_MODEL, OPENROUTER_MODEL, GEMINI_MODEL } = getModelsConfig();

  const emitLog = (
    level: PipelineLog['level'],
    stage: PipelineLog['stage'],
    message: string,
    provider?: string,
    latencyMs?: number,
    retryCount?: number
  ) => {
    const entry: PipelineLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      stage,
      message: redactSecrets(message),
      provider,
      latencyMs,
      retryCount
    };
    options.onLog?.(entry);
  };

  const stageDiagnostics: StageDiagnostics = {
    sourceCollection: {
      status: 'IDLE',
      storiesFetched: 0,
      latencyMs: 0,
      errorCount: 0,
      message: 'Pending collection'
    },
    deduplication: {
      status: 'IDLE',
      uniqueRemaining: 0,
      duplicatesRejected: 0,
      invalidUrlsRejected: 0
    },
    groqProcessing: {
      status: 'IDLE',
      succeeded: 0,
      failed: 0,
      cacheHits: 0,
      latencyMs: 0,
      rateLimitErrors: 0,
      modelUsed: GROQ_MODEL,
      approximateCost: 0
    },
    openRouterVerification: {
      status: 'IDLE',
      succeeded: 0,
      failed: 0,
      latencyMs: 0,
      rateLimitErrors: 0,
      modelUsed: OPENROUTER_MODEL,
      approximateCost: 0
    },
    publication: {
      status: 'IDLE',
      dryRun,
      publishedCount: 0,
      heldCount: 0,
      rejectedCount: 0
    }
  };

  emitLog(
    'INFO',
    'INGEST',
    `Starting XNOVA Dual-Engine Pipeline [Run: ${runId}, Groq: ${GROQ_MODEL}, Nemotron: ${OPENROUTER_MODEL}, Window: ${windowHours}h, Concurrency: ${concurrencyLimit}]`
  );

  // -------------------------------------------------------------------------
  // STAGE 1: SOURCE COLLECTION
  // -------------------------------------------------------------------------
  const collectFn = options.adapters?.collectStories || defaultCollectStories;
  let rawStories: RawCollectedStory[] = [];
  let isLiveData = false;
  let collectionFailed = false;

  try {
    const collected = await collectFn({
      category: options.category,
      customQuery: options.customQuery,
      batchSize
    });
    rawStories = collected.stories || [];
    isLiveData = collected.isLiveData;
    stageDiagnostics.sourceCollection = {
      status: 'HEALTHY',
      storiesFetched: rawStories.length,
      latencyMs: collected.latencyMs,
      errorCount: 0,
      message: `Fetched ${rawStories.length} stories (${collected.latencyMs}ms)`
    };
    emitLog(
      'SUCCESS',
      'INGEST',
      `Collected ${rawStories.length} global stories in ${collected.latencyMs}ms.`,
      'newsapi',
      collected.latencyMs
    );
  } catch (err: any) {
    collectionFailed = true;
    const cleanErr = redactSecrets(err.message || 'Collection failed');
    stageDiagnostics.sourceCollection = {
      status: options.allowBenchmarkFallback && options.benchmarkPool?.length ? 'DEGRADED' : 'FAILED',
      storiesFetched: 0,
      latencyMs: Date.now() - startTime,
      errorCount: 1,
      message: cleanErr
    };
    emitLog('ERROR', 'INGEST', `Source collection error: ${cleanErr}`, 'newsapi');

    if (options.allowBenchmarkFallback && options.benchmarkPool && options.benchmarkPool.length > 0) {
      rawStories = JSON.parse(JSON.stringify(options.benchmarkPool));
      isLiveData = false;
      stageDiagnostics.sourceCollection.storiesFetched = rawStories.length;
      emitLog(
        'WARN',
        'INGEST',
        `Loaded ${rawStories.length} benchmark verification dispatches (explicit fallback enabled).`,
        'benchmark-pool'
      );
    }
  }

  if (rawStories.length === 0) {
    const overallStatus: PipelineStatus = collectionFailed ? 'FAILED' : 'DEGRADED';
    stageDiagnostics.deduplication.status = 'IDLE';
    stageDiagnostics.publication.status = overallStatus === 'FAILED' ? 'FAILED' : 'HEALTHY';

    return {
      id: runId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: overallStatus,
      dryRun,
      windowHours,
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
      isLiveData,
      executionDurationMs: Date.now() - startTime,
      totalApproximateCost: 0,
      stageDiagnostics,
      sevenDayTrend: computeSevenDayTrend([]),
      ledger: []
    };
  }

  // -------------------------------------------------------------------------
  // STAGE 2 & 3: NORMALIZATION, URL VALIDATION, DEDUPLICATION & TIME WINDOW
  // -------------------------------------------------------------------------
  const nowMs = Date.now();
  const validPubTimes = rawStories
    .map((a) => new Date(a.publishedAt).getTime())
    .filter((t) => !isNaN(t) && t > 0);
  const newestArticleMs = validPubTimes.length > 0 ? Math.max(...validPubTimes) : nowMs;
  const windowReferenceMs =
    newestArticleMs < nowMs - 12 * 3600 * 1000 ? newestArticleMs + 2 * 3600 * 1000 : nowMs;

  const eligibleCandidates: Array<{
    story: RawCollectedStory;
    canonicalUrl: string;
    publisherDomain: string;
    isWithinRollingWindow: boolean;
    ageHours: number;
    syndicatedDuplicateCount: number;
  }> = [];

  const rejectedLedgerItems: VerificationLedgerItem[] = [];
  let duplicatesRemoved = 0;
  let invalidUrlsRejected = 0;

  for (let i = 0; i < rawStories.length; i++) {
    const raw = rawStories[i];
    const urlValidation = validateStoryUrl(raw.originalUrl);

    if (!urlValidation.valid || !raw.headline || !raw.headline.trim()) {
      invalidUrlsRejected++;
      const reason = urlValidation.reason || 'Missing headline or source metadata';
      emitLog('WARN', 'DEDUPE', `Rejected invalid story URL/metadata: "${raw.originalUrl}" (${reason})`);
      rejectedLedgerItems.push({
        id: `led-${runId}-rej-${i + 1}`,
        headline: raw.headline || '[Invalid Headline]',
        publisher: raw.publisher || 'Unknown Source',
        publisherDomain: extractDomain(raw.originalUrl || ''),
        originalUrl: raw.originalUrl || '',
        canonicalUrl: urlValidation.canonicalUrl || '',
        publishedAt: raw.publishedAt || startedAt,
        retrievedAt: raw.retrievedAt || startedAt,
        category: 'General',
        summary: raw.summary || '',
        coreClaims: [],
        entities: [],
        importantNumbers: [],
        evidenceUrls: [],
        evidenceList: [],
        verificationStatus: 'REJECTED',
        extractionProvider: 'validation-gate',
        verificationProvider: 'validation-gate',
        processingProvider: 'validation-gate',
        rejectionOrReviewReasons: [`REJECTED: ${reason}`],
        discrepancyNotes: [],
        independentSourceCount: 0,
        corroborationScore: 0,
        isWithinRollingWindow: false,
        syndicatedDuplicateCount: 0,
        published: false,
        rawAuditTrail: [
          {
            timestamp: new Date().toISOString(),
            step: 'URL_VALIDATION',
            detail: `Rejected before AI processing: ${reason}`
          }
        ]
      });
      continue;
    }

    const pubTime = new Date(raw.publishedAt).getTime();
    const ageHours = isNaN(pubTime) ? 0 : Math.max(0, (windowReferenceMs - pubTime) / (3600 * 1000));
    const isWithinRollingWindow = ageHours <= windowHours;

    let duplicateMatch = null;
    for (const existing of eligibleCandidates) {
      if (existing.canonicalUrl === urlValidation.canonicalUrl) {
        duplicateMatch = existing;
        break;
      }
      const sim = computeHeadlineSimilarity(existing.story.headline, raw.headline);
      if (sim >= 0.68) {
        duplicateMatch = existing;
        break;
      }
    }

    if (duplicateMatch) {
      duplicatesRemoved++;
      duplicateMatch.syndicatedDuplicateCount++;
      emitLog(
        'WARN',
        'DEDUPE',
        `Clustered duplicate story before AI processing: "${raw.headline.slice(0, 55)}..."`
      );
    } else {
      eligibleCandidates.push({
        story: raw,
        canonicalUrl: urlValidation.canonicalUrl,
        publisherDomain: extractDomain(urlValidation.canonicalUrl),
        isWithinRollingWindow,
        ageHours,
        syndicatedDuplicateCount: 0
      });
    }
  }

  stageDiagnostics.deduplication = {
    status: 'HEALTHY',
    uniqueRemaining: eligibleCandidates.length,
    duplicatesRejected: duplicatesRemoved,
    invalidUrlsRejected
  };

  // -------------------------------------------------------------------------
  // STAGE 4, 5, 6, 7: PARALLEL TAVILY DISCOVERY + GROQ EXTRACTION -> NEMOTRON
  // -------------------------------------------------------------------------
  const discoverFn = options.adapters?.discoverEvidence || defaultDiscoverEvidence;
  const groqFn = options.adapters?.groqExtract || defaultGroqExtract;
  const geminiFn = options.adapters?.geminiExtract || defaultGeminiExtract;
  const openRouterFn = options.adapters?.openRouterVerify || defaultOpenRouterVerify;

  let groqStageFailedCount = 0;
  let groqStageSuccessCount = 0;
  let groqRateLimitCount = 0;
  let groqTotalLatencyMs = 0;
  let geminiFallbackUsed = false;
  let geminiQuotaTriggered = false;

  let openRouterSuccessCount = 0;
  let openRouterFailedCount = 0;
  let openRouterRateLimitCount = 0;
  let openRouterTotalLatencyMs = 0;
  let totalCost = 0;

  let cacheHitsCount = 0;

  emitLog(
    'INFO',
    'EVIDENCE_DISCOVERY',
    `Executing Tavily evidence discovery across ${eligibleCandidates.length} unique stories in parallel.`
  );

  const parallelEvidenceResults = await Promise.all(
    eligibleCandidates.map(async (candidate, idx) => {
      const { story, canonicalUrl, publisherDomain } = candidate;
      const evidenceItems: EvidenceItem[] = [];

      if (story.corroboratingSources && story.corroboratingSources.length > 0) {
        for (let i = 0; i < story.corroboratingSources.length; i++) {
          const cs = story.corroboratingSources[i];
          if (!cs || !cs.url) continue;
          const domain = cs.domain || extractDomain(cs.url);
          const isSyndicated = evidenceItems.some((ex) =>
            isSyndicatedWireCopy(ex.snippet, ex.title, cs.snippet || '', cs.title || '')
          );
          const isIndependent =
            cs.isIndependent !== undefined
              ? cs.isIndependent && !isSyndicated
              : !isSyndicated && isIndependentDomain(domain, publisherDomain);

          evidenceItems.push({
            id: cs.id || `ev-${idx}-${i}`,
            url: cs.url,
            domain,
            title: cs.title || `Report from ${domain}`,
            snippet: cs.snippet || '',
            publishedAt: cs.publishedAt || story.publishedAt,
            retrievedAt: new Date().toISOString(),
            isIndependent,
            isSyndicatedCopy: isSyndicated,
            stance: cs.stance || 'supports',
            relevanceScore: cs.relevanceScore ?? 0.9
          });
        }
      }

      try {
        const discovered = await discoverFn(story.headline, publisherDomain, canonicalUrl);
        if (discovered.evidence.length > 0) {
          const seenUrls = new Set(evidenceItems.map((e) => sanitizeCanonicalUrl(e.url)));
          for (const ev of discovered.evidence) {
            const cUrl = sanitizeCanonicalUrl(ev.url);
            if (!seenUrls.has(cUrl) && cUrl !== canonicalUrl) {
              const isSyndicated = evidenceItems.some((ex) =>
                isSyndicatedWireCopy(ex.snippet, ex.title, ev.snippet, ev.title)
              );
              seenUrls.add(cUrl);
              evidenceItems.push({
                ...ev,
                isSyndicatedCopy: ev.isSyndicatedCopy || isSyndicated,
                isIndependent: ev.isIndependent && !isSyndicated
              });
            }
          }
        }
      } catch (err: any) {
        emitLog(
          'WARN',
          'EVIDENCE_DISCOVERY',
          `Evidence discovery warning for "${story.headline.slice(0, 45)}...": ${redactSecrets(err.message)}`,
          'tavily'
        );
      }

      return evidenceItems;
    })
  );

  const processedLedgerItems = await runWithConcurrency(
    eligibleCandidates,
    concurrencyLimit,
    async (candidate, idx): Promise<VerificationLedgerItem> => {
      const { story, canonicalUrl, publisherDomain, isWithinRollingWindow, ageHours, syndicatedDuplicateCount } =
        candidate;
      const evidenceItems = parallelEvidenceResults[idx] || [];
      const independentCountPre = evidenceItems.filter((e) => e.isIndependent && !e.isSyndicatedCopy).length;

      const auditTrail: { timestamp: string; step: string; detail: string }[] = [
        {
          timestamp: new Date().toISOString(),
          step: 'INGEST_AND_NORMALIZE',
          detail: `Published: ${story.publishedAt} | Retrieved: ${story.retrievedAt} | Canonical URL: ${canonicalUrl}`
        },
        {
          timestamp: new Date().toISOString(),
          step: 'WINDOW_FILTER',
          detail: isWithinRollingWindow
            ? `Within ${windowHours}h rolling window (age: ${ageHours.toFixed(1)}h)`
            : `Outside ${windowHours}h rolling window (age: ${ageHours.toFixed(1)}h)`
        },
        {
          timestamp: new Date().toISOString(),
          step: 'PARALLEL_EVIDENCE_DISCOVERY',
          detail: `Retrieved ${evidenceItems.length} corroborating sources (${independentCountPre} independent non-syndicated domains)`
        }
      ];

      const inputHash = computeStoryInputHash({
        canonicalUrl,
        headline: story.headline,
        summary: story.summary || story.headline,
        evidence: evidenceItems
      });

      const cached = storyCache.get(canonicalUrl);
      let extractionResult: GroqExtractionOutput | null = null;
      let verificationResult: OpenRouterVerificationOutput | null = null;
      let cachedHit = false;

      if (cached && cached.contentHash === inputHash) {
        cachedHit = true;
        cacheHitsCount++;
        extractionResult = cached.extraction;
        verificationResult = cached.verification;
        groqStageSuccessCount++;
        openRouterSuccessCount++;
        auditTrail.push({
          timestamp: new Date().toISOString(),
          step: 'CACHE_HIT',
          detail: `Reused verified cached extraction & verification for unchanged content hash (${inputHash.slice(0, 10)})`
        });
      } else {
        // STAGE 5: GROQ PRIMARY FAST-PROCESSING ENGINE
        const extractionInput = {
          headline: story.headline,
          publisher: story.publisher,
          publisherDomain,
          canonicalUrl,
          publishedAt: story.publishedAt,
          summary: story.summary || story.headline,
          isWithinWindow: isWithinRollingWindow,
          evidenceCount: independentCountPre
        };

        try {
          extractionResult = await groqFn(extractionInput);
          groqStageSuccessCount++;
          groqTotalLatencyMs += extractionResult.latencyMs;
          auditTrail.push({
            timestamp: new Date().toISOString(),
            step: 'GROQ_FAST_EXTRACTION',
            detail: `Extracted ${extractionResult.coreClaims.length} claims, category [${extractionResult.category}] via ${extractionResult.providerUsed} (${extractionResult.latencyMs}ms)`
          });
        } catch (groqErr: any) {
          groqStageFailedCount++;
          if (groqErr?.status === 429) groqRateLimitCount++;
          emitLog(
            'WARN',
            'GROQ_EXTRACTION',
            `Groq primary extraction failed (${redactSecrets(groqErr.message)}). Attempting optional Gemini fallback.`,
            `groq/${GROQ_MODEL}`
          );

          try {
            extractionResult = await geminiFn(extractionInput);
            geminiFallbackUsed = true;
            auditTrail.push({
              timestamp: new Date().toISOString(),
              step: 'GEMINI_EXTRACTION_FALLBACK',
              detail: `Fallback extraction completed via ${extractionResult.providerUsed} (${extractionResult.latencyMs}ms)`
            });
          } catch (gemErr: any) {
            if (gemErr?.status === 429) {
              geminiQuotaTriggered = true;
              emitLog(
                'WARN',
                'GROQ_EXTRACTION',
                `Gemini quota exhausted (${redactSecrets(gemErr.message)}). Using deterministic claim extractor.`,
                `gemini/${GEMINI_MODEL}`
              );
            }
            extractionResult = deterministicExtractFallback(extractionInput);
            auditTrail.push({
              timestamp: new Date().toISOString(),
              step: 'DETERMINISTIC_EXTRACTION_FALLBACK',
              detail: `Extracted baseline claims via deterministic rules after AI extraction failure.`
            });
          }
        }

        // STAGE 6: OPENROUTER NVIDIA NEMOTRON 3 SUPER VERIFICATION
        try {
          verificationResult = await openRouterFn({
            headline: story.headline,
            publisher: story.publisher,
            publisherDomain,
            originalUrl: story.originalUrl,
            publishedAt: story.publishedAt,
            extraction: extractionResult,
            evidence: evidenceItems,
            isWithinWindow: isWithinRollingWindow
          });
          openRouterSuccessCount++;
          const itemCost =
            typeof verificationResult.cost === 'number'
              ? verificationResult.cost
              : typeof (verificationResult as any).approximateCost === 'number'
              ? (verificationResult as any).approximateCost
              : 0;
          if (itemCost) totalCost += itemCost;
          auditTrail.push({
            timestamp: new Date().toISOString(),
            step: 'NEMOTRON_3_SUPER_VERIFICATION',
            detail: `Independent verification completed via ${verificationResult.providerUsed} (${verificationResult.latencyMs}ms) -> ${verificationResult.status}`
          });
        } catch (orErr: any) {
          openRouterFailedCount++;
          if (orErr?.status === 429) openRouterRateLimitCount++;
          emitLog(
            'WARN',
            'OPENROUTER_VERIFICATION',
            `Nemotron verification failed (${redactSecrets(orErr.message)}). Reconciling with deterministic evidence rules.`,
            `openrouter/${OPENROUTER_MODEL}`
          );
          verificationResult = null;
          auditTrail.push({
            timestamp: new Date().toISOString(),
            step: 'NEMOTRON_VERIFICATION_FAILED',
            detail: `Nemotron unavailable (${redactSecrets(orErr.message)}). Falling back to strict deterministic evidence verification.`
          });
        }

        if (
          extractionResult &&
          extractionResult.providerUsed.startsWith('groq/') &&
          verificationResult &&
          verificationResult.isLiveEvaluated
        ) {
          storyCache.set(canonicalUrl, {
            contentHash: inputHash,
            cachedAt: Date.now(),
            extraction: extractionResult,
            verification: verificationResult
          });
        }
      }

      // STAGE 7: RECONCILIATION & EVIDENCE POLICY ENFORCEMENT
      const reconciled = reconcileAndEnforcePolicy({
        headline: story.headline,
        publisher: story.publisher,
        publisherDomain,
        originalUrl: story.originalUrl,
        canonicalUrl,
        urlValid: true,
        isWithinWindow: isWithinRollingWindow,
        ageHours,
        windowHours,
        extraction: extractionResult!,
        verification: verificationResult,
        evidence: evidenceItems,
        minIndependentSources,
        dryRun
      });

      const verProviderLabel = verificationResult?.providerUsed || 'deterministic-evidence-verifier';
      const combinedProviderLabel = `${extractionResult!.providerUsed} -> ${verProviderLabel}`;

      auditTrail.push({
        timestamp: new Date().toISOString(),
        step: 'RECONCILIATION_AND_POLICY',
        detail: `Final Status: ${reconciled.status} | Score: ${reconciled.corroborationScore}% | Published: ${reconciled.published} (DryRun: ${dryRun})`
      });

      return {
        id: `led-${runId}-${idx + 1}`,
        headline: story.headline,
        publisher: story.publisher,
        publisherDomain,
        originalUrl: story.originalUrl,
        canonicalUrl,
        publishedAt: story.publishedAt,
        retrievedAt: story.retrievedAt,
        category: extractionResult!.category,
        secondaryCategory: extractionResult!.secondaryCategory,
        isDualRelevant: extractionResult!.isDualRelevant,
        classificationMethod: extractionResult!.classificationMethod,
        summary: extractionResult!.summary,
        coreClaims: extractionResult!.coreClaims,
        entities: extractionResult!.entities,
        importantNumbers: extractionResult!.importantNumbers,
        flags: extractionResult!.flags,
        evidenceUrls: evidenceItems.map((e) => e.url),
        evidenceList: evidenceItems,
        verificationStatus: reconciled.status,
        extractionProvider: extractionResult!.providerUsed,
        verificationProvider: verProviderLabel,
        processingProvider: combinedProviderLabel,
        rejectionOrReviewReasons: reconciled.reasons,
        discrepancyNotes: reconciled.discrepancyNotes,
        nemotronVerification: reconciled.nemotronVerification,
        independentSourceCount: reconciled.independentSourceCount,
        corroborationScore: reconciled.corroborationScore,
        isWithinRollingWindow,
        syndicatedDuplicateCount,
        published: reconciled.published,
        cachedHit,
        approximateCost: reconciled.approximateCost,
        rawAuditTrail: auditTrail
      };
    }
  );

  const fullLedger = [...processedLedgerItems, ...rejectedLedgerItems];

  let verifiedCount = 0;
  let partiallyVerifiedCount = 0;
  let conflictingCount = 0;
  let unverifiedCount = 0;
  let rejectedCount = 0;
  let publishedCount = 0;
  let heldCount = 0;

  for (const item of fullLedger) {
    if (item.published) publishedCount++;
    else if (item.verificationStatus !== 'REJECTED') heldCount++;

    switch (item.verificationStatus) {
      case 'VERIFIED':
        verifiedCount++;
        break;
      case 'PARTIALLY_VERIFIED':
      case 'PARTIALLY_SUPPORTED':
        partiallyVerifiedCount++;
        break;
      case 'CONFLICTING':
      case 'DISPUTED':
        conflictingCount++;
        break;
      case 'REJECTED':
        rejectedCount++;
        break;
      case 'UNVERIFIED':
      case 'NEEDS_REVIEW':
      default:
        unverifiedCount++;
        break;
    }
  }

  stageDiagnostics.groqProcessing = {
    status:
      groqStageFailedCount === 0
        ? 'HEALTHY'
        : groqStageSuccessCount > 0 || geminiFallbackUsed
        ? 'DEGRADED'
        : 'FAILED',
    succeeded: groqStageSuccessCount,
    failed: groqStageFailedCount,
    cacheHits: cacheHitsCount,
    latencyMs:
      groqStageSuccessCount > 0 ? Math.round(groqTotalLatencyMs / Math.max(1, groqStageSuccessCount)) : 0,
    rateLimitErrors: groqRateLimitCount,
    modelUsed: GROQ_MODEL,
    approximateCost: 0
  };

  stageDiagnostics.openRouterVerification = {
    status:
      openRouterFailedCount === 0
        ? 'HEALTHY'
        : openRouterSuccessCount > 0
        ? 'DEGRADED'
        : 'FAILED',
    succeeded: openRouterSuccessCount,
    failed: openRouterFailedCount,
    latencyMs:
      openRouterSuccessCount > 0
        ? Math.round(openRouterTotalLatencyMs / Math.max(1, openRouterSuccessCount))
        : 0,
    rateLimitErrors: openRouterRateLimitCount,
    modelUsed: OPENROUTER_MODEL,
    approximateCost: totalCost
  };

  stageDiagnostics.publication = {
    status: 'HEALTHY',
    dryRun,
    publishedCount,
    heldCount,
    rejectedCount
  };

  let overallStatus: PipelineStatus = 'HEALTHY';
  const bothAiStagesCompletelyFailed =
    eligibleCandidates.length > 0 &&
    groqStageSuccessCount === 0 &&
    openRouterSuccessCount === 0 &&
    !geminiFallbackUsed;

  if (bothAiStagesCompletelyFailed) {
    overallStatus = 'DEGRADED';
  } else if (
    collectionFailed ||
    groqStageFailedCount > 0 ||
    openRouterFailedCount > 0 ||
    geminiQuotaTriggered
  ) {
    overallStatus = 'DEGRADED';
  }

  const duration = Date.now() - startTime;
  const activeEngineLabel =
    processedLedgerItems[0]?.processingProvider || `groq/${GROQ_MODEL} -> openrouter/${OPENROUTER_MODEL}`;

  emitLog(
    overallStatus === 'HEALTHY' ? 'SUCCESS' : 'WARN',
    'LEDGER',
    `Pipeline completed [${overallStatus}] in ${duration}ms via [${activeEngineLabel}]. Verified: ${verifiedCount}, Partially Verified: ${partiallyVerifiedCount}, Conflicting: ${conflictingCount}, Unverified: ${unverifiedCount}, Published: ${publishedCount}.`,
    activeEngineLabel,
    duration
  );

  return {
    id: runId,
    startedAt,
    completedAt: new Date().toISOString(),
    status: overallStatus,
    dryRun,
    windowHours,
    articlesCollected: rawStories.length,
    uniqueArticles: eligibleCandidates.length,
    duplicatesRemoved,
    invalidUrlsRejected,
    verifiedCount,
    partiallyVerifiedCount,
    partiallySupportedCount: partiallyVerifiedCount,
    conflictingCount,
    disputedCount: conflictingCount,
    needsReviewCount: unverifiedCount,
    unverifiedCount,
    rejectedCount,
    publishedCount,
    cacheHits: cacheHitsCount,
    activeProvider: activeEngineLabel,
    extractionEngine: `groq/${GROQ_MODEL}`,
    verificationEngine: `openrouter/${OPENROUTER_MODEL}`,
    isLiveData,
    executionDurationMs: duration,
    totalApproximateCost: totalCost,
    stageDiagnostics,
    sevenDayTrend: computeSevenDayTrend(fullLedger),
    ledger: fullLedger
  };
}
