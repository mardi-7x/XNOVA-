import assert from 'node:assert/strict';
import {
  classifyArticleCategoryWithRules,
  isDeterministicSportsStory,
  isDeterministicBusinessOrFinanceStory
} from '../src/pipeline/categoryClassifier';
import {
  classifyXnovaCategory,
  clearPipelineCaches,
  runDualEnginePipeline
} from '../src/pipeline/engine';

interface TestResult {
  id: string;
  categoryTested: string;
  storyTitle: string;
  expectedCategory: string;
  actualCategory: string;
  passed: boolean;
  notes: string;
}

const auditLedger: TestResult[] = [];

function runCase(
  id: string,
  categoryTested: string,
  headline: string,
  summary: string,
  url: string,
  publisher: string,
  expectedCategory: string,
  expectedSecondary?: string,
  aiSuggested?: string
) {
  const result = classifyArticleCategoryWithRules({
    headline,
    summary,
    canonicalUrl: url,
    originalUrl: url,
    publisher,
    aiSuggestedCategory: aiSuggested
  });

  const passed = result.category === expectedCategory;
  const secondaryPassed = expectedSecondary ? result.secondaryCategory === expectedSecondary : true;

  auditLedger.push({
    id,
    categoryTested,
    storyTitle: headline,
    expectedCategory,
    actualCategory: result.category,
    passed: passed && secondaryPassed,
    notes: `${result.method} | conf: ${result.confidence} | dual: ${result.isDualRelevant ? result.secondaryCategory : 'none'}`
  });

  if (!passed || !secondaryPassed) {
    throw new Error(
      `[FAIL ${id}] Expected "${expectedCategory}" (sec: ${expectedSecondary || 'none'}), but got "${result.category}" (sec: ${result.secondaryCategory || 'none'}). Rationale: ${result.rationale}`
    );
  }
}

