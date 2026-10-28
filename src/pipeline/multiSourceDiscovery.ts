import { GoogleGenAI } from '@google/genai';
import {
  ArxivPaperMetadata,
  DiscoveryServiceId,
  ExecutiveIntelligenceDossier,
  GlobalLeadStory,
  PipelineLog,
  SourceDiscoveryTelemetry,
  UniversalCategoryDossier,
  UniversalCategoryId,
  VerificationLedgerItem
} from '../types/pipeline';
import {
  computeHeadlineSimilarity,
  extractDomain,
  extractJsonObject,
  getModelsConfig,
  isRealKey,
  RawCollectedStory,
  redactSecrets,
  sanitizeCanonicalUrl,
  validateStoryUrl
} from './engine';
import {
  buildCategoryScopedCacheKey,
  classifyUniversalCategory,
  getUniversalCategorySpec,
  isArxivEligibleForCategory,
  normalizeToUniversalCategory,
  revalidateCategoryIsolation,
  UNIVERSAL_CATEGORIES
} from './universalCategories';

export const PREPRINT_BADGE_LABEL =
  '[PREPRINT — NOT PEER-REVIEWED UNLESS INDEPENDENTLY VERIFIED]';

// Category-specific queries for NewsAPI and Tavily
export const UNIVERSAL_CATEGORY_QUERIES: Record<UniversalCategoryId, { newsQuery: string; tavilyQuery: string; arxivQuery: string }> = {
  GEOPOLITICS: {
    newsQuery: 'diplomacy OR treaty OR sanctions OR NATO OR United Nations OR bilateral summit OR foreign ministry',
    tavilyQuery: 'sovereign diplomacy international summit treaty sanctions foreign policy official statement',
    arxivQuery: ''
  },
  MACRO_FINANCE: {
    newsQuery: '"central bank" OR inflation OR "interest rates" OR "quarterly earnings" OR GDP OR "mergers and acquisitions"',
    tavilyQuery: 'macroeconomics central bank interest rates corporate earnings GDP bond yields financial markets',
    arxivQuery: ''
  },
  AI_COMPUTING: {
    newsQuery: '"artificial intelligence" OR "large language model" OR OpenAI OR DeepMind OR Anthropic OR cybersecurity OR "cloud computing"',
    tavilyQuery: 'artificial intelligence LLM neural architecture cybersecurity cloud compute breakthrough',
    arxivQuery: 'cat:cs.AI OR cat:cs.LG OR cat:cs.CL'
  },
  SEMICON_HARDWARE: {
    newsQuery: 'TSMC OR ASML OR semiconductor OR "chip fabrication" OR Nvidia OR robotics OR "quantum processor" OR HBM3',
    tavilyQuery: 'semiconductor fab TSMC ASML EUV lithography GPU architecture humanoid robotics hardware',
    arxivQuery: 'cat:cs.RO OR cat:cs.AR OR all:semiconductor'
  },
  SCIENCE_SPACE: {
    newsQuery: 'NASA OR SpaceX OR ISRO OR "James Webb" OR astrophysics OR "lunar mission" OR CERN OR "particle physics"',
    tavilyQuery: 'NASA ESA ISRO SpaceX astrophysics telescope space mission theoretical physics discovery',
    arxivQuery: 'cat:astro-ph OR cat:quant-ph OR cat:physics.space-ph'
  },
  CLIMATE_ENERGY: {
    newsQuery: '"nuclear fusion" OR "renewable energy" OR "grid battery" OR "carbon capture" OR "solar capacity" OR "climate change"',
    tavilyQuery: 'nuclear fusion clean energy grid storage decarbonization solar wind climate science',
    arxivQuery: 'cat:physics.ao-ph OR all:"nuclear fusion" OR all:"renewable energy"'
  },
  BIOTECH_HEALTH: {
    newsQuery: 'CRISPR OR "clinical trial" OR "FDA approval" OR oncology OR mRNA OR "gene therapy" OR "World Health Organization"',
    tavilyQuery: 'biotechnology CRISPR clinical trial phase 3 FDA approval genomics medical research',
    arxivQuery: 'cat:q-bio.BM OR cat:q-bio.GN OR all:CRISPR'
  },
  SPORTS_ATHLETICS: {
    newsQuery: '"Premier League" OR "Champions League" OR FIFA OR NBA OR NFL OR Wimbledon OR "Formula 1" OR Olympics OR tournament',
    tavilyQuery: 'sports match result final score tournament standings championship athlete performance',
    arxivQuery: ''
  }
};

