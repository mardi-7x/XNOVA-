export type ProviderName = 'newsapi' | 'tavily' | 'gemini' | 'groq' | 'openrouter';

export type ProviderStatusType =
  | 'CONFIGURED'
  | 'CHECKING'
  | 'HEALTHY'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'OFFLINE'
  | 'NO_KEY';

export interface ProviderHealth {
  id: ProviderName;
  name: string;
  role: string;
  status: ProviderStatusType;
  keyConfigured: boolean;
  keyMasked: string;
  latencyMs: number;
  lastCheck: string;
  errorMessage?: string;
  modelUsed?: string;
  errorCode?: string;
  quotaResetHint?: string;
}

export type VerificationStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'PARTIALLY_SUPPORTED'
  | 'CONFLICTING'
  | 'DISPUTED'
  | 'NEEDS_REVIEW'
  | 'UNVERIFIED'
  | 'REJECTED';

export type PipelineStatus = 'IDLE' | 'RUNNING' | 'HEALTHY' | 'DEGRADED' | 'FAILED';

export type XnovaCategory =
  | 'World'
  | 'Politics'
  | 'Geopolitics'
  | 'Business'
  | 'Finance'
  | 'Tech'
  | 'AI'
  | 'Science'
  | 'Space'
  | 'Semiconductors'
  | 'Robotics'
  | 'Cybersecurity'
  | 'Big Tech'
  | 'Startups'
  | 'Health'
  | 'Environment'
  | 'Sports'
  | 'Entertainment'
  | 'Education'
  | 'General';

export interface EvidenceItem {
  id: string;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  publishedAt?: string;
  retrievedAt?: string;
  isIndependent: boolean;
  isSyndicatedCopy?: boolean;
  stance: 'supports' | 'disputes' | 'neutral';
  relevanceScore: number;
}

