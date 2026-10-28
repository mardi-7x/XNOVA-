import { XnovaCategory } from '../types/pipeline';

// ---------------------------------------------------------------------------
// DATA CONTRACTS & INTERFACES
// ---------------------------------------------------------------------------
export interface ArticleClassificationInput {
  headline: string;
  summary?: string;
  publisher?: string;
  publisherDomain?: string;
  originalUrl?: string;
  canonicalUrl?: string;
  aiSuggestedCategory?: string;
}

export interface CategoryClassificationResult {
  category: XnovaCategory;
  secondaryCategory?: XnovaCategory;
  isDualRelevant: boolean;
  method: 'deterministic-metadata' | 'deterministic-rules' | 'ai-model' | 'ai-model-guarded' | 'fallback';
  confidence: number;
  rationale: string;
}

// ---------------------------------------------------------------------------
// PUBLISHER & METADATA DOMAIN LISTS
// ---------------------------------------------------------------------------
const DEDICATED_SPORTS_DOMAINS = new Set([
  'espn.com',
  'espncricinfo.com',
  'cricinfo.com',
  'skysports.com',
  'theathletic.com',
  'bleacherreport.com',
  'marca.com',
  'as.com',
  'lequipe.fr',
  'goal.com',
  'cbsports.com',
  'foxsports.com',
  'si.com',
  'sportsillustrated.com',
  'eurosport.com',
  'motorsport.com',
  'nba.com',
  'nfl.com',
  'mlb.com',
  'nhl.com',
  'fifa.com',
  'uefa.com',
  'pgatour.com',
  'atptour.com',
  'wtatennis.com',
  'olympics.com',
  'bbc.co.uk/sport',
  'bbc.com/sport'
]);

const DEDICATED_BUSINESS_FINANCE_DOMAINS = new Set([
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'cnbc.com',
  'forbes.com',
  'fortune.com',
  'businessinsider.com',
  'barrons.com',
  'marketwatch.com',
  'investing.com',
  'economist.com',
  'fool.com',
  'reuters.com/business',
  'reuters.com/markets'
]);

const SPORTS_URL_PATH_REGEX =
  /\/(sport|sports|football|soccer|cricket|basketball|nba|nfl|tennis|golf|athletics|formula1|f1|mlb|nhl|boxing|mma|ufc|rugby|premier-league|champions-league|laliga|serie-a|bundesliga)\b/i;

const BUSINESS_URL_PATH_REGEX =
  /\/(business|markets|economy|finance|investing|corporate|earnings|macroeconomics|wall-street)\b/i;

// ---------------------------------------------------------------------------
// DOMAIN-SPECIFIC CONTENT REGEXES
// ---------------------------------------------------------------------------

// 1. Hard Sports Markers: Matches, Scores, Athletes, Tournaments, Rosters
const SPORTS_MATCH_RESULT_REGEX =
  /\b(beats?|defeated?|defeats|draws?|scores?|halftime|final whistle|penalty shootout|point margin|championship match|won \d+-\d+|lost \d+-\d+|edged out|shutout|rout|game [1-7]|scored \d+ goals?|clean sheet|grand slam title)\b/i;