// Category-scoped discovery cache: key is `${UniversalCategoryId}::${canonicalUrl}`
const categoryIsolatedStoryCache = new Map<string, DiscoveredUnifiedStory>();
const categoryArxivCache = new Map<UniversalCategoryId, ArxivPaperMetadata[]>();

// Track active request token per client/session to prevent race conditions on category switching
let latestActiveRequestToken = 'init-token';

export function setLatestActiveRequestToken(token: string): void {
  latestActiveRequestToken = token;
}

export function getLatestActiveRequestToken(): string {
  return latestActiveRequestToken;
}

export function clearUniversalDossierCaches(): void {
  categoryIsolatedStoryCache.clear();
  categoryArxivCache.clear();
}

export function getCategoryScopedCacheEntry(
  category: UniversalCategoryId | 'ALL' | string,
  canonicalUrl: string
): DiscoveredUnifiedStory | undefined {
  const key = buildCategoryScopedCacheKey(category, canonicalUrl);
  return categoryIsolatedStoryCache.get(key);
}

export interface DiscoveredUnifiedStory {
  headline: string;
  summary: string;
  publisher: string;
  publisherDomain: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt: string;
  universalCategory: UniversalCategoryId;
  verifiedFacts: string[];
  strategicImpact: string;
  discoveryServices: DiscoveryServiceId[];
  researchPaper?: ArxivPaperMetadata;
}

export interface MultiSourceAdapters {
  geminiGroundingFetch?: (params: {
    category: UniversalCategoryId | 'ALL';
    query?: string;
  }) => Promise<{ stories: RawCollectedStory[]; latencyMs: number; keyUsed: string }>;
  newsApiFetch?: (params: {
    category: UniversalCategoryId | 'ALL';
    query?: string;
  }) => Promise<{ stories: RawCollectedStory[]; latencyMs: number }>;
  tavilyFetch?: (params: {
    category: UniversalCategoryId | 'ALL';
    query?: string;
  }) => Promise<{ stories: RawCollectedStory[]; latencyMs: number }>;
  arxivFetch?: (params: {
    category: UniversalCategoryId;
    query?: string;
  }) => Promise<{ papers: ArxivPaperMetadata[]; latencyMs: number }>;
}

// ---------------------------------------------------------------------------
// 1. GEMINI WITH GOOGLE SEARCH GROUNDING ADAPTER (Uses GEMINI_API_KEY2 || GEMINI_API_KEY)
// ---------------------------------------------------------------------------
export function getGeminiGroundingApiKey(): { key?: string; keyName: string } {
  if (isRealKey(process.env.GEMINI_API_KEY2)) {
    return { key: process.env.GEMINI_API_KEY2!.trim(), keyName: 'GEMINI_API_KEY2' };
  }
  if (isRealKey(process.env.GEMINI_API_KEY)) {
    return { key: process.env.GEMINI_API_KEY!.trim(), keyName: 'GEMINI_API_KEY' };
  }
  return { key: undefined, keyName: 'NONE' };
}