export interface NemotronVerificationDetails {
  status: VerificationStatus;
  claimsChecked: string[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  sourceUrlsSupplied?: string[];
  sourceUrls?: string[];
  corroborationScore?: number;
  missingEvidence?: string | string[];
  rationale: string;
  verificationTimestamp?: string;
  timestamp?: string;
}

export type UniversalCategoryId =
  | 'GEOPOLITICS'
  | 'MACRO_FINANCE'
  | 'AI_COMPUTING'
  | 'SEMICON_HARDWARE'
  | 'SCIENCE_SPACE'
  | 'CLIMATE_ENERGY'
  | 'BIOTECH_HEALTH'
  | 'SPORTS_ATHLETICS';

export interface UniversalCategorySpec {
  id: UniversalCategoryId;
  number: number;
  label: string;
  shortLabel: string;
  legacyEquivalent: XnovaCategory;
  arxivEligible: boolean;
  arxivQuery?: string;
}

export interface ArxivPaperMetadata {
  id: string;
  title: string;
  authors: string[];
  publishedAt: string;
  abstract: string;
  canonicalUrl: string;
  pdfUrl?: string;
  primaryCategory?: string;
  isPreprint: true;
  preprintLabel: string;
}

export type DiscoveryServiceId = 'gemini_grounding' | 'newsapi' | 'tavily' | 'arxiv';

export interface GlobalLeadStory {
  id: string;
  rank: number;
  headline: string;
  universalCategory: UniversalCategoryId;
  categoryLabel: string;
  verifiedFacts: string[];
  strategicImpact: string;
  publishedAt: string;
  sourceUrl: string;
  publisher: string;
  discoveryService: DiscoveryServiceId | 'multi_source';
  verificationStatus: VerificationStatus;
}

export interface UniversalCategoryDossier {
  categoryId: UniversalCategoryId;
  categoryNumber: number;
  categoryLabel: string;
  status: 'VERIFIED' | 'EMPTY';
  emptyReason?: string;
  headline?: string;
  evidenceAnalysis?: string;
  verifiedFacts?: string[];
  publishedAt?: string;
  sourceUrl?: string;
  publisher?: string;
  discoveryServicesUsed: DiscoveryServiceId[];
  researchPaper?: ArxivPaperMetadata;
  categoryRevalidated: boolean;
}

export interface SourceDiscoveryTelemetry {
  geminiGrounding: {
    attempted: boolean;
    succeeded: boolean;
    storiesFound: number;
    latencyMs: number;
    keyUsed: string;
    error?: string;
  };
  newsapi: {
    attempted: boolean;
    succeeded: boolean;
    storiesFound: number;
    latencyMs: number;
    error?: string;
  };
  tavily: {
    attempted: boolean;
    succeeded: boolean;
    storiesFound: number;
    latencyMs: number;
    error?: string;
  };
  arxiv: {
    attempted: boolean;
    succeeded: boolean;
    papersFound: number;
    latencyMs: number;
    error?: string;
  };
}

export interface ExecutiveIntelligenceDossier {
  id: string;
  generatedAt: string;
  selectedCategory: UniversalCategoryId | 'ALL';
  requestToken: string;
  section1GlobalLead: GlobalLeadStory[];
  section2CategoryDossiers: UniversalCategoryDossier[];
  sourceTelemetry: SourceDiscoveryTelemetry;
  isolationAudit: {
    totalEvaluated: number;
    crossCategoryRejected: number;
    preReturnRevalidated: number;
    cacheKeysScoped: boolean;
  };
}

export interface VerificationLedgerItem {
  id: string;
  headline: string;
  publisher: string;
  publisherDomain: string;
  originalUrl: string;
  canonicalUrl: string;
  publishedAt: string;
  retrievedAt?: string;
  category: XnovaCategory;
  universalCategory?: UniversalCategoryId;
  secondaryCategory?: XnovaCategory;
  isDualRelevant?: boolean;
  classificationMethod?: string;
  summary: string;
  coreClaims: string[];
  entities?: string[];
  importantNumbers?: string[];
  flags?: {
    unsupportedClaims: boolean;
    staleStory: boolean;
    missingSources: boolean;
    conflictingInfo: boolean;
  };
  evidenceUrls: string[];
  evidenceList: EvidenceItem[];
  verificationStatus: VerificationStatus;
  extractionProvider?: string;
  verificationProvider?: string;
  processingProvider: string;
  rejectionOrReviewReasons: string[];
  discrepancyNotes?: string[];
  nemotronVerification?: NemotronVerificationDetails;
  researchPaper?: ArxivPaperMetadata;
  discoveryServicesUsed?: DiscoveryServiceId[];
  independentSourceCount: number;
  corroborationScore: number;
  isWithinRollingWindow: boolean;
  syndicatedDuplicateCount: number;
  duplicateOfId?: string;
  published?: boolean;
  cachedHit?: boolean;
  approximateCost?: number;
  rawAuditTrail: {
    timestamp: string;
    step: string;
    detail: string;
  }[];
}

export interface DailyVerificationTrendPoint {
  date: string;
  dayLabel: string;
  verified: number;
  disputed: number;
  partiallyVerified: number;
  unverified: number;
}

export interface StageDiagnostics {
  sourceCollection: {
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'IDLE';
    storiesFetched: number;
    latencyMs: number;
    errorCount: number;
    message: string;
  };
  deduplication: {
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'IDLE';
    uniqueRemaining: number;
    duplicatesRejected: number;
    invalidUrlsRejected: number;
  };
  groqProcessing: {
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'IDLE';
    succeeded: number;
    failed: number;
    cacheHits: number;
    latencyMs: number;
    rateLimitErrors: number;
    modelUsed: string;
    approximateCost?: number;
  };
  openRouterVerification: {
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'IDLE';
    succeeded: number;
    failed: number;
    latencyMs: number;
    rateLimitErrors: number;
    modelUsed: string;
    approximateCost?: number;
  };
  publication: {
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'IDLE';
    dryRun: boolean;
    publishedCount: number;
    heldCount: number;
    rejectedCount: number;
  };
}

export interface PipelineRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: PipelineStatus;
  dryRun?: boolean;
  windowHours: number;
  selectedCategory?: string;
  requestToken?: string;
  articlesCollected: number;
  uniqueArticles: number;
  duplicatesRemoved: number;
  invalidUrlsRejected?: number;
  crossCategoryRejected?: number;
  verifiedCount: number;
  partiallyVerifiedCount?: number;
  partiallySupportedCount: number;
  conflictingCount?: number;
  disputedCount: number;
  needsReviewCount: number;
  unverifiedCount: number;
  rejectedCount?: number;
  publishedCount?: number;
  cacheHits?: number;
  activeProvider: string;
  extractionEngine?: string;
  verificationEngine?: string;
  isLiveData: boolean;
  executionDurationMs: number;
  totalApproximateCost?: number;
  stageDiagnostics?: StageDiagnostics;
  sevenDayTrend?: DailyVerificationTrendPoint[];
  executiveDossier?: ExecutiveIntelligenceDossier;
  ledger: VerificationLedgerItem[];
}

export interface PipelineLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  stage:
    | 'INGEST'
    | 'DEDUPE'
    | 'WINDOW_FILTER'
    | 'EVIDENCE_DISCOVERY'
    | 'GROQ_EXTRACTION'
    | 'OPENROUTER_VERIFICATION'
    | 'SYNTHESIS'
    | 'LEDGER';
  message: string;
  provider?: string;
  latencyMs?: number;
  retryCount?: number;
}

export interface PipelineConfig {
  rollingWindowHours: number;
  category: string;
  customQuery?: string;
  dryRun?: boolean;
  batchSize?: number;
  concurrencyLimit?: number;
  enableStrictIndependence: boolean;
  minIndependentSources: number;
}