const SPORTS_TOURNAMENTS_LEAGUES_REGEX =
  /\b(premier league|champions league|bundesliga|la liga|serie a|ligue 1|fifa|world cup|uefa euro|copa america|nba|nfl|mlb|nhl|wimbledon|us open|french open|australian open|olympics|paralympics|ipl|t20|super bowl|stanley cup|world series|formula 1|grand prix|ryder cup|pga tour|ufc|mma|boxing title|golden boot|ballon d'or)\b/i;

const SPORTS_ROSTER_TRANSFER_REGEX =
  /\b(striker|goalkeeper|quarterback|pitcher|point guard|center back|midfielder|winger|batsman|bowler|wicketkeeper|head coach|manager sacked|player transfer|transfer fee|loan signing|signed striker|contract extension|player trade|draft pick|free agent|roster move|transfer window|release clause|signing bonus)\b/i;

// 2. Athletic Wear / Sports Equipment Corporate Entities
const SPORTS_CORPORATE_BRANDS_REGEX =
  /\b(nike|adidas|puma|under armour|lululemon|asics|reebok|new balance|fanatics|callaway|spalding)\b/i;

// 3. Corporate Earnings & Commercial Finance
const CORPORATE_EARNINGS_REGEX =
  /\b(q[1-4] earnings|quarterly revenue|quarterly profit|operating profit|net income|fiscal year results|earnings beat|earnings miss|revenue rose|revenue fell|ebitda|gross margin|earnings per share|eps|profit margin|guidance raised|guidance lowered)\b/i;

const CORPORATE_MA_ACQUISITION_REGEX =
  /\b(private equity|merger and acquisition|m&a|takeover|buyout|acquisition of|majority stake|minority stake|equity purchase|equity stake|commercial transaction|consortium acquires|bought minority|bought majority|takeover acquisition)\b/i;

const CORPORATE_SPONSORSHIP_REGEX =
  /\b(sponsorship deal|title sponsor|commercial partnership|marketing rights|naming rights|sponsorship agreement)\b/i;

const MACRO_ECONOMICS_REGEX =
  /\b(gdp growth|retail sales|inflation cooled|inflation rose|cpi data|consumer price index|supply chain disruption|trade deficit|tariffs? imposed|import duties|unemployment rate|central bank interest rate|monetary policy|recession risk)\b/i;

const CAPITAL_MARKETS_FINANCE_REGEX =
  /\b(wall street|nasdaq|s&p 500|dow jones|central bank|federal reserve|fed rate|interest rate hike|interest rate cut|bond yields?|treasury yields?|forex|yield curve)\b/i;

// ---------------------------------------------------------------------------
// DETERMINISTIC CLASSIFICATION LOGIC
// ---------------------------------------------------------------------------

/**
 * Deterministically checks if an article is strictly a Sports story.
 * Includes matches, scores, tournament results, athlete transfers, and player contracts.
 */
export function isDeterministicSportsStory(
  headline: string,
  summary: string,
  url = '',
  publisher = ''
): { isSports: boolean; isEarnings: boolean; isFranchiseAcquisition: boolean; isSponsorship: boolean; rationale: string } {
  const text = `${headline} ${summary}`.toLowerCase();
  const urlLower = url.toLowerCase();
  const pubLower = publisher.toLowerCase();

  const hasEarnings = CORPORATE_EARNINGS_REGEX.test(text);
  const hasSportsBrand = SPORTS_CORPORATE_BRANDS_REGEX.test(text);
  const hasFranchiseAcquisition =
    (CORPORATE_MA_ACQUISITION_REGEX.test(text) || /\b(takeover|buyout|purchased?|bought|acquires?|acquisition)\b/i.test(text)) &&
    /\b(club|team|franchise|fc\b|united|rovers|serie a|nba|nfl|premier league|mlb|nhl)\b/i.test(text) &&
    /\b(\$\d+(?:\.\d+)?\s*(?:b|m|billion|million)|private equity|investor group|consortium|billionaire|takeover|buyout)\b/i.test(text) &&
    !SPORTS_MATCH_RESULT_REGEX.test(text);

  const hasSponsorship =
    CORPORATE_SPONSORSHIP_REGEX.test(text) &&
    /\b(\$\d+(?:\.\d+)?\s*(?:b|m|billion|million)|multi-year|commercial enterprise|enterprise partnership)\b/i.test(text) &&
    !SPORTS_MATCH_RESULT_REGEX.test(text);

  // If it's a corporate earnings report of a sports brand (e.g. Nike Q4 earnings)
  if (hasEarnings && hasSportsBrand && !SPORTS_MATCH_RESULT_REGEX.test(text)) {
    return {
      isSports: false,
      isEarnings: true,
      isFranchiseAcquisition: false,
      isSponsorship: false,
      rationale: 'Corporate financial quarterly earnings report for an athletic apparel corporation.'
    };
  }

  // If it's a multi-million/billion corporate franchise buyout by private equity / investors
  if (hasFranchiseAcquisition) {
    return {
      isSports: false,
      isEarnings: false,
      isFranchiseAcquisition: true,
      isSponsorship: false,
      rationale: 'Corporate M&A / private equity acquisition of sports franchise equity.'
    };
  }

  // If it's a major commercial sponsorship deal
  if (hasSponsorship) {
    return {
      isSports: false,
      isEarnings: false,
      isFranchiseAcquisition: false,
      isSponsorship: true,
      rationale: 'Commercial enterprise sponsorship agreement and corporate marketing investment.'
    };
  }

  // Check metadata signals: URL path & dedicated sports publisher
  const hasSportsUrl = SPORTS_URL_PATH_REGEX.test(urlLower);
  const isDedicatedSportsPub =
    Array.from(DEDICATED_SPORTS_DOMAINS).some((dom) => urlLower.includes(dom) || pubLower.includes(dom)) ||
    /\b(espn|sky sports|bbc sport|fox sports|the athletic|bleacher report|cricinfo|marca)\b/i.test(pubLower);

  // Check content signals
  const isFinancialBeatOnly = /\b(earnings|revenue|profit|eps|guidance|sales)\s+beats?\b|\bbeats?\s+(expectations|estimates|forecasts|wall street|consensus)\b/i.test(text) && !SPORTS_TOURNAMENTS_LEAGUES_REGEX.test(text) && !SPORTS_ROSTER_TRANSFER_REGEX.test(text);
  const hasMatchScore = SPORTS_MATCH_RESULT_REGEX.test(text) && !isFinancialBeatOnly;
  const isShoppingPromo = /\b(shopping-deals|dansdeals|from amazon|for \$\d+\.\d+|coupon|promo code|black friday deal)\b/i.test(`${text} ${urlLower}`);
  const hasLeagueTournament = SPORTS_TOURNAMENTS_LEAGUES_REGEX.test(text) && !isShoppingPromo;
  const hasRosterOrTransfer = SPORTS_ROSTER_TRANSFER_REGEX.test(text);

  if (hasMatchScore || hasLeagueTournament || hasRosterOrTransfer || (hasSportsUrl && !BUSINESS_URL_PATH_REGEX.test(urlLower))) {
    return {
      isSports: true,
      isEarnings: false,
      isFranchiseAcquisition: false,
      isSponsorship: false,
      rationale: hasMatchScore
        ? 'Athletic match report or tournament score result.'
        : hasRosterOrTransfer
        ? 'Athletic team roster transaction, player transfer, or contract deal.'
        : hasLeagueTournament
        ? 'Sports league or athletic championship event.'
        : isDedicatedSportsPub
        ? 'Published by dedicated sports media outlet.'
        : 'Dedicated sports URL pathname.'
    };
  }

  if (isDedicatedSportsPub && !CORPORATE_EARNINGS_REGEX.test(text)) {
    return {
      isSports: true,
      isEarnings: false,
      isFranchiseAcquisition: false,
      isSponsorship: false,
      rationale: 'Published by verified sports outlet.'
    };
  }

  return {
    isSports: false,
    isEarnings: false,
    isFranchiseAcquisition: false,
    isSponsorship: false,
    rationale: 'No primary sports indicators.'
  };
}

/**
 * Deterministically checks if an article is strictly a Business or Finance story.
 */
export function isDeterministicBusinessOrFinanceStory(
  headline: string,
  summary: string,
  url = '',
  publisher = ''
): { isBusinessOrFinance: boolean; targetCategory: 'Business' | 'Finance'; isDualRelevant: boolean; rationale: string } {
  const text = `${headline} ${summary}`.toLowerCase();
  const urlLower = url.toLowerCase();
  const pubLower = publisher.toLowerCase();

  // Guard: If it's a pure match report or player roster deal, it CANNOT be Business
  const sportsCheck = isDeterministicSportsStory(headline, summary, url, publisher);
  if (sportsCheck.isSports) {
    return {
      isBusinessOrFinance: false,
      targetCategory: 'Business',
      isDualRelevant: false,
      rationale: 'Strictly sports event or player deal without corporate enterprise connection.'
    };
  }

  // Check for Sports-Brand Corporate Earnings (Dual-relevant)
  if (sportsCheck.isEarnings) {
    return {
      isBusinessOrFinance: true,
      targetCategory: 'Business',
      isDualRelevant: true,
      rationale: 'Athletic wear brand corporate quarterly financial results (dual relevance).'
    };
  }

  // Check for Corporate Franchise M&A Acquisition (Dual-relevant)
  if (sportsCheck.isFranchiseAcquisition) {
    return {
      isBusinessOrFinance: true,
      targetCategory: 'Business',
      isDualRelevant: true,
      rationale: 'Private equity / corporate acquisition of sports franchise (dual relevance).'
    };
  }

  // Check for Commercial Sports Sponsorship Agreements (Dual-relevant)
  if (sportsCheck.isSponsorship) {
    return {
      isBusinessOrFinance: true,
      targetCategory: 'Business',
      isDualRelevant: true,
      rationale: 'Commercial enterprise sports sponsorship agreement (dual relevance).'
    };
  }

  // Finance indicators
  if (CAPITAL_MARKETS_FINANCE_REGEX.test(text)) {
    return {
      isBusinessOrFinance: true,
      targetCategory: 'Finance',
      isDualRelevant: false,
      rationale: 'Capital markets, central bank, stock indices, or monetary policy.'
    };
  }

  // Business indicators: Corporate Earnings, Macro, M&A, Corporate Investment
  if (
    CORPORATE_EARNINGS_REGEX.test(text) ||
    MACRO_ECONOMICS_REGEX.test(text) ||
    CORPORATE_MA_ACQUISITION_REGEX.test(text) ||
    /\b(supply chain|retail sales|wholesale|merger|startup funding|valuation|ipo|capital expenditure|capex|infrastructure spending|corporate investment|commercial expansion)\b/i.test(text)
  ) {
    return {
      isBusinessOrFinance: true,
      targetCategory: 'Business',
      isDualRelevant: false,
      rationale: 'Commercial enterprise, corporate earnings, macroeconomics, or mergers.'
    };
  }

  // URL / Publisher indicators for Business
  const isDedicatedBizPub = Array.from(DEDICATED_BUSINESS_FINANCE_DOMAINS).some(
    (dom) => urlLower.includes(dom) || pubLower.includes(dom)
  );
  const hasBizUrl = BUSINESS_URL_PATH_REGEX.test(urlLower);

  if ((isDedicatedBizPub || hasBizUrl) && !SPORTS_MATCH_RESULT_REGEX.test(text)) {
    return {
      isBusinessOrFinance: true,
      targetCategory: 'Business',
      isDualRelevant: false,
      rationale: 'Verified business news outlet or business section URL.'
    };
  }

  return {
    isBusinessOrFinance: false,
    targetCategory: 'Business',
    isDualRelevant: false,
    rationale: 'No primary business or finance indicators.'
  };
}

// ---------------------------------------------------------------------------
// MASTER CLASSIFICATION ENGINE
// ---------------------------------------------------------------------------

/**
 * Classifies an article using:
 * 1. Metadata and deterministic rules FIRST.
 * 2. AI model suggestions for ambiguous cases.
 * 3. Strict guardrail enforcement to prevent cross-category contamination.
 */
export function classifyArticleCategoryWithRules(
  input: ArticleClassificationInput
): CategoryClassificationResult {
  const headline = (input.headline || '').trim();
  const summary = (input.summary || '').trim();
  const url = input.canonicalUrl || input.originalUrl || '';
  const publisher = input.publisher || input.publisherDomain || '';
  const text = `${headline} ${summary}`.toLowerCase();

  // -------------------------------------------------------------------------
  // STEP 1: DETERMINISTIC CLASSIFICATION RULES FIRST
  // -------------------------------------------------------------------------

  // A. Sports Evaluation
  const sportsCheck = isDeterministicSportsStory(headline, summary, url, publisher);

  // If clearly sports (match, tournament, athlete contract, transfer)
  if (sportsCheck.isSports) {
    return {
      category: 'Sports',
      secondaryCategory: undefined,
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.98,
      rationale: sportsCheck.rationale
    };
  }

  // B. Sports Company Earnings (Dual-relevance: Primary Business, Secondary Sports)
  if (sportsCheck.isEarnings) {
    return {
      category: 'Business',
      secondaryCategory: 'Sports',
      isDualRelevant: true,
      method: 'deterministic-rules',
      confidence: 0.95,
      rationale: 'Nike/Adidas/apparel quarterly corporate earnings (strictly Business primary).'
    };
  }

  // C. Sports Team Corporate Acquisition / Franchise Buyout (Dual-relevance)
  if (sportsCheck.isFranchiseAcquisition) {
    return {
      category: 'Business',
      secondaryCategory: 'Sports',
      isDualRelevant: true,
      method: 'deterministic-rules',
      confidence: 0.92,
      rationale: 'Franchise equity buyout or private equity acquisition (Business primary).'
    };
  }

  // C2. Commercial Sports Sponsorship Agreements (Dual-relevance)
  if (sportsCheck.isSponsorship) {
    return {
      category: 'Business',
      secondaryCategory: 'Sports',
      isDualRelevant: true,
      method: 'deterministic-rules',
      confidence: 0.92,
      rationale: 'Commercial enterprise sponsorship agreement (Business primary, Sports secondary).'
    };
  }

  // D. General Business or Finance Evaluation
  const bizCheck = isDeterministicBusinessOrFinanceStory(headline, summary, url, publisher);
  if (bizCheck.isBusinessOrFinance) {
    return {
      category: bizCheck.targetCategory,
      secondaryCategory: bizCheck.isDualRelevant ? 'Sports' : undefined,
      isDualRelevant: bizCheck.isDualRelevant,
      method: 'deterministic-rules',
      confidence: 0.95,
      rationale: bizCheck.rationale
    };
  }

  // E. Other Specialized Verticals (Deterministic)
  if (/\b(openai|llm|generative ai|gpt|anthropic|claude|deepmind|neural net|machine learning|ai model)\b/i.test(text)) {
    return {
      category: 'AI',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.94,
      rationale: 'Artificial intelligence or foundational model development.'
    };
  }

  if (/\b(tsmc|nvidia|semiconductor|wafer|chipmaker|fab|asic|hbm3|foundry|euv lithography)\b/i.test(text)) {
    return {
      category: 'Semiconductors',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.96,
      rationale: 'Semiconductor manufacturing, hardware, or fabrication.'
    };
  }

  if (/\b(nasa|spacex|orbit|satellite|lunar|mars|telescope|astrophysics|rocket|starship|esa)\b/i.test(text)) {
    return {
      category: 'Space',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.95,
      rationale: 'Space exploration, astrophysics, or satellite deployment.'
    };
  }

  if (/\b(robot|humanoid|autonomous drone|boston dynamics|actuator|manipulator|bipedal)\b/i.test(text)) {
    return {
      category: 'Robotics',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.92,
      rationale: 'Robotics, humanoid systems, or physical automation.'
    };
  }

  if (/\b(ransomware|zero-day|cyberattack|malware|cve-|phishing|data breach|encryption|firewall breach)\b/i.test(text)) {
    return {
      category: 'Cybersecurity',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.95,
      rationale: 'Cybersecurity incident, exploit, or defense.'
    };
  }

  if (/\b(seed round|series a|series b|venture capital|unicorn|yc incubator|early-stage startup)\b/i.test(text)) {
    return {
      category: 'Startups',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.92,
      rationale: 'Venture capital funding or early-stage startups.'
    };
  }

  if (/\b(climate change|emissions|carbon neutral|renewable energy|solar farm|biodiversity|glacier melt)\b/i.test(text)) {
    return {
      category: 'Environment',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.92,
      rationale: 'Environmental science, climate, or renewable energy.'
    };
  }

  if (/\b(vaccine|world health organization|clinical trial|medical|oncology|fda approval|pathogen|virus outbreak|hospital|biotech|genomics|crispr)\b/i.test(text)) {
    return {
      category: 'Health',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.92,
      rationale: 'Healthcare, pharmaceuticals, or public health.'
    };
  }

  if (/\b(election|senate|congress|parliament|legislation|supreme court|campaign finance|governor)\b/i.test(text)) {
    return {
      category: 'Politics',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.91,
      rationale: 'Domestic politics, elections, or legislative affairs.'
    };
  }

  if (/\b(treaty|summit|nato|sanctions|diplomacy|ceasefire|foreign ministry|un security council)\b/i.test(text)) {
    return {
      category: 'Geopolitics',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.92,
      rationale: 'International geopolitics, diplomacy, or global security.'
    };
  }

  if (/\b(box office|cinema|film festival|grammy|oscar|streaming service|hollywood|album release)\b/i.test(text)) {
    return {
      category: 'Entertainment',
      isDualRelevant: false,
      method: 'deterministic-rules',
      confidence: 0.92,
      rationale: 'Film, music, entertainment, or cultural performance.'
    };
  }

  // -------------------------------------------------------------------------
  // STEP 2: AMBIGUOUS CASES -> CONSULT CONFIGURED AI MODEL SUGGESTION
  // -------------------------------------------------------------------------
  if (input.aiSuggestedCategory) {
    const rawAi = input.aiSuggestedCategory.trim();
    const normalizedAi = normalizeCategoryString(rawAi);

    if (normalizedAi) {
      // -----------------------------------------------------------------------
      // STEP 3: STRICT GUARDRAIL VALIDATION ON AI OUTPUT
      // -----------------------------------------------------------------------
      // Guardrail A: If AI says Business/Finance, but content has sports match or player contract
      if (
        (normalizedAi === 'Business' || normalizedAi === 'Finance') &&
        (SPORTS_MATCH_RESULT_REGEX.test(text) ||
          SPORTS_TOURNAMENTS_LEAGUES_REGEX.test(text) ||
          SPORTS_ROSTER_TRANSFER_REGEX.test(text)) &&
        !CORPORATE_EARNINGS_REGEX.test(text) &&
        !CORPORATE_MA_ACQUISITION_REGEX.test(text)
      ) {
        return {
          category: 'Sports',
          isDualRelevant: false,
          method: 'ai-model-guarded',
          confidence: 0.9,
          rationale: `AI proposed ${normalizedAi}, but guardrail detected match/player contract; overridden to Sports.`
        };
      }

      // Guardrail B: If AI says Sports, but content is corporate earnings
      if (normalizedAi === 'Sports' && CORPORATE_EARNINGS_REGEX.test(text)) {
        return {
          category: 'Business',
          secondaryCategory: 'Sports',
          isDualRelevant: true,
          method: 'ai-model-guarded',
          confidence: 0.9,
          rationale: 'AI proposed Sports, but guardrail detected corporate earnings; overridden to Business.'
        };
      }

      return {
        category: normalizedAi,
        isDualRelevant: false,
        method: 'ai-model',
        confidence: 0.85,
        rationale: `Classified via AI inference model (${normalizedAi}).`
      };
    }
  }

  // Default Fallback
  return {
    category: 'World',
    isDualRelevant: false,
    method: 'fallback',
    confidence: 0.5,
    rationale: 'General world news dispatch without specialized category match.'
  };
}

/**
 * Normalizes an arbitrary string into a supported XnovaCategory.
 */
export function normalizeCategoryString(catStr?: string): XnovaCategory | null {
  if (!catStr || typeof catStr !== 'string') return null;
  const clean = catStr.trim().toLowerCase();

  const map: Record<string, XnovaCategory> = {
    world: 'World',
    global: 'World',
    international: 'World',
    politics: 'Politics',
    policy: 'Politics',
    geopolitics: 'Geopolitics',
    diplomacy: 'Geopolitics',
    business: 'Business',
    economy: 'Business',
    commerce: 'Business',
    finance: 'Finance',
    markets: 'Finance',
    tech: 'Tech',
    technology: 'Tech',
    ai: 'AI',
    science: 'Science',
    space: 'Space',
    semiconductors: 'Semiconductors',
    chips: 'Semiconductors',
    robotics: 'Robotics',
    cybersecurity: 'Cybersecurity',
    'big tech': 'Big Tech',
    startups: 'Startups',
    health: 'Health',
    medicine: 'Health',
    environment: 'Environment',
    climate: 'Environment',
    sports: 'Sports',
    sport: 'Sports',
    entertainment: 'Entertainment',
    culture: 'Entertainment',
    education: 'Education',
    general: 'General'
  };

  return map[clean] || null;
}