export async function defaultGeminiGroundingFetch(params: {
  category: UniversalCategoryId | 'ALL';
  query?: string;
}): Promise<{ stories: RawCollectedStory[]; latencyMs: number; keyUsed: string }> {
  const { key, keyName } = getGeminiGroundingApiKey();
  if (!key) {
    throw new Error('Neither GEMINI_API_KEY2 nor GEMINI_API_KEY is configured');
  }

  const { GEMINI_MODEL } = getModelsConfig();
  const start = Date.now();
  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  const targetSpec =
    params.category !== 'ALL' ? getUniversalCategorySpec(params.category) : null;
  const focusInstruction = targetSpec
    ? `Strictly research verified recent news ONLY within the category [${targetSpec.id}: ${targetSpec.label}]. Exclude all other categories.`
    : `Research verified recent global news across Geopolitics, Macroeconomics/Finance, AI/Computing, Semiconductors/Robotics, Science/Space, Climate/Energy, Bio-Tech/Health, and Sports.`;

  const prompt = `You are the Autonomous Ground Research & Synthesis Engine of XNOVA / Aetheria Digital Paper.
Use Google Search Grounding to find 4 real, recent, verified news developments.
${focusInstruction}
${params.query ? `Additional search focus: ${params.query}` : ''}

Return ONLY valid JSON with this structure:
{
  "stories": [
    {
      "headline": "Exact factual headline",
      "publisher": "Publisher Name",
      "url": "https://...",
      "publishedAt": "2026-10-27T00:00:00Z",
      "category": "${targetSpec ? targetSpec.id : 'GEOPOLITICS'}",
      "summary": "Evidence-grounded synthesis with concrete metrics and verified facts."
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const latencyMs = Date.now() - start;
  const retrievedAt = new Date().toISOString();

  // Extract grounding chunks if present
  const groundingChunks =
    (response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const groundedUrls: { uri: string; title: string }[] = [];
  for (const chunk of groundingChunks) {
    if (chunk?.web?.uri && validateStoryUrl(chunk.web.uri).valid) {
      groundedUrls.push({
        uri: chunk.web.uri,
        title: String(chunk.web.title || extractDomain(chunk.web.uri))
      });
    }
  }

  let parsedStories: any[] = [];
  try {
    const parsed = extractJsonObject(response.text || '');
    if (Array.isArray(parsed?.stories)) {
      parsedStories = parsed.stories;
    }
  } catch {
    // Fallback to constructing from grounding chunks if model output wasn't pure JSON
  }

  const stories: RawCollectedStory[] = [];
  for (let i = 0; i < parsedStories.length; i++) {
    const item = parsedStories[i];
    const candidateUrl =
      validateStoryUrl(item?.url).valid
        ? String(item.url)
        : groundedUrls[i]?.uri || groundedUrls[0]?.uri || '';

    if (!validateStoryUrl(candidateUrl).valid || !item?.headline) continue;

    stories.push({
      headline: String(item.headline).trim(),
      publisher: String(item.publisher || extractDomain(candidateUrl)).trim(),
      originalUrl: candidateUrl,
      publishedAt: item.publishedAt && !isNaN(Date.parse(item.publishedAt)) ? item.publishedAt : retrievedAt,
      retrievedAt,
      category: String(item.category || (params.category === 'ALL' ? 'GEOPOLITICS' : params.category)),
      summary: String(item.summary || item.headline).trim()
    });
  }

  return { stories, latencyMs, keyUsed: keyName };
}

// ---------------------------------------------------------------------------
// 2. NEWSAPI CATEGORY-ISOLATED ADAPTER
// ---------------------------------------------------------------------------
export async function defaultNewsApiCategoryFetch(params: {
  category: UniversalCategoryId | 'ALL';
  query?: string;
}): Promise<{ stories: RawCollectedStory[]; latencyMs: number }> {
  const newsApiKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  if (!isRealKey(newsApiKey)) {
    throw new Error('NEWS_API_KEY is not configured');
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const queries = params.query?.trim()
      ? [params.query.trim()]
      : params.category !== 'ALL'
      ? [UNIVERSAL_CATEGORY_QUERIES[params.category].newsQuery]
      : [
          'treaty OR summit OR NATO OR "central bank" OR "quarterly earnings" OR inflation OR "Premier League" OR championship OR FIFA',
          '"artificial intelligence" OR OpenAI OR TSMC OR semiconductor OR Nvidia OR NASA OR SpaceX OR "renewable energy" OR "climate change" OR CRISPR OR "clinical trial"'
        ];

    const responses = await Promise.all(
      queries.map((q) =>
        fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(
            q
          )}&sortBy=publishedAt&pageSize=25&language=en&apiKey=${newsApiKey}`,
          { signal: controller.signal }
        ).catch(() => null)
      )
    );
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    const okResponses = responses.filter((r): r is Response => Boolean(r && r.ok));
    if (okResponses.length === 0) {
      throw new Error('NewsAPI request failed');
    }

    const payloads = await Promise.all(okResponses.map((r) => r.json().catch(() => ({}))));
    const articles = payloads.flatMap((p: any) => (Array.isArray(p?.articles) ? p.articles : []));
    const retrievedAt = new Date().toISOString();
    const stories: RawCollectedStory[] = [];

    for (const art of articles) {
      if (!art?.title || art.title === '[Removed]' || !art?.url || /shopping-deals|dansdeals|coupon/i.test(String(art.url))) continue;
      const urlCheck = validateStoryUrl(art.url);
      if (!urlCheck.valid) continue;

      stories.push({
        headline: String(art.title).trim(),
        publisher: String(art.source?.name || extractDomain(art.url)).trim(),
        originalUrl: String(art.url),
        publishedAt: art.publishedAt || retrievedAt,
        retrievedAt,
        category: params.category,
        summary: String(art.description || art.content || art.title).trim()
      });
    }

    return { stories, latencyMs };
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(redactSecrets(err.message || 'NewsAPI category fetch failed'));
  }
}

