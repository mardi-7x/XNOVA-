import {
  UniversalCategoryId,
  UniversalCategorySpec,
  XnovaCategory
} from '../types/pipeline';
import {
  ArticleClassificationInput,
  classifyArticleCategoryWithRules,
  isDeterministicSportsStory,
  isDeterministicBusinessOrFinanceStory
} from './categoryClassifier';

export const UNIVERSAL_CATEGORIES: UniversalCategorySpec[] = [
  {
    id: 'GEOPOLITICS',
    number: 1,
    label: 'Geopolitics & Global Affairs',
    shortLabel: 'Geopolitics',
    legacyEquivalent: 'Geopolitics',
    arxivEligible: false
  },
  {
    id: 'MACRO_FINANCE',
    number: 2,
    label: 'Macroeconomics, Business & Finance',
    shortLabel: 'Macro & Finance',
    legacyEquivalent: 'Business',
    arxivEligible: false
  },
  {
    id: 'AI_COMPUTING',
    number: 3,
    label: 'Deep-Tech, AI & Computing',
    shortLabel: 'AI & Computing',
    legacyEquivalent: 'AI',
    arxivEligible: true,
    arxivQuery: 'cat:cs.AI OR cat:cs.LG OR cat:cs.CL'
  },
  {
    id: 'SEMICON_HARDWARE',
    number: 4,
    label: 'Semiconductors, Hardware & Robotics',
    shortLabel: 'Semicon & Robotics',
    legacyEquivalent: 'Semiconductors',
    arxivEligible: true,
    arxivQuery: 'cat:cs.RO OR cat:cs.AR OR all:semiconductor'
  },
  {
    id: 'SCIENCE_SPACE',
    number: 5,
    label: 'Fundamental Science & Space',
    shortLabel: 'Science & Space',
    legacyEquivalent: 'Space',
    arxivEligible: true,
    arxivQuery: 'cat:astro-ph OR cat:quant-ph OR cat:physics.space-ph'
  },
  {
    id: 'CLIMATE_ENERGY',
    number: 6,
    label: 'Climate, Energy & Environment',
    shortLabel: 'Climate & Energy',
    legacyEquivalent: 'Environment',
    arxivEligible: true,
    arxivQuery: 'cat:physics.ao-ph OR all:"nuclear fusion" OR all:"renewable energy"'
  },
  {
    id: 'BIOTECH_HEALTH',
    number: 7,
    label: 'Bio-Tech, Medicine & Health',
    shortLabel: 'Bio-Tech & Health',
    legacyEquivalent: 'Health',
    arxivEligible: true,
    arxivQuery: 'cat:q-bio.BM OR cat:q-bio.GN OR all:CRISPR'
  },
  {
    id: 'SPORTS_ATHLETICS',
    number: 8,
    label: 'Sports & Athletics',
    shortLabel: 'Sports & Athletics',
    legacyEquivalent: 'Sports',
    arxivEligible: false
  }
];

export function getUniversalCategorySpec(id: UniversalCategoryId): UniversalCategorySpec {
  return UNIVERSAL_CATEGORIES.find((c) => c.id === id) || UNIVERSAL_CATEGORIES[0];
}