(async () => {
  console.log('======================================================================');
  console.log(' XNOVA NEWS CATEGORY CONTAMINATION & SEPARATION AUDIT SUITE ');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // 1. ORDINARY MATCH REPORTS (STRICTLY SPORTS, ZERO BUSINESS CONTAMINATION)
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Ordinary Match Reports & Tournaments ---');

  runCase(
    'MATCH-01',
    'Sports',
    'Manchester City defeats Arsenal 2-1 with stoppage-time winner in Premier League clash',
    'Kevin De Bruyne scored in the 93rd minute to seal three points in the title race.',
    'https://www.bbc.com/sport/football/articles/c4n1v90m',
    'BBC Sport',
    'Sports'
  );

  runCase(
    'MATCH-02',
    'Sports',
    'Lakers top Celtics 112-108 in NBA thriller behind Anthony Davis 34-point performance',
    'Los Angeles rallied from a 14-point deficit in the fourth quarter to secure the victory.',
    'https://www.espn.com/nba/story/_/id/4019283/lakers-celtics-game-recap',
    'ESPN',
    'Sports'
  );

  runCase(
    'MATCH-03',
    'Sports',
    'Real Madrid beats Bayern Munich 3-1 to advance to Champions League final',
    'Vinicius Junior scored two second-half goals as the Spanish giants booked their place in London.',
    'https://www.marca.com/futbol/champions-league/cronica-madrid-bayern',
    'Marca',
    'Sports'
  );

  runCase(
    'MATCH-04',
    'Sports',
    'Australia retains Ashes after thrilling draw against England at Old Trafford',
    'Rain washed out day five with England needing four wickets to level the series.',
    'https://www.espncricinfo.com/series/the-ashes-2023/england-vs-australia-4th-test',
    'ESPN Cricinfo',
    'Sports'
  );

  console.log('✅ All 4 Ordinary Match Report tests PASSED (Strictly Sports)\n');

  // -------------------------------------------------------------------------
  // 2. PLAYER CONTRACTS & TRANSFERS (CONTAINS DOLLAR VALUES & "DEAL" / "TRADE")
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 2: Player Contracts, Trades & Transfers (High Dollar Figures) ---');

  runCase(
    'ROSTER-01',
    'Sports',
    'Real Madrid seals $120M transfer fee for superstar striker on five-year contract',
    'The French international agreed personal terms with a $15M signing bonus and release clause.',
    'https://theathletic.com/football/real-madrid-transfer-fee-deal',
    'The Athletic',
    'Sports'
  );

  runCase(
    'ROSTER-02',
    'Sports',
    'Quarterback agrees record $260M contract extension with $185M guaranteed',
    'The franchise quarterback finalized a five-year contract making him the highest-paid player in the NFL.',
    'https://www.nfl.com/news/quarterback-signs-record-260m-deal',
    'NFL.com',
    'Sports'
  );

  runCase(
    'ROSTER-03',
    'Sports',
    'Lakers and Nets agree multi-player trade deal ahead of NBA trade deadline',
    'The blockbuster trade sends two future first-round draft picks and starting guard to Brooklyn.',
    'https://www.espn.com/nba/story/_/id/4092182/nba-trade-deadline-lakers-nets',
    'ESPN',
    'Sports'
  );

  runCase(
    'ROSTER-04',
    'Sports',
    'Chelsea manager sacked after $80M transfer window spending spree',
    'The Premier League club relieved the head coach of duties following consecutive home defeats.',
    'https://www.skysports.com/football/news/chelsea-manager-sacked',
    'Sky Sports',
    'Sports'
  );

  console.log('✅ All 4 Player Contract/Trade tests PASSED (Excluded from Business)\n');

  // -------------------------------------------------------------------------
  // 3. SPORTS COMPANY CORPORATE EARNINGS (STRICTLY BUSINESS PRIMARY)
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 3: Sports Company Corporate Earnings (Nike/Adidas/Puma) ---');

  runCase(
    'CORP-EARN-01',
    'Business',
    'Nike quarterly revenue drops 10% to $11.6B amid sluggish retail footwear demand',
    'Nike reported quarterly earnings per share of $0.70 as wholesale inventories compressed profit margins.',
    'https://www.bloomberg.com/news/articles/2026-nike-quarterly-earnings-revenue-drop',
    'Bloomberg',
    'Business',
    'Sports'
  );

  runCase(
    'CORP-EARN-02',
    'Business',
    'Adidas Q3 operating profit rises 22% as direct-to-consumer sales rebound',
    'The German sportswear maker raised full-year guidance after strong gross margin expansion.',
    'https://www.ft.com/content/adidas-q3-operating-profit-guidance',
    'Financial Times',
    'Business',
    'Sports'
  );

  runCase(
    'CORP-EARN-03',
    'Business',
    'Puma lowers full-year profit guidance following wholesale inventory glut in North America',
    'Net income fell 14% year-over-year as freight costs and price discounting hit EBITDA.',
    'https://www.reuters.com/business/retail-consumer/puma-guidance-lowered-2026',
    'Reuters',
    'Business',
    'Sports'
  );

  console.log('✅ All 3 Sports Brand Corporate Earnings tests PASSED (Strictly Business, Dual-Relevance Tagged)\n');

  // -------------------------------------------------------------------------
  // 4. SPORTS FRANCHISE M&A / PRIVATE EQUITY TAKEOVERS
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 4: Sports Franchise Corporate Acquisitions & Takeovers ---');

  runCase(
    'FRANCHISE-MA-01',
    'Business',
    'Private equity consortium acquires majority stake in Everton FC for $750M',
    'The corporate buyout includes debt restructuring and commercial funding for the new stadium.',
    'https://www.wsj.com/articles/private-equity-consortium-everton-takeover-750m',
    'Wall Street Journal',
    'Business',
    'Sports'
  );

  runCase(
    'FRANCHISE-MA-02',
    'Business',
    'Billionaire investor group completes $3.2B takeover acquisition of NBA franchise',
    'The transaction received unanimous board approval from league governors.',
    'https://www.cnbc.com/2026/nba-franchise-acquisition-private-equity-deal.html',
    'CNBC',
    'Business',
    'Sports'
  );

  console.log('✅ All 2 Sports Franchise M&A Acquisition tests PASSED (Strictly Business, Dual-Relevance Tagged)\n');

  // -------------------------------------------------------------------------
  // 5. SPORTS SPONSORSHIP COMMERCIAL DEALS
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 5: Sports Sponsorship Commercial Agreements ---');

  runCase(
    'SPONSOR-01',
    'Business',
    'Oracle renews $300M title sponsorship deal with Red Bull Racing Formula 1 team',
    'The multi-year commercial enterprise partnership expands cloud infrastructure and marketing rights.',
    'https://www.forbes.com/sites/formula1-sponsorship-oracle-redbull',
    'Forbes',
    'Business',
    'Sports'
  );

  console.log('✅ Sports Sponsorship commercial agreement test PASSED\n');

  // -------------------------------------------------------------------------
  // 6. GENERAL BUSINESS & FINANCE (ZERO SPORTS CONTAMINATION)
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 6: Pure Business & Macroeconomic News ---');

  runCase(
    'MACRO-01',
    'Finance',
    'Federal Reserve holds benchmark interest rate steady as inflation cools to 2.4%',
    'Policymakers cited resilient labor markets and steady GDP growth for their decision.',
    'https://www.bloomberg.com/news/articles/fed-holds-interest-rate-steady',
    'Bloomberg',
    'Finance'
  );

  runCase(
    'MACRO-02',
    'Business',
    'Global supply chain bottlenecks ease as container freight rates fall 18% in Europe',
    'Retailers report normalized delivery lead times and lower wholesale shipping tariffs.',
    'https://www.ft.com/content/global-supply-chain-freight-rates-drop',
    'Financial Times',
    'Business'
  );

  runCase(
    'MACRO-03',
    'Business',
    'Alphabet announces $20B capital expenditure expansion for AI data centers and subsea cables',
    'The cloud giant outlined infrastructure spending across North America and Asia.',
    'https://www.reuters.com/technology/alphabet-capex-expansion-2026',
    'Reuters',
    'Business'
  );

  console.log('✅ All 3 Pure Business/Finance tests PASSED (Zero Sports Contamination)\n');

  // -------------------------------------------------------------------------
  // 7. AI MODEL GUARDRAIL VALIDATION (OVERRIDING ERRONEOUS AI OUTPUT)
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 7: Guardrail Validation of Erroneous AI Predictions ---');

  // Scenario A: AI mistakenly says "Business" because the headline has the word "deal"
  runCase(
    'GUARD-01',
    'Sports',
    'Arsenal agrees $65M deal for Sporting CP striker ahead of transfer deadline',
    'The 24-year-old Swedish forward finalized personal terms to join the north London squad.',
    'https://www.skysports.com/football/arsenal-striker-deal-65m',
    'Sky Sports',
    'Sports',
    undefined,
    'Business' // AI proposed Business mistakenly
  );

  // Scenario B: AI mistakenly says "Sports" because headline mentions Nike
  runCase(
    'GUARD-02',
    'Business',
    'Nike Q2 net income climbs 15% on wholesale rebound and direct-to-consumer digital growth',
    'Gross profit margins reached 45.2% as inventory write-downs declined substantially.',
    'https://www.marketwatch.com/story/nike-earnings-q2-net-income-rebound',
    'MarketWatch',
    'Business',
    'Sports',
    'Sports' // AI proposed Sports mistakenly
  );

  console.log('✅ All 2 AI Guardrail Override tests PASSED\n');

  // -------------------------------------------------------------------------
  // 8. FULL PIPELINE EXECUTION: LIVE VERIFICATION & CATEGORY DISTRIBUTION
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 8: Integrated Dual-Engine Pipeline Execution ---');
  clearPipelineCaches();

  const nowIso = new Date().toISOString();
  const testDispatches = [
    {
      headline: 'Manchester City defeats Arsenal 2-1 with stoppage-time winner in Premier League clash',
      publisher: 'BBC Sport',
      originalUrl: 'https://www.bbc.com/sport/football/city-arsenal-2026',
      publishedAt: nowIso,
      retrievedAt: nowIso,
      summary: 'Kevin De Bruyne scored in the 93rd minute to seal three points in the title race.'
    },
    {
      headline: 'Real Madrid seals $120M transfer fee for superstar striker on five-year contract',
      publisher: 'The Athletic',
      originalUrl: 'https://theathletic.com/football/real-madrid-transfer-fee-120m',
      publishedAt: nowIso,
      retrievedAt: nowIso,
      summary: 'The French international agreed personal terms with a $15M signing bonus and release clause.'
    },
    {
      headline: 'Nike quarterly revenue drops 10% to $11.6B amid sluggish retail footwear demand',
      publisher: 'Bloomberg',
      originalUrl: 'https://www.bloomberg.com/news/articles/2026-nike-quarterly-earnings-drop',
      publishedAt: nowIso,
      retrievedAt: nowIso,
      summary: 'Nike reported quarterly earnings per share of $0.70 as wholesale inventories compressed profit margins.'
    },
    {
      headline: 'Private equity consortium acquires majority stake in Everton FC for $750M',
      publisher: 'Wall Street Journal',
      originalUrl: 'https://www.wsj.com/articles/private-equity-consortium-everton-750m',
      publishedAt: nowIso,
      retrievedAt: nowIso,
      summary: 'The corporate buyout includes debt restructuring and commercial funding for the new stadium.'
    },
    {
      headline: 'Federal Reserve holds benchmark interest rate steady as inflation cools to 2.4%',
      publisher: 'Bloomberg',
      originalUrl: 'https://www.bloomberg.com/news/articles/fed-holds-rate-steady-2026',
      publishedAt: nowIso,
      retrievedAt: nowIso,
      summary: 'Policymakers cited resilient labor markets and steady GDP growth for their decision.'
    },
    {
      headline: 'TSMC Begins 2nm Wafer Production at Hsinchu Fab with 15% Density Gain',
      publisher: 'Reuters',
      originalUrl: 'https://www.reuters.com/technology/tsmc-2nm-wafer-hsinchu-2026',
      publishedAt: nowIso,
      retrievedAt: nowIso,
      summary: 'TSMC started commercial 2nm nanosheet production with a 15% efficiency improvement.'
    }
  ];

  const pipelineRun = await runDualEnginePipeline({
    rollingWindowHours: 24,
    adapters: {
      collectStories: async () => ({
        isLiveData: true,
        latencyMs: 35,
        stories: testDispatches
      }),
      discoverEvidence: async (_h, _d, url) => {
        // Supply 2 independent corroborating sources for each story
        const dom = url.includes('bbc') ? 'skysports.com' : 'reuters.com';
        return {
          latencyMs: 25,
          evidence: [
            {
              id: `ev-indep-1-${url.slice(-8)}`,
              url: `https://${dom}/coverage/${url.slice(-10)}`,
              domain: dom,
              title: `Corroborating coverage on ${dom}`,
              snippet: 'Independent corroborating report confirming the reported details.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.95
            },
            {
              id: `ev-indep-2-${url.slice(-8)}`,
              url: `https://apnews.com/article/${url.slice(-10)}`,
              domain: 'apnews.com',
              title: 'AP News Wire Report',
              snippet: 'Associated Press confirms the reported facts and figures.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.92
            }
          ]
        };
      },
      groqExtract: async (story) => {
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
          summary: story.summary,
          coreClaims: [story.headline],
          entities: [story.publisher],
          importantNumbers: [],
          flags: {
            unsupportedClaims: false,
            staleStory: false,
            missingSources: false,
            conflictingInfo: false
          },
          providerUsed: 'groq/openai/gpt-oss-120b',
          latencyMs: 40
        };
      },
      openRouterVerify: async () => ({
        status: 'VERIFIED',
        corroborationScore: 94,
        verifiedClaims: ['Corroborated by independent sources'],
        contradictions: [],
        reasons: ['Independently corroborated across external domains.'],
        providerUsed: 'openrouter/nvidia/nemotron-3-super-120b-a12b',
        latencyMs: 50,
        isLiveEvaluated: true
      })
    }
  });

  assert.equal(pipelineRun.status, 'HEALTHY');
  assert.equal(pipelineRun.ledger.length, 6);

  // Group by Category
  const categoryCounts: Record<string, number> = {};
  for (const item of pipelineRun.ledger) {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  }

  console.log('Category Counts from Pipeline Execution:');
  console.table(categoryCounts);

  // Assertions on Category Counts
  assert.equal(categoryCounts['Sports'], 2, 'Should have exactly 2 Sports stories (Match + Player Transfer)');
  assert.equal(categoryCounts['Business'], 2, 'Should have exactly 2 Business stories (Nike Earnings + Everton PE Takeover)');
  assert.equal(categoryCounts['Finance'], 1, 'Should have exactly 1 Finance story (Federal Reserve Interest Rate)');
  assert.equal(categoryCounts['Semiconductors'], 1, 'Should have exactly 1 Semiconductors story (TSMC 2nm)');

  // Verify Sports stories did NOT leak into Business
  const businessItems = pipelineRun.ledger.filter((i) => i.category === 'Business');
  for (const b of businessItems) {
    assert.ok(
      !b.headline.includes('Manchester City') && !b.headline.includes('transfer fee for superstar striker'),
      `Business section contaminated by sports story: "${b.headline}"`
    );
  }

  // Verify Sports stories correctly contain the match and transfer
  const sportsItems = pipelineRun.ledger.filter((i) => i.category === 'Sports');
  assert.ok(sportsItems.some((s) => s.headline.includes('Manchester City defeats Arsenal')));
  assert.ok(sportsItems.some((s) => s.headline.includes('transfer fee for superstar striker')));

  console.log('✅ Pipeline Execution Category Separation Verification PASSED (Zero cross-contamination)');

  // -------------------------------------------------------------------------
  // FINAL REPORT
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(' CATEGORY CONTAMINATION AUDIT SUMMARY ');
  console.log('======================================================================');
  console.log(`Total Test Scenarios Evaluated: ${auditLedger.length}`);
  const passCount = auditLedger.filter((t) => t.passed).length;
  const failCount = auditLedger.filter((t) => !t.passed).length;
  console.log(`Passed: ${passCount} / ${auditLedger.length}`);
  console.log(`Failed: ${failCount} / ${auditLedger.length}`);
  console.log('All criteria met: Strict mutual exclusivity enforced, no sports in business, dual-relevance preserved.');
  console.log('======================================================================\n');
})();