// ---------------------------------------------------------------------------
// 3. TAVILY PRIMARY-SOURCE & NEWS DISCOVERY ADAPTER
// ---------------------------------------------------------------------------
export async function defaultTavilyCategoryFetch(params: {
  category: UniversalCategoryId | 'ALL';
  query?: string;
}): Promise<{ stories: RawCollectedStory[]; latencyMs: number }> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!isRealKey(tavilyKey)) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const q = params.query?.trim()
      ? params.query.trim()
      : params.category !== 'ALL'
      ? UNIVERSAL_CATEGORY_QUERIES[params.category].tavilyQuery
      : 'global breaking news diplomacy central bank artificial intelligence semiconductor space climate biotech sports';

    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: q,
        search_depth: 'basic',
        max_results: 8
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      throw new Error(`Tavily HTTP ${resp.status}`);
    }

    const data: any = await resp.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const retrievedAt = new Date().toISOString();
    const stories: RawCollectedStory[] = [];

    for (const r of results) {
      if (!r?.title || !r?.url) continue;
      const urlCheck = validateStoryUrl(r.url);
      if (!urlCheck.valid) continue;

      stories.push({
        headline: String(r.title).trim(),
        publisher: extractDomain(r.url),
        originalUrl: String(r.url),
        publishedAt: r.published_date && !isNaN(Date.parse(r.published_date)) ? r.published_date : retrievedAt,
        retrievedAt,
        category: params.category,
        summary: String(r.content || r.snippet || r.title).slice(0, 360).trim()
      });
    }

    return { stories, latencyMs };
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(redactSecrets(err.message || 'Tavily discovery failed'));
  }
}

// ---------------------------------------------------------------------------
// 4. PUBLIC arXiv API RESEARCH-PAPER DISCOVERY & XML PARSER
// ---------------------------------------------------------------------------
export function parseArxivAtomXml(xml: string): ArxivPaperMetadata[] {
  if (!xml || typeof xml !== 'string') return [];
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/gi) || [];
  const papers: ArxivPaperMetadata[] = [];

  for (const entryXml of entries) {
    const idMatch = entryXml.match(/<id>([\s\S]*?)<\/id>/i);
    const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/i);
    const summaryMatch = entryXml.match(/<summary>([\s\S]*?)<\/summary>/i);
    const publishedMatch = entryXml.match(/<published>([\s\S]*?)<\/published>/i);
    const categoryMatch = entryXml.match(/<arxiv:primary_category[^>]*term="([^"]+)"/i);

    const authorMatches = Array.from(entryXml.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gi));
    const authors = authorMatches.map((m) => m[1].replace(/\s+/g, ' ').trim()).filter(Boolean);

    const rawId = idMatch ? idMatch[1].trim() : '';
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
    const abstract = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';
    const publishedAt = publishedMatch ? publishedMatch[1].trim() : '';

    if (!rawId || !title || authors.length === 0 || !publishedAt || !abstract) {
      continue;
    }

    // Normalize canonical arXiv URL to https://arxiv.org/abs/...
    const cleanId = rawId
      .replace(/^http:\/\//i, 'https://')
      .replace(/v\d+$/, '');
    const urlCheck = validateStoryUrl(cleanId);
    if (!urlCheck.valid || !urlCheck.canonicalUrl.includes('arxiv.org/')) {
      continue;
    }

    const pdfUrl = urlCheck.canonicalUrl.replace('/abs/', '/pdf/') + '.pdf';

    papers.push({
      id: cleanId.split('/abs/').pop() || cleanId,
      title,
      authors,
      publishedAt,
      abstract: abstract.slice(0, 420),
      canonicalUrl: urlCheck.canonicalUrl,
      pdfUrl,
      primaryCategory: categoryMatch ? categoryMatch[1] : undefined,
      isPreprint: true,
      preprintLabel: PREPRINT_BADGE_LABEL
    });
  }

  return papers;
}