export function normalizeToUniversalCategory(input?: string): UniversalCategoryId | 'ALL' {
  if (!input || typeof input !== 'string') return 'ALL';
  const clean = input.trim().toUpperCase().replace(/[\s&-]+/g, '_');

  if (clean === 'ALL' || clean === 'ALL_WORLD_NEWS') return 'ALL';

  const directIds: UniversalCategoryId[] = [
    'GEOPOLITICS',
    'MACRO_FINANCE',
    'AI_COMPUTING',
    'SEMICON_HARDWARE',
    'SCIENCE_SPACE',
    'CLIMATE_ENERGY',
    'BIOTECH_HEALTH',
    'SPORTS_ATHLETICS'
  ];
  if (directIds.includes(clean as UniversalCategoryId)) {
    return clean as UniversalCategoryId;
  }

  const lower = input.trim().toLowerCase();
  if (
    lower.includes('geopolitic') ||
    lower === 'world' ||
    lower === 'politics' ||
    lower.includes('global affairs') ||
    lower.includes('diplomacy')
  ) {
    return 'GEOPOLITICS';
  }
  if (
    lower.includes('macro') ||
    lower.includes('business') ||
    lower.includes('finance') ||
    lower.includes('economy') ||
    lower.includes('market') ||
    lower.includes('startups')
  ) {
    return 'MACRO_FINANCE';
  }
  if (
    lower === 'ai' ||
    lower.includes('ai_computing') ||
    lower.includes('deep-tech') ||
    lower.includes('computing') ||
    lower.includes('cybersecurity') ||
    lower === 'technology' ||
    lower === 'tech' ||
    lower === 'big tech'
  ) {
    return 'AI_COMPUTING';
  }
  if (
    lower.includes('semicon') ||
    lower.includes('hardware') ||
    lower.includes('robot') ||
    lower.includes('chip')
  ) {
    return 'SEMICON_HARDWARE';
  }
  if (
    lower.includes('science') ||
    lower.includes('space') ||
    lower.includes('astronomy') ||
    lower.includes('physics')
  ) {
    return 'SCIENCE_SPACE';
  }
  if (
    lower.includes('climate') ||
    lower.includes('energy') ||
    lower.includes('environment')
  ) {
    return 'CLIMATE_ENERGY';
  }
  if (
    lower.includes('bio') ||
    lower.includes('health') ||
    lower.includes('medicine') ||
    lower.includes('medical')
  ) {
    return 'BIOTECH_HEALTH';
  }
  if (lower.includes('sport') || lower.includes('athletic')) {
    return 'SPORTS_ATHLETICS';
  }

  return 'ALL';
}

export function isArxivEligibleForCategory(category: UniversalCategoryId | string): boolean {
  const norm = normalizeToUniversalCategory(category);
  if (norm === 'ALL') return false;
  const spec = getUniversalCategorySpec(norm);
  return spec.arxivEligible;
}

export function mapXnovaToUniversalCategory(
  cat: XnovaCategory,
  headline = '',
  summary = ''
): UniversalCategoryId {
  const text = `${headline} ${summary}`.toLowerCase();

  switch (cat) {
    case 'Sports':
      return 'SPORTS_ATHLETICS';
    case 'Business':
    case 'Finance':
    case 'Startups':
      return 'MACRO_FINANCE';
    case 'Semiconductors':
    case 'Robotics':
      return 'SEMICON_HARDWARE';
    case 'AI':
    case 'Cybersecurity':
      return 'AI_COMPUTING';
    case 'Tech':
    case 'Big Tech':
      if (/\b(tsmc|asml|wafer|chip|semiconductor|gpu|robotics|humanoid|actuator|quantum chip)\b/i.test(text)) {
        return 'SEMICON_HARDWARE';
      }
      return 'AI_COMPUTING';
    case 'Space':
    case 'Science':
      if (/\b(climate change|carbon emissions|solar farm|solar capacity|offshore wind|nuclear fusion|grid battery|carbon capture|renewable energy|decarbonization)\b/i.test(text)) {
        return 'CLIMATE_ENERGY';
      }
      if (/\b(crispr|gene|mrna|clinical trial|oncology|vaccine|biotech|longevity|pathogen)\b/i.test(text)) {
        return 'BIOTECH_HEALTH';
      }
      return 'SCIENCE_SPACE';
    case 'Environment':
      return 'CLIMATE_ENERGY';
    case 'Health':
      return 'BIOTECH_HEALTH';
    case 'Geopolitics':
    case 'Politics':
    case 'World':
    default:
      if (/\b(nuclear fusion|grid battery|carbon tax|renewable grid|solar farm|offshore wind)\b/i.test(text)) {
        return 'CLIMATE_ENERGY';
      }
      return 'GEOPOLITICS';
  }
}

