import assert from 'assert';
import {
  UNIVERSAL_CATEGORIES,
  normalizeToUniversalCategory,
  classifyUniversalCategory,
  revalidateCategoryIsolation,
  isArxivEligibleForCategory,
  buildCategoryScopedCacheKey
} from '../src/pipeline/universalCategories';
import {
  parseArxivAtomXml,
  buildExecutiveIntelligenceDossier,
  clearUniversalDossierCaches,
  getCategoryScopedCacheEntry,
  PREPRINT_BADGE_LABEL
} from '../src/pipeline/multiSourceDiscovery';
import { RawCollectedStory } from '../src/pipeline/engine';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

const SAMPLE_STORIES_8_CATEGORIES: RawCollectedStory[] = [
  {
    headline: 'NATO and European Union Sign New Sovereign Maritime Security Treaty at Brussels Summit',
    publisher: 'Reuters',
    originalUrl: 'https://www.reuters.com/world/nato-eu-maritime-treaty-2026',
    publishedAt: '2026-10-27T08:00:00Z',
    retrievedAt: '2026-10-27T09:00:00Z',
    summary: 'Foreign ministers ratified a multilateral defense and diplomatic treaty strengthening sanctions enforcement.'
  },
  {
    headline: 'Federal Reserve Holds Benchmark Interest Rate Steady as Q3 Corporate Earnings Beat Expectations',
    publisher: 'Bloomberg',
    originalUrl: 'https://www.bloomberg.com/markets/fed-rates-q3-earnings-2026',
    publishedAt: '2026-10-27T08:10:00Z',
    retrievedAt: '2026-10-27T09:00:00Z',
    summary: 'Central bank policymakers cited moderating CPI inflation and resilient GDP growth across capital markets.'
  },
  {
    headline: 'OpenAI and DeepMind Unveil Sparse Mixture-of-Experts LLM Architecture for Cloud Inference',
    publisher: 'Ars Technica',
    originalUrl: 'https://arstechnica.com/ai/sparse-moe-llm-cloud-2026',
    publishedAt: '2026-10-27T08:15:00Z',
    retrievedAt: '2026-10-27T09:00:00Z',
    summary: 'New neural network algorithms reduce transformer latency by 42% while patching zero-day cloud vulnerabilities.'
  },
  {
    headline: 'TSMC Begins High-Volume 2nm Wafer Fabrication Using Next-Gen ASML High-NA EUV Lithography',
    publisher: 'AnandTech',
    originalUrl: 'https://www.anandtech.com/show/tsmc-2nm-asml-euv-hbm4',
    publishedAt: '2026-10-27T08:20:00Z',
    retrievedAt: '2026-10-27T09:00:00Z',
    summary: 'Semiconductor foundry yields reach 85% for next-generation AI GPU packages and bipedal humanoid robot actuators.'
  },
  {
    headline: 'NASA James Webb Space Telescope Detects Atmospheric Water Vapor on Habitable-Zone Exoplanet',
    publisher: 'SpaceNews',
    originalUrl: 'https://spacenews.com/jwst-exoplanet-water-vapor-2026',
    publishedAt: '2026-10-27T08:25:00Z',
    retrievedAt: '2026-10-27T09:00:00Z',
    summary: 'Astrophysics researchers confirmed spectral absorption lines during orbital transit observations.'
  },
  {
    headline: 'ITER Tokamak Consortium Achieves Net Thermal Gain in Magnetic Confinement Nuclear Fusion Test',
    publisher: 'Nature Energy',
    originalUrl: 'https://www.nature.com/articles/iter-tokamak-fusion-grid-2026',
    publishedAt: '2026-10-27T08:30:00Z',
    retrievedAt: '2026-10-27T09:00:00Z',
    summary: 'Clean energy milestone pairs superconducting plasma containment with 4GW grid-scale battery storage.'
  },
  {
    headline: 'FDA Approves Phase 3 CRISPR In-Vivo Gene Editing Therapy for Hereditary Oncology Patients',
    publisher: 'STAT News',
    originalUrl: 'https://www.statnews.com/2026/10/27/fda-crispr-phase3-clinical-trial',
    publishedAt: '2026-10-27T08:35:00Z',
    retrievedAt: '2026-10-27T09:00:00Z',
    summary: 'Clinical trial results demonstrated 91% remission rate using targeted mRNA lipid nanoparticles.'
  },
  {
    headline: 'Real Madrid Defeats Bayern Munich 3-1 in Champions League Quarterfinal After Late Striker Brace',
    publisher: 'ESPN',
    originalUrl: 'https://www.espn.com/soccer/champions-league-real-madrid-bayern-2026',
    publishedAt: '2026-10-27T08:40:00Z',
    retrievedAt: '2026-10-27T09:00:00Z',
    summary: 'Two second-half goals sealed the tournament victory and top spot in the UEFA standings.'
  }
];