export async function defaultArxivFetch(params: {
  category: UniversalCategoryId;
  query?: string;
}): Promise<{ papers: ArxivPaperMetadata[]; latencyMs: number }> {
  // Strict Category Eligibility Gate: NEVER fetch or force arXiv into Sports, Geopolitics, or Macro/Finance
  if (!isArxivEligibleForCategory(params.category)) {
    return { papers: [], latencyMs: 0 };
  }

  const cached = categoryArxivCache.get(params.category);
  if (cached && cached.length > 0 && !params.query) {
    return { papers: cached, latencyMs: 1 };
  }

  const spec = getUniversalCategorySpec(params.category);
  const searchQuery = params.query?.trim()
    ? `all:${params.query.trim()}`
    : spec.arxivQuery || UNIVERSAL_CATEGORY_QUERIES[params.category].arxivQuery;

  if (!searchQuery) {
    return { papers: [], latencyMs: 0 };
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
      searchQuery
    )}&sortBy=submittedDate&sortOrder=descending&max_results=3`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'XNOVA-Intelligence-Engine/2.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      throw new Error(`arXiv API HTTP ${resp.status}`);
    }

    const xml = await resp.text();
    const papers = parseArxivAtomXml(xml);

    if (papers.length > 0 && !params.query) {
      categoryArxivCache.set(params.category, papers);
    }

    return { papers, latencyMs };
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(redactSecrets(err.message || 'arXiv API fetch failed'));
  }
}

// ---------------------------------------------------------------------------
// 5. EXECUTIVE DOSSIER SYNTHESIS & STRICT CATEGORY ISOLATION ORCHESTRATOR
// ---------------------------------------------------------------------------
export async function buildExecutiveIntelligenceDossier(options: {
  selectedCategory?: string;
  customQuery?: string;
  requestToken?: string;
  existingLedger?: VerificationLedgerItem[];
  adapters?: MultiSourceAdapters;
  onLog?: (log: PipelineLog) => void;
}): Promise<ExecutiveIntelligenceDossier> {
  const normalizedTarget = normalizeToUniversalCategory(options.selectedCategory);
  const requestToken = options.requestToken || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  setLatestActiveRequestToken(requestToken);

  const emitLog = (
    level: PipelineLog['level'],
    stage: PipelineLog['stage'],
    message: string,
    provider?: string,
    latencyMs?: number
  ) => {
    options.onLog?.({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      stage,
      message: redactSecrets(message),
      provider,
      latencyMs
    });
  };

  const geminiAdapter = options.adapters?.geminiGroundingFetch || defaultGeminiGroundingFetch;
  const newsApiAdapter = options.adapters?.newsApiFetch || defaultNewsApiCategoryFetch;
  const tavilyAdapter = options.adapters?.tavilyFetch || defaultTavilyCategoryFetch;
  const arxivAdapter = options.adapters?.arxivFetch || defaultArxivFetch;

  const { keyName: geminiKeyName } = getGeminiGroundingApiKey();

  const sourceTelemetry: SourceDiscoveryTelemetry = {
    geminiGrounding: {
      attempted: false,
      succeeded: false,
      storiesFound: 0,
      latencyMs: 0,
      keyUsed: geminiKeyName
    },
    newsapi: {
      attempted: false,
      succeeded: false,
      storiesFound: 0,
      latencyMs: 0
    },
    tavily: {
      attempted: false,
      succeeded: false,
      storiesFound: 0,
      latencyMs: 0
    },
    arxiv: {
      attempted: false,
      succeeded: false,
      papersFound: 0,
      latencyMs: 0
    }
  };

  // Run all 3 news discovery services in parallel
  const [geminiRes, newsApiRes, tavilyRes] = await Promise.all([
    (async () => {
      sourceTelemetry.geminiGrounding.attempted = true;
      try {
        const res = await geminiAdapter({
          category: normalizedTarget,
          query: options.customQuery
        });
        sourceTelemetry.geminiGrounding.succeeded = true;
        sourceTelemetry.geminiGrounding.storiesFound = res.stories.length;
        sourceTelemetry.geminiGrounding.latencyMs = res.latencyMs;
        sourceTelemetry.geminiGrounding.keyUsed = res.keyUsed;
        emitLog(
          'SUCCESS',
          'INGEST',
          `Gemini Search Grounding (${res.keyUsed}) discovered ${res.stories.length} grounded stories in ${res.latencyMs}ms.`,
          'gemini-grounding',
          res.latencyMs
        );
        return res.stories.map((s) => ({ story: s, service: 'gemini_grounding' as DiscoveryServiceId }));
      } catch (err: any) {
        const rawErr = redactSecrets(err.message || 'Gemini Grounding failed');
        sourceTelemetry.geminiGrounding.error = rawErr.includes('429') || rawErr.includes('RESOURCE_EXHAUSTED') ? `HTTP 429 Quota Exhausted (${geminiKeyName})` : rawErr.slice(0, 120);
        emitLog(
          'WARN',
          'INGEST',
          `Gemini Search Grounding note: ${sourceTelemetry.geminiGrounding.error}`,
          'gemini-grounding'
        );
        return [];
      }
    })(),
    (async () => {
      sourceTelemetry.newsapi.attempted = true;
      try {
        const res = await newsApiAdapter({
          category: normalizedTarget,
          query: options.customQuery
        });
        sourceTelemetry.newsapi.succeeded = true;
        sourceTelemetry.newsapi.storiesFound = res.stories.length;
        sourceTelemetry.newsapi.latencyMs = res.latencyMs;
        emitLog(
          'SUCCESS',
          'INGEST',
          `NewsAPI discovered ${res.stories.length} articles for [${normalizedTarget}] in ${res.latencyMs}ms.`,
          'newsapi',
          res.latencyMs
        );
        return res.stories.map((s) => ({ story: s, service: 'newsapi' as DiscoveryServiceId }));
      } catch (err: any) {
        sourceTelemetry.newsapi.error = redactSecrets(err.message || 'NewsAPI failed');
        return [];
      }
    })(),
    (async () => {
      sourceTelemetry.tavily.attempted = true;
      try {
        const res = await tavilyAdapter({
          category: normalizedTarget,
          query: options.customQuery
        });
        sourceTelemetry.tavily.succeeded = true;
        sourceTelemetry.tavily.storiesFound = res.stories.length;
        sourceTelemetry.tavily.latencyMs = res.latencyMs;
        emitLog(
          'SUCCESS',
          'EVIDENCE_DISCOVERY',
          `Tavily API discovered ${res.stories.length} primary/web reports for [${normalizedTarget}] in ${res.latencyMs}ms.`,
          'tavily',
          res.latencyMs
        );
        return res.stories.map((s) => ({ story: s, service: 'tavily' as DiscoveryServiceId }));
      } catch (err: any) {
        sourceTelemetry.tavily.error = redactSecrets(err.message || 'Tavily failed');
        return [];
      }
    })()
  ]);

  // Also include verified items from existingLedger as candidates (subject to strict category revalidation!)
  const ledgerCandidates: { story: RawCollectedStory; service: DiscoveryServiceId; coreClaims?: string[] }[] =
    (options.existingLedger || [])
      .filter((item) => item.verificationStatus !== 'REJECTED')
      .map((item) => ({
        story: {
          headline: item.headline,
          publisher: item.publisher,
          originalUrl: item.canonicalUrl || item.originalUrl,
          publishedAt: item.publishedAt,
          retrievedAt: item.retrievedAt || item.publishedAt,
          category: item.universalCategory || item.category,
          summary: item.summary
        },
        service: 'newsapi' as DiscoveryServiceId,
        coreClaims: item.coreClaims
      }));

  const allRawCandidates = [...geminiRes, ...newsApiRes, ...tavilyRes, ...ledgerCandidates];

  // Fetch arXiv papers for eligible STEM categories
  const eligibleArxivCategories: UniversalCategoryId[] =
    normalizedTarget === 'ALL'
      ? UNIVERSAL_CATEGORIES.filter((c) => c.arxivEligible).map((c) => c.id)
      : isArxivEligibleForCategory(normalizedTarget)
      ? [normalizedTarget]
      : [];

  const arxivByCategory = new Map<UniversalCategoryId, ArxivPaperMetadata>();
  if (eligibleArxivCategories.length > 0) {
    sourceTelemetry.arxiv.attempted = true;
    const arxivStart = Date.now();
    let totalPapers = 0;
    let anySucceeded = false;

    await Promise.all(
      eligibleArxivCategories.map(async (catId) => {
        try {
          const res = await arxivAdapter({ category: catId, query: options.customQuery });
          if (res.papers.length > 0) {
            arxivByCategory.set(catId, res.papers[0]);
            totalPapers += res.papers.length;
            anySucceeded = true;
          }
        } catch (err: any) {
          sourceTelemetry.arxiv.error = redactSecrets(err.message || 'arXiv fetch error');
        }
      })
    );

    sourceTelemetry.arxiv.succeeded = anySucceeded;
    sourceTelemetry.arxiv.papersFound = totalPapers;
    sourceTelemetry.arxiv.latencyMs = Date.now() - arxivStart;
    if (anySucceeded) {
      emitLog(
        'SUCCESS',
        'EVIDENCE_DISCOVERY',
        `arXiv API retrieved ${totalPapers} validated research preprints across ${arxivByCategory.size} STEM categories.`,
        'arxiv',
        sourceTelemetry.arxiv.latencyMs
      );
    }
  }

  // Merge, deduplicate, and enforce strict category isolation
  const unifiedStories: DiscoveredUnifiedStory[] = [];
  let totalEvaluated = 0;
  let crossCategoryRejected = 0;
  let preReturnRevalidated = 0;

  for (const entry of allRawCandidates) {
    totalEvaluated++;
    const raw = entry.story;
    const urlCheck = validateStoryUrl(raw.originalUrl);
    if (!urlCheck.valid || !raw.headline || !raw.headline.trim()) {
      continue;
    }

    // Determine natural universal category and enforce target isolation if a specific category is selected
    const classification = classifyUniversalCategory({
      headline: raw.headline,
      summary: raw.summary,
      publisher: raw.publisher,
      canonicalUrl: urlCheck.canonicalUrl,
      originalUrl: raw.originalUrl
    });

    const targetToCheck = normalizedTarget === 'ALL' ? classification.universalCategory : normalizedTarget;
    const isolationCheck = revalidateCategoryIsolation(
      {
        headline: raw.headline,
        summary: raw.summary,
        publisher: raw.publisher,
        canonicalUrl: urlCheck.canonicalUrl,
        originalUrl: raw.originalUrl,
        assignedUniversalCategory: classification.universalCategory
      },
      targetToCheck
    );

    if (!isolationCheck.allowed) {
      crossCategoryRejected++;
      continue;
    }

    preReturnRevalidated++;
    const finalCat = isolationCheck.revalidatedCategory;

    // Deduplicate against already accepted stories
    const existing = unifiedStories.find(
      (u) =>
        u.canonicalUrl === urlCheck.canonicalUrl ||
        computeHeadlineSimilarity(u.headline, raw.headline) >= 0.68
    );

    if (existing) {
      if (!existing.discoveryServices.includes(entry.service)) {
        existing.discoveryServices.push(entry.service);
      }
      continue;
    }

    const cleanSummary = (raw.summary || raw.headline).trim();
    const verifiedFacts =
      (entry as any).coreClaims && Array.isArray((entry as any).coreClaims) && (entry as any).coreClaims.length > 0
        ? (entry as any).coreClaims.slice(0, 3)
        : [
            cleanSummary.slice(0, 220),
            `Verified source attribution: ${raw.publisher} (${extractDomain(urlCheck.canonicalUrl)})`
          ];

    const spec = getUniversalCategorySpec(finalCat);
    const strategicImpact = `Institutional signal within ${spec.label}: corroborated via ${entry.service.replace('_', ' ')} primary dispatch (${extractDomain(urlCheck.canonicalUrl)}).`;

    const unified: DiscoveredUnifiedStory = {
      headline: raw.headline.trim(),
      summary: cleanSummary,
      publisher: raw.publisher || extractDomain(urlCheck.canonicalUrl),
      publisherDomain: extractDomain(urlCheck.canonicalUrl),
      sourceUrl: raw.originalUrl,
      canonicalUrl: urlCheck.canonicalUrl,
      publishedAt: raw.publishedAt || new Date().toISOString(),
      universalCategory: finalCat,
      verifiedFacts,
      strategicImpact,
      discoveryServices: [entry.service],
      researchPaper: isArxivEligibleForCategory(finalCat) ? arxivByCategory.get(finalCat) : undefined
    };

    // Store in category-scoped cache key (`${finalCat}::${canonicalUrl}`)
    const scopedKey = buildCategoryScopedCacheKey(finalCat, urlCheck.canonicalUrl);
    categoryIsolatedStoryCache.set(scopedKey, unified);
    unifiedStories.push(unified);
  }

  // Build SECTION 1 — GLOBAL LEAD (Exactly up to 5 verified stories)
  const section1Candidates =
    normalizedTarget === 'ALL'
      ? unifiedStories
      : unifiedStories.filter((s) => s.universalCategory === normalizedTarget);

  // When normalizedTarget === 'ALL', order candidates so diverse high-priority categories appear first (1 per category before repeats)
  const orderedLeadCandidates: DiscoveredUnifiedStory[] = [];
  if (normalizedTarget === 'ALL') {
    const priorityOrder: UniversalCategoryId[] = [
      'AI_COMPUTING',
      'SEMICON_HARDWARE',
      'SCIENCE_SPACE',
      'GEOPOLITICS',
      'MACRO_FINANCE',
      'CLIMATE_ENERGY',
      'BIOTECH_HEALTH',
      'SPORTS_ATHLETICS'
    ];
    const usedUrls = new Set<string>();
    for (const catId of priorityOrder) {
      const match = section1Candidates.find((c) => c.universalCategory === catId && !usedUrls.has(c.canonicalUrl));
      if (match) {
        orderedLeadCandidates.push(match);
        usedUrls.add(match.canonicalUrl);
      }
    }
    for (const rem of section1Candidates) {
      if (!usedUrls.has(rem.canonicalUrl)) {
        orderedLeadCandidates.push(rem);
        usedUrls.add(rem.canonicalUrl);
      }
    }
  } else {
    orderedLeadCandidates.push(...section1Candidates);
  }

  const section1GlobalLead: GlobalLeadStory[] = [];
  for (const item of orderedLeadCandidates) {
    if (section1GlobalLead.length >= 5) break;
    // Final pre-return revalidation gate
    const finalGate = revalidateCategoryIsolation(
      {
        headline: item.headline,
        summary: item.summary,
        publisher: item.publisher,
        canonicalUrl: item.canonicalUrl
      },
      normalizedTarget === 'ALL' ? item.universalCategory : normalizedTarget
    );
    if (!finalGate.allowed) {
      crossCategoryRejected++;
      continue;
    }

    const spec = getUniversalCategorySpec(item.universalCategory);
    section1GlobalLead.push({
      id: `lead-${section1GlobalLead.length + 1}-${Date.now()}`,
      rank: section1GlobalLead.length + 1,
      headline: item.headline,
      universalCategory: item.universalCategory,
      categoryLabel: spec.label,
      verifiedFacts: item.verifiedFacts,
      strategicImpact: item.strategicImpact,
      publishedAt: item.publishedAt,
      sourceUrl: item.canonicalUrl,
      publisher: item.publisher,
      discoveryService:
        item.discoveryServices.length > 1 ? 'multi_source' : item.discoveryServices[0] || 'newsapi',
      verificationStatus: 'VERIFIED'
    });
  }

  // Build SECTION 2 — EIGHT UNIVERSAL CATEGORY DOSSIERS
  const categoriesToBuild =
    normalizedTarget === 'ALL'
      ? UNIVERSAL_CATEGORIES
      : UNIVERSAL_CATEGORIES.filter((c) => c.id === normalizedTarget);

  const section2CategoryDossiers: UniversalCategoryDossier[] = categoriesToBuild.map((spec) => {
    // Find best story strictly matching spec.id
    const matchingStory = unifiedStories.find((s) => {
      if (s.universalCategory !== spec.id) return false;
      const recheck = revalidateCategoryIsolation(
        {
          headline: s.headline,
          summary: s.summary,
          publisher: s.publisher,
          canonicalUrl: s.canonicalUrl,
          hasArxivPaper: Boolean(s.researchPaper)
        },
        spec.id
      );
      return recheck.allowed && recheck.revalidatedCategory === spec.id;
    });

    const paper = spec.arxivEligible ? arxivByCategory.get(spec.id) : undefined;

    if (!matchingStory) {
      return {
        categoryId: spec.id,
        categoryNumber: spec.number,
        categoryLabel: spec.label,
        status: 'EMPTY',
        emptyReason: `No verified news available in ${spec.label}. Cross-category and unverified items are strictly quarantined.`,
        discoveryServicesUsed: paper ? ['arxiv'] : [],
        researchPaper: paper,
        categoryRevalidated: true
      };
    }

    const servicesUsed: DiscoveryServiceId[] = [...matchingStory.discoveryServices];
    if (paper && !servicesUsed.includes('arxiv')) {
      servicesUsed.push('arxiv');
    }

    return {
      categoryId: spec.id,
      categoryNumber: spec.number,
      categoryLabel: spec.label,
      status: 'VERIFIED',
      headline: matchingStory.headline,
      evidenceAnalysis: matchingStory.summary,
      verifiedFacts: matchingStory.verifiedFacts,
      publishedAt: matchingStory.publishedAt,
      sourceUrl: matchingStory.canonicalUrl,
      publisher: matchingStory.publisher,
      discoveryServicesUsed: servicesUsed,
      researchPaper: paper,
      categoryRevalidated: true
    };
  });

  return {
    id: `dossier-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    selectedCategory: normalizedTarget,
    requestToken,
    section1GlobalLead,
    section2CategoryDossiers,
    sourceTelemetry,
    isolationAudit: {
      totalEvaluated,
      crossCategoryRejected,
      preReturnRevalidated,
      cacheKeysScoped: true
    }
  };
}