export function classifyUniversalCategory(input: ArticleClassificationInput): {
  universalCategory: UniversalCategoryId;
  xnovaCategory: XnovaCategory;
  confidence: number;
  rationale: string;
} {
  const headline = (input.headline || '').trim();
  const summary = (input.summary || '').trim();
  const text = `${headline} ${summary}`.toLowerCase();

  // Check explicit Macroeconomics, Business & Finance (when no sports league/roster is present)
  if (
    /\b(federal reserve|central bank|interest rate|cpi inflation|gdp growth|quarterly earnings|q[1-4] earnings|corporate earnings|bond yields|treasury yields|s&p 500|nasdaq|mergers and acquisitions|private equity buyout|stock-split|stock split|share price|wall street analyst|credit gap|finance banks)\b/i.test(
      text
    ) &&
    !isDeterministicSportsStory(headline, summary, input.canonicalUrl, input.publisher).isSports
  ) {
    return {
      universalCategory: 'MACRO_FINANCE',
      xnovaCategory: 'Finance',
      confidence: 0.96,
      rationale: 'Macroeconomics, central bank policy, capital markets, or corporate earnings.'
    };
  }

  // Check explicit Climate/Energy before generic Science
  if (
    /\b(nuclear fusion|tokamak|iter|grid-scale battery|renewable energy|carbon capture|solar capacity|offshore wind|green hydrogen|climate summit|decarbonization|climate change|emissions reduction)\b/i.test(
      headline
    ) ||
    (/\b(nuclear fusion|tokamak|iter|grid-scale battery|carbon capture|green hydrogen|decarbonization)\b/i.test(text) && !/\b(eviction|tenants|prince|duchy|royal)\b/i.test(text))
  ) {
    if (
      !isDeterministicSportsStory(headline, summary, input.canonicalUrl, input.publisher).isSports
    ) {
      return {
        universalCategory: 'CLIMATE_ENERGY',
      xnovaCategory: 'Environment',
      confidence: 0.95,
      rationale: 'Climate, nuclear fusion, energy transition, or environmental systems.'
      };
    }
  }

  // Check explicit Bio-Tech/Health
  if (
    /\b(crispr|gene editing|mrna|phase [123] trial|fda approval|clinical trial|oncology|alzheimer|biotech|pathogen|pandemic|vaccine|monoclonal|protein folding)\b/i.test(
      text
    ) &&
    !isDeterministicSportsStory(headline, summary, input.canonicalUrl, input.publisher).isSports
  ) {
    return {
      universalCategory: 'BIOTECH_HEALTH',
      xnovaCategory: 'Health',
      confidence: 0.95,
      rationale: 'Bio-technology, clinical medicine, genomics, or pharmaceutical research.'
    };
  }

  // Check explicit Semiconductors, Hardware & Robotics
  if (
    /\b(tsmc|asml|euv lithography|semiconductor|wafer|foundry|hbm3|hbm4|blackwell gpu|humanoid robot|boston dynamics|bipedal|quantum processor|chip fabrication|nm node)\b/i.test(
      text
    ) &&
    !isDeterministicSportsStory(headline, summary, input.canonicalUrl, input.publisher).isSports
  ) {
    return {
      universalCategory: 'SEMICON_HARDWARE',
      xnovaCategory: 'Semiconductors',
      confidence: 0.96,
      rationale: 'Semiconductor fabrication, compute hardware, quantum chips, or robotics.'
    };
  }

  // Check explicit Fundamental Science & Space
  if (
    /\b(nasa|isro|esa|spacex|james webb|jwst|exoplanet|astrophysics|lunar mission|mars rover|artemis|cern|particle accelerator|superconductor|orbital launch|gravitational wave)\b/i.test(
      text
    ) &&
    !isDeterministicSportsStory(headline, summary, input.canonicalUrl, input.publisher).isSports
  ) {
    return {
      universalCategory: 'SCIENCE_SPACE',
      xnovaCategory: 'Space',
      confidence: 0.96,
      rationale: 'Space mission, astrophysics, orbital launch, or fundamental physics.'
    };
  }

  // Check explicit Deep-Tech, AI & Computing
  if (
    /\b(large language model|llm|openai|anthropic|deepmind|neural network|transformer architecture|zero-day|ransomware|cyberattack|cve-\d+|cloud compute|inference engine|ai agent)\b/i.test(
      text
    ) &&
    !isDeterministicSportsStory(headline, summary, input.canonicalUrl, input.publisher).isSports
  ) {
    return {
      universalCategory: 'AI_COMPUTING',
      xnovaCategory: 'AI',
      confidence: 0.95,
      rationale: 'AI architecture, software algorithm, cloud compute, or cybersecurity.'
    };
  }

  // Delegate to base deterministic-first classifier for Sports, Business/Finance, Geopolitics, etc.
  const baseResult = classifyArticleCategoryWithRules(input);
  const universalCategory = mapXnovaToUniversalCategory(baseResult.category, headline, summary);

  return {
    universalCategory,
    xnovaCategory: baseResult.category,
    confidence: baseResult.confidence,
    rationale: baseResult.rationale
  };
}

/**
 * STRICT DOMAIN BOUNDARY & ZERO-BLEED QUARANTINE VALIDATOR
 * Revalidates a story immediately before returning from the backend or rendering in the UI.
 * Rejects any cross-category contamination.
 */