const SAMPLE_ARXIV_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2610.12345v1</id>
    <published>2026-10-26T14:00:00Z</published>
    <title>Scaling Laws for Sub-Quadratic Sparse Attention in Foundation Models</title>
    <summary>We present theoretical and empirical scaling laws for sparse transformer neural architectures reducing KV-cache memory by 68%.</summary>
    <author><name>Elena Vance</name></author>
    <author><name>Marcus Chen</name></author>
    <arxiv:primary_category term="cs.AI" />
  </entry>
</feed>`;

async function main() {
  console.log('\n=== XNOVA UNIVERSAL 8-CATEGORY DOSSIER, TRI-SERVICE DISCOVERY & ISOLATION TESTS ===\n');

  await runTest('1. All 8 Universal Categories are registered with strict metadata', () => {
    assert.strictEqual(UNIVERSAL_CATEGORIES.length, 8);
    const ids = UNIVERSAL_CATEGORIES.map((c) => c.id);
    assert.deepStrictEqual(ids, [
      'GEOPOLITICS',
      'MACRO_FINANCE',
      'AI_COMPUTING',
      'SEMICON_HARDWARE',
      'SCIENCE_SPACE',
      'CLIMATE_ENERGY',
      'BIOTECH_HEALTH',
      'SPORTS_ATHLETICS'
    ]);
  });

  await runTest('2. Each of the 8 sample stories deterministically classifies into its exact Universal Category', () => {
    const expected = [
      'GEOPOLITICS',
      'MACRO_FINANCE',
      'AI_COMPUTING',
      'SEMICON_HARDWARE',
      'SCIENCE_SPACE',
      'CLIMATE_ENERGY',
      'BIOTECH_HEALTH',
      'SPORTS_ATHLETICS'
    ];
    for (let i = 0; i < SAMPLE_STORIES_8_CATEGORIES.length; i++) {
      const s = SAMPLE_STORIES_8_CATEGORIES[i];
      const res = classifyUniversalCategory({
        headline: s.headline,
        summary: s.summary,
        publisher: s.publisher,
        canonicalUrl: s.originalUrl
      });
      assert.strictEqual(res.universalCategory, expected[i], `Mismatch for story ${i}: got ${res.universalCategory}`);
    }
  });

  await runTest('3. Strict Category Isolation prevents Space, Business, AI, Semicon, Climate, Bio-Tech, and Geopolitics from leaking into SPORTS_ATHLETICS', () => {
    for (let i = 0; i < 7; i++) {
      const nonSports = SAMPLE_STORIES_8_CATEGORIES[i];
      const check = revalidateCategoryIsolation(
        {
          headline: nonSports.headline,
          summary: nonSports.summary,
          publisher: nonSports.publisher,
          canonicalUrl: nonSports.originalUrl
        },
        'SPORTS_ATHLETICS'
      );
      assert.strictEqual(check.allowed, false, `Non-sports story [${nonSports.headline}] should be blocked from SPORTS_ATHLETICS`);
    }

    const sportsStory = SAMPLE_STORIES_8_CATEGORIES[7];
    const validSportsCheck = revalidateCategoryIsolation(
      {
        headline: sportsStory.headline,
        summary: sportsStory.summary,
        publisher: sportsStory.publisher,
        canonicalUrl: sportsStory.originalUrl
      },
      'SPORTS_ATHLETICS'
    );
    assert.strictEqual(validSportsCheck.allowed, true);
  });

  await runTest('4. Strict Category Isolation prevents Sports match reports and player transfers from leaking into MACRO_FINANCE or SCIENCE_SPACE', () => {
    const sportsStory = SAMPLE_STORIES_8_CATEGORIES[7];
    const checkBiz = revalidateCategoryIsolation(
      {
        headline: sportsStory.headline,
        summary: sportsStory.summary,
        publisher: sportsStory.publisher,
        canonicalUrl: sportsStory.originalUrl
      },
      'MACRO_FINANCE'
    );
    assert.strictEqual(checkBiz.allowed, false);

    const checkSpace = revalidateCategoryIsolation(
      {
        headline: sportsStory.headline,
        summary: sportsStory.summary,
        publisher: sportsStory.publisher,
        canonicalUrl: sportsStory.originalUrl
      },
      'SCIENCE_SPACE'
    );
    assert.strictEqual(checkSpace.allowed, false);
  });

  await runTest('5. arXiv XML parser validates title, authors, submission date, abstract, canonical URL, and attaches explicit Preprint label', () => {
    const papers = parseArxivAtomXml(SAMPLE_ARXIV_XML);
    assert.strictEqual(papers.length, 1);
    const p = papers[0];
    assert.strictEqual(p.title, 'Scaling Laws for Sub-Quadratic Sparse Attention in Foundation Models');
    assert.deepStrictEqual(p.authors, ['Elena Vance', 'Marcus Chen']);
    assert.strictEqual(p.canonicalUrl, 'https://arxiv.org/abs/2610.12345');
    assert.strictEqual(p.isPreprint, true);
    assert.strictEqual(p.preprintLabel, PREPRINT_BADGE_LABEL);
  });

  await runTest('6. arXiv eligibility is strictly enabled for the 5 STEM categories and blocked for Sports, Geopolitics, and Macro/Finance', () => {
    assert.strictEqual(isArxivEligibleForCategory('AI_COMPUTING'), true);
    assert.strictEqual(isArxivEligibleForCategory('SEMICON_HARDWARE'), true);
    assert.strictEqual(isArxivEligibleForCategory('SCIENCE_SPACE'), true);
    assert.strictEqual(isArxivEligibleForCategory('CLIMATE_ENERGY'), true);
    assert.strictEqual(isArxivEligibleForCategory('BIOTECH_HEALTH'), true);

    assert.strictEqual(isArxivEligibleForCategory('SPORTS_ATHLETICS'), false);
    assert.strictEqual(isArxivEligibleForCategory('GEOPOLITICS'), false);
    assert.strictEqual(isArxivEligibleForCategory('MACRO_FINANCE'), false);

    // Verify quarantine blocks any story with hasArxivPaper in SPORTS_ATHLETICS
    const sportsWithForcedPaper = revalidateCategoryIsolation(
      {
        headline: SAMPLE_STORIES_8_CATEGORIES[7].headline,
        summary: SAMPLE_STORIES_8_CATEGORIES[7].summary,
        canonicalUrl: SAMPLE_STORIES_8_CATEGORIES[7].originalUrl,
        hasArxivPaper: true
      },
      'SPORTS_ATHLETICS'
    );
    assert.strictEqual(sportsWithForcedPaper.allowed, false);
  });

  await runTest('7. Tri-Service Dossier Synthesizer merges Gemini Search Grounding, NewsAPI, Tavily, and arXiv into Section 1 (5 Global Leads) and Section 2 (8 Category Dossiers)', async () => {
    clearUniversalDossierCaches();
    const dossier = await buildExecutiveIntelligenceDossier({
      selectedCategory: 'all',
      requestToken: 'token-all-001',
      adapters: {
        geminiGroundingFetch: async () => ({
          stories: SAMPLE_STORIES_8_CATEGORIES.slice(0, 3),
          latencyMs: 120,
          keyUsed: 'GEMINI_API_KEY2'
        }),
        newsApiFetch: async () => ({
          stories: SAMPLE_STORIES_8_CATEGORIES.slice(3, 6),
          latencyMs: 95
        }),
        tavilyFetch: async () => ({
          stories: SAMPLE_STORIES_8_CATEGORIES.slice(6, 8),
          latencyMs: 110
        }),
        arxivFetch: async ({ category }) => ({
          papers: isArxivEligibleForCategory(category) ? parseArxivAtomXml(SAMPLE_ARXIV_XML) : [],
          latencyMs: 80
        })
      }
    });

    // Section 1: Exactly 5 verified global lead stories
    assert.strictEqual(dossier.section1GlobalLead.length, 5);
    for (const lead of dossier.section1GlobalLead) {
      assert.ok(lead.headline.length > 5);
      assert.ok(lead.sourceUrl.startsWith('https://'));
      assert.ok(lead.verifiedFacts.length > 0);
      assert.ok(lead.strategicImpact.length > 0);
    }

    // Section 2: All 8 Universal Category Dossiers populated and verified
    assert.strictEqual(dossier.section2CategoryDossiers.length, 8);
    for (const catDossier of dossier.section2CategoryDossiers) {
      assert.strictEqual(catDossier.status, 'VERIFIED', `Category ${catDossier.categoryId} should be VERIFIED`);
      assert.strictEqual(catDossier.categoryRevalidated, true);
      if (['SPORTS_ATHLETICS', 'GEOPOLITICS', 'MACRO_FINANCE'].includes(catDossier.categoryId)) {
        assert.strictEqual(catDossier.researchPaper, undefined, `Non-STEM category ${catDossier.categoryId} must not have arXiv paper`);
      } else {
        assert.ok(catDossier.researchPaper, `STEM category ${catDossier.categoryId} should include arXiv preprint`);
        assert.strictEqual(catDossier.researchPaper?.preprintLabel, PREPRINT_BADGE_LABEL);
      }
    }

    // Source telemetry reflects all 4 services
    assert.strictEqual(dossier.sourceTelemetry.geminiGrounding.succeeded, true);
    assert.strictEqual(dossier.sourceTelemetry.geminiGrounding.keyUsed, 'GEMINI_API_KEY2');
    assert.strictEqual(dossier.sourceTelemetry.newsapi.succeeded, true);
    assert.strictEqual(dossier.sourceTelemetry.tavily.succeeded, true);
    assert.strictEqual(dossier.sourceTelemetry.arxiv.succeeded, true);
  });

  await runTest('8. Category-scoped caching prevents cached stories from one category from bleeding into another category', async () => {
    const sportsUrl = 'https://espn.com/soccer/champions-league-real-madrid-bayern-2026';
    const sportsEntry = getCategoryScopedCacheEntry('SPORTS_ATHLETICS', sportsUrl);
    const spaceEntry = getCategoryScopedCacheEntry('SCIENCE_SPACE', sportsUrl);

    assert.ok(sportsEntry, 'Sports story should be cached under SPORTS_ATHLETICS key');
    assert.strictEqual(spaceEntry, undefined, 'Sports story must NOT exist under SCIENCE_SPACE cache key');
    assert.notStrictEqual(
      buildCategoryScopedCacheKey('SPORTS_ATHLETICS', sportsUrl),
      buildCategoryScopedCacheKey('SCIENCE_SPACE', sportsUrl)
    );
  });

  await runTest('9. Rapid category switching & concurrent requests preserve strict isolation without cross-category contamination', async () => {
    // Simulate polluted upstream APIs returning mixed stories when SPORTS_ATHLETICS is requested
    const [sportsDossier, spaceDossier] = await Promise.all([
      buildExecutiveIntelligenceDossier({
        selectedCategory: 'SPORTS_ATHLETICS',
        requestToken: 'concurrent-sports-token',
        adapters: {
          geminiGroundingFetch: async () => ({
            stories: SAMPLE_STORIES_8_CATEGORIES, // Polluted with all 8 categories!
            latencyMs: 50,
            keyUsed: 'GEMINI_API_KEY2'
          }),
          newsApiFetch: async () => ({ stories: SAMPLE_STORIES_8_CATEGORIES, latencyMs: 40 }),
          tavilyFetch: async () => ({ stories: SAMPLE_STORIES_8_CATEGORIES, latencyMs: 45 }),
          arxivFetch: async () => ({ papers: parseArxivAtomXml(SAMPLE_ARXIV_XML), latencyMs: 30 })
        }
      }),
      buildExecutiveIntelligenceDossier({
        selectedCategory: 'SCIENCE_SPACE',
        requestToken: 'concurrent-space-token',
        adapters: {
          geminiGroundingFetch: async () => ({
            stories: SAMPLE_STORIES_8_CATEGORIES, // Polluted with all 8 categories!
            latencyMs: 55,
            keyUsed: 'GEMINI_API_KEY2'
          }),
          newsApiFetch: async () => ({ stories: SAMPLE_STORIES_8_CATEGORIES, latencyMs: 42 }),
          tavilyFetch: async () => ({ stories: SAMPLE_STORIES_8_CATEGORIES, latencyMs: 48 }),
          arxivFetch: async () => ({ papers: parseArxivAtomXml(SAMPLE_ARXIV_XML), latencyMs: 35 })
        }
      })
    ]);

    // Verify SPORTS_ATHLETICS dossier rejected all 7 non-sports categories
    assert.strictEqual(sportsDossier.selectedCategory, 'SPORTS_ATHLETICS');
    assert.ok(sportsDossier.isolationAudit.crossCategoryRejected >= 7);
    for (const lead of sportsDossier.section1GlobalLead) {
      assert.strictEqual(lead.universalCategory, 'SPORTS_ATHLETICS');
    }
    assert.strictEqual(sportsDossier.section2CategoryDossiers.length, 1);
    assert.strictEqual(sportsDossier.section2CategoryDossiers[0].categoryId, 'SPORTS_ATHLETICS');
    assert.strictEqual(sportsDossier.section2CategoryDossiers[0].researchPaper, undefined);

    // Verify SCIENCE_SPACE dossier rejected all 7 non-space categories
    assert.strictEqual(spaceDossier.selectedCategory, 'SCIENCE_SPACE');
    assert.ok(spaceDossier.isolationAudit.crossCategoryRejected >= 7);
    for (const lead of spaceDossier.section1GlobalLead) {
      assert.strictEqual(lead.universalCategory, 'SCIENCE_SPACE');
    }
    assert.strictEqual(spaceDossier.section2CategoryDossiers.length, 1);
    assert.strictEqual(spaceDossier.section2CategoryDossiers[0].categoryId, 'SCIENCE_SPACE');
    assert.ok(spaceDossier.section2CategoryDossiers[0].researchPaper);
  });

  await runTest('10. When a category has only unrelated or failed upstream stories, it returns an honest EMPTY state rather than showing unrelated news', async () => {
    const emptySportsDossier = await buildExecutiveIntelligenceDossier({
      selectedCategory: 'SPORTS_ATHLETICS',
      requestToken: 'empty-sports-token',
      adapters: {
        // Only return Space and Finance stories when Sports was requested!
        geminiGroundingFetch: async () => ({
          stories: [SAMPLE_STORIES_8_CATEGORIES[1], SAMPLE_STORIES_8_CATEGORIES[4]],
          latencyMs: 30,
          keyUsed: 'GEMINI_API_KEY2'
        }),
        newsApiFetch: async () => {
          throw new Error('Simulated NewsAPI outage');
        },
        tavilyFetch: async () => ({
          stories: [SAMPLE_STORIES_8_CATEGORIES[2]],
          latencyMs: 25
        }),
        arxivFetch: async () => ({ papers: [], latencyMs: 0 })
      }
    });

    assert.strictEqual(emptySportsDossier.section1GlobalLead.length, 0);
    assert.strictEqual(emptySportsDossier.section2CategoryDossiers.length, 1);
    assert.strictEqual(emptySportsDossier.section2CategoryDossiers[0].status, 'EMPTY');
    assert.ok(
      emptySportsDossier.section2CategoryDossiers[0].emptyReason?.includes('No verified news available')
    );
  });

  console.log(`\nUniversal Dossier & Isolation Tests: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main();