export function revalidateCategoryIsolation(
  story: {
    headline: string;
    summary?: string;
    publisher?: string;
    canonicalUrl?: string;
    originalUrl?: string;
    assignedUniversalCategory?: UniversalCategoryId;
    hasArxivPaper?: boolean;
  },
  targetCategory: UniversalCategoryId | 'ALL' | string
): {
  allowed: boolean;
  revalidatedCategory: UniversalCategoryId;
  xnovaCategory: XnovaCategory;
  rejectionReason?: string;
} {
  const normalizedTarget = normalizeToUniversalCategory(targetCategory);
  const headline = (story.headline || '').trim();
  const summary = (story.summary || '').trim();
  const url = story.canonicalUrl || story.originalUrl || '';
  const publisher = story.publisher || '';
  const text = `${headline} ${summary}`.toLowerCase();

  const classification = classifyUniversalCategory({
    headline,
    summary,
    publisher,
    canonicalUrl: url,
    originalUrl: url
  });

  const revalidatedCategory = classification.universalCategory;

  // Rule 1: arXiv papers must NEVER appear in Sports, Geopolitics, or Macro/Finance
  if (story.hasArxivPaper && !isArxivEligibleForCategory(revalidatedCategory)) {
    return {
      allowed: false,
      revalidatedCategory,
      xnovaCategory: classification.xnovaCategory,
      rejectionReason: `QUARANTINE_VIOLATION: arXiv research papers are forbidden in ${revalidatedCategory}.`
    };
  }

  if (normalizedTarget === 'ALL') {
    return {
      allowed: true,
      revalidatedCategory,
      xnovaCategory: classification.xnovaCategory
    };
  }

  // Rule 2: ABSOLUTE SPORTS QUARANTINE
  if (normalizedTarget === 'SPORTS_ATHLETICS') {
    const sportsCheck = isDeterministicSportsStory(headline, summary, url, publisher);
    const bizCheck = isDeterministicBusinessOrFinanceStory(headline, summary, url, publisher);

    const hasForbiddenNonSports =
      /\b(quarterly earnings|q[1-4] revenue|ebitda|balance sheet|stock market|s&p 500|nasdaq|central bank|interest rate|inflation|gdp|merger and acquisition|private equity buyout|ipo|sponsorship deal|arxiv|preprint|nasa|spacex|james webb|tsmc|semiconductor|llm|openai)\b/i.test(
        text
      );

    if (
      !sportsCheck.isSports ||
      bizCheck.isBusinessOrFinance ||
      hasForbiddenNonSports ||
      revalidatedCategory !== 'SPORTS_ATHLETICS'
    ) {
      return {
        allowed: false,
        revalidatedCategory,
        xnovaCategory: classification.xnovaCategory,
        rejectionReason: `SPORTS_QUARANTINE_REJECTED: Story classified as [${revalidatedCategory}] (${classification.rationale}) cannot enter SPORTS_ATHLETICS.`
      };
    }
  }

  // Rule 3: ABSOLUTE MACRO_FINANCE QUARANTINE (No sports match results, no pure space/science without financial nexus)
  if (normalizedTarget === 'MACRO_FINANCE') {
    const sportsCheck = isDeterministicSportsStory(headline, summary, url, publisher);
    if (sportsCheck.isSports || revalidatedCategory !== 'MACRO_FINANCE') {
      return {
        allowed: false,
        revalidatedCategory,
        xnovaCategory: classification.xnovaCategory,
        rejectionReason: `MACRO_FINANCE_QUARANTINE_REJECTED: Story classified as [${revalidatedCategory}] cannot enter MACRO_FINANCE.`
      };
    }
  }

  // Rule 4: Universal strict match check for all 8 categories
  if (revalidatedCategory !== normalizedTarget) {
    return {
      allowed: false,
      revalidatedCategory,
      xnovaCategory: classification.xnovaCategory,
      rejectionReason: `CATEGORY_ISOLATION_MISMATCH: Requested [${normalizedTarget}], but story revalidated as [${revalidatedCategory}] (${classification.rationale}).`
    };
  }

  return {
    allowed: true,
    revalidatedCategory,
    xnovaCategory: classification.xnovaCategory
  };
}

/**
 * Builds a category-scoped cache key so cached responses from one category
 * can NEVER bleed into another category.
 */
export function buildCategoryScopedCacheKey(
  category: UniversalCategoryId | 'ALL' | string,
  canonicalUrl: string
): string {
  const normCat = normalizeToUniversalCategory(category);
  return `${normCat}::${canonicalUrl.trim().toLowerCase()}`;
}
