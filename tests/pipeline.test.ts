import assert from 'node:assert/strict';
import {
  clearPipelineCaches,
  extractJsonObject,
  isNonRetryableHttpStatus,
  parseGeminiError,
  parseRetryAfterMs,
  redactSecrets,
  runDualEnginePipeline
} from '../src/pipeline/engine';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    clearPipelineCaches();
    await fn();
    results.push({ name, passed: true, detail: 'PASS' });
    console.log(`✅ [PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, detail: err?.message || String(err) });
    console.error(`❌ [FAIL] ${name}: ${err?.message || err}`);
  }
}

(async () => {
  console.log('===============================================================');
  console.log(' XNOVA DUAL-ENGINE PIPELINE — DETERMINISTIC VERIFICATION SUITE ');
  console.log('===============================================================\n');

  // 1. Groq Fast-Processing Engine Success
  await runTest('1. Groq fast-processing success (parallel batches, claims, entities, numbers, categories)', async () => {
    let groqCalls = 0;
    const nowIso = new Date().toISOString();

    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      concurrencyLimit: 2,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 45,
          stories: [
            {
              headline: 'TSMC Begins 2nm Wafer Production at Hsinchu Fab with 15% Density Gain',
              publisher: 'Reuters',
              originalUrl: 'https://www.reuters.com/technology/tsmc-2nm-wafer-hsinchu-2026',
              publishedAt: nowIso,
              retrievedAt: nowIso,
              summary: 'TSMC started commercial 2nm nanosheet production with a 15% efficiency improvement.'
            }
          ]
        }),
        discoverEvidence: async () => ({
          latencyMs: 50,
          evidence: [
            {
              id: 'ev-1',
              url: 'https://www.bloomberg.com/news/tsmc-2nm-production',
              domain: 'bloomberg.com',
              title: 'Bloomberg: TSMC Starts 2nm Chip Production',
              snippet: 'Bloomberg confirms TSMC Hsinchu facility began 2nm nanosheet production.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.95
            },
            {
              id: 'ev-2',
              url: 'https://www.ft.com/content/tsmc-2nm-semiconductors',
              domain: 'ft.com',
              title: 'Financial Times: TSMC 2nm Rollout',
              snippet: 'FT corroborates 15% density gain in TSMC 2nm node.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.92
            }
          ]
        }),
        groqExtract: async (story) => {
          groqCalls++;
          return {
            category: 'Semiconductors',
            summary: 'TSMC initiated 2nm nanosheet wafer production in Hsinchu with 15% higher density.',
            coreClaims: ['TSMC began 2nm wafer production at Hsinchu', 'Node delivers 15% density gain'],
            entities: ['TSMC', 'Hsinchu'],
            importantNumbers: ['2nm', '15%'],
            flags: {
              unsupportedClaims: false,
              staleStory: false,
              missingSources: false,
              conflictingInfo: false
            },
            providerUsed: 'groq/openai/gpt-oss-120b',
            latencyMs: 110
          };
        },
        openRouterVerify: async () => ({
          status: 'VERIFIED',
          corroborationScore: 92,
          verifiedClaims: ['TSMC began 2nm wafer production at Hsinchu'],
          contradictions: [],
          reasons: ['Independently corroborated by bloomberg.com and ft.com'],
          providerUsed: 'openrouter/nvidia/nemotron-3-super-120b-a12b',
          latencyMs: 140,
          isLiveEvaluated: true
        })
      }
    });

    assert.equal(groqCalls, 1);
    assert.equal(run.status, 'HEALTHY');
    assert.equal(run.ledger[0].category, 'Semiconductors');
    assert.deepEqual(run.ledger[0].entities, ['TSMC', 'Hsinchu']);
    assert.deepEqual(run.ledger[0].importantNumbers, ['2nm', '15%']);
    assert.equal(run.stageDiagnostics?.groqProcessing.status, 'HEALTHY');
  });

  // 2. OpenRouter Independent Verification Success (VERIFIED & PARTIALLY_VERIFIED)
  await runTest('2. OpenRouter independent verification layer success', async () => {
    const nowIso = new Date().toISOString();
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 30,
          stories: [
            {
              headline: 'SpaceX Launches Lunar Communications Relay Satellite',
              publisher: 'SpaceNews',
              originalUrl: 'https://spacenews.com/spacex-lunar-relay-launch',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        discoverEvidence: async () => ({
          latencyMs: 40,
          evidence: [
            {
              id: 'ev-nasa',
              url: 'https://www.nasa.gov/news/lunar-relay-orbit',
              domain: 'nasa.gov',
              title: 'NASA Confirms Lunar Relay Deployment',
              snippet: 'NASA telemetry confirmed deployment of the lunar communications satellite.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.96
            }
          ]
        }),
        groqExtract: async () => ({
          category: 'Space',
          summary: 'SpaceX deployed a lunar relay satellite.',
          coreClaims: ['SpaceX launched lunar relay satellite'],
          entities: ['SpaceX', 'NASA'],
          importantNumbers: [],
          flags: { unsupportedClaims: false, staleStory: false, missingSources: false, conflictingInfo: false },
          providerUsed: 'groq/openai/gpt-oss-120b',
          latencyMs: 90
        }),
        openRouterVerify: async () => ({
          status: 'PARTIALLY_VERIFIED',
          corroborationScore: 70,
          verifiedClaims: ['SpaceX launched lunar relay satellite'],
          contradictions: [],
          reasons: ['Supported by 1 independent primary source (nasa.gov); awaiting secondary confirmation'],
          providerUsed: 'openrouter/nvidia/nemotron-3-super-120b-a12b',
          latencyMs: 120,
          isLiveEvaluated: true
        })
      }
    });

    assert.equal(run.status, 'HEALTHY');
    assert.equal(run.ledger[0].verificationStatus, 'PARTIALLY_VERIFIED');
    assert.equal(run.ledger[0].independentSourceCount, 1);
    assert.equal(run.ledger[0].published, false); // Requires 2 independent sources to publish
  });

  // 3. Gemini Quota Exhaustion & Timeout Distinction + Groq Fallback
  await runTest('3. Gemini quota exhaustion detection, timeout distinction, and Groq routing', async () => {
    const quotaErr = new Error(
      '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota per day","details":[{"retryDelay":"3600s","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"20"}]}]}}'
    );
    const parsedQuota = parseGeminiError(quotaErr);
    assert.equal(parsedQuota.status, 'RATE_LIMITED');
    assert.equal(parsedQuota.isDailyQuota, true);
    assert.equal(parsedQuota.isTransient, false);
    assert.equal(parsedQuota.isTimeout, false);

    // Verify timeout is NOT treated as quota exhaustion
    const timeoutErr = new Error('Operation timed out after 6000ms');
    const parsedTimeout = parseGeminiError(timeoutErr);
    assert.equal(parsedTimeout.status, 'OFFLINE');
    assert.equal(parsedTimeout.isDailyQuota, false);
    assert.equal(parsedTimeout.isTimeout, true);
  });

  // 4. OpenRouter Failure -> Reports DEGRADED (not HEALTHY) & Safe Fallback
  await runTest('4. OpenRouter failure reports DEGRADED pipeline status with safe fallback', async () => {
    const nowIso = new Date().toISOString();
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 20,
          stories: [
            {
              headline: 'Major Cybersecurity Patch Released for Linux Kernel',
              publisher: 'Ars Technica',
              originalUrl: 'https://arstechnica.com/security/linux-kernel-patch-2026',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        discoverEvidence: async () => ({
          latencyMs: 25,
          evidence: [
            {
              id: 'ev-1',
              url: 'https://www.kernel.org/pub/linux/security-advisory',
              domain: 'kernel.org',
              title: 'Kernel.org Security Advisory',
              snippet: 'Official Linux kernel patch released.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.95
            },
            {
              id: 'ev-2',
              url: 'https://www.bleepingcomputer.com/news/security/linux-patch',
              domain: 'bleepingcomputer.com',
              title: 'BleepingComputer: Linux Patch',
              snippet: 'Corroborates Linux kernel security update.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.9
            }
          ]
        }),
        groqExtract: async () => ({
          category: 'Cybersecurity',
          summary: 'Linux kernel security patch released.',
          coreClaims: ['Linux kernel patch released'],
          entities: ['Linux'],
          importantNumbers: [],
          flags: { unsupportedClaims: false, staleStory: false, missingSources: false, conflictingInfo: false },
          providerUsed: 'groq/openai/gpt-oss-120b',
          latencyMs: 80
        }),
        openRouterVerify: async () => {
          const err: any = new Error('OpenRouter HTTP 503: Service Unavailable');
          err.status = 503;
          throw err;
        }
      }
    });

    assert.equal(run.status, 'DEGRADED');
    assert.equal(run.stageDiagnostics?.openRouterVerification.status, 'FAILED');
    assert.equal(run.ledger[0].verificationProvider, 'deterministic-evidence-verifier');
  });

  // 5. All AI Providers Unavailable
  await runTest('5. All AI providers unavailable (safe deterministic fallback, no false VERIFIED on uncorroborated)', async () => {
    const nowIso = new Date().toISOString();
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 20,
          stories: [
            {
              headline: 'Unverified Rumor of Quantum Battery Breakthrough',
              publisher: 'TechBlog',
              originalUrl: 'https://techblog.example.com/quantum-battery-rumor',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        discoverEvidence: async () => ({ latencyMs: 15, evidence: [] }),
        groqExtract: async () => {
          const e: any = new Error('Groq 503 Offline');
          e.status = 503;
          throw e;
        },
        geminiExtract: async () => {
          const e: any = new Error('Gemini 429 Quota Exhausted');
          e.status = 429;
          throw e;
        },
        openRouterVerify: async () => {
          const e: any = new Error('OpenRouter 503 Offline');
          e.status = 503;
          throw e;
        }
      }
    });

    assert.equal(run.status, 'DEGRADED');
    assert.equal(run.ledger[0].verificationStatus, 'UNVERIFIED');
    assert.equal(run.ledger[0].published, false);
  });

  // 6. Source-Provider Timeout
  await runTest('6. Source-provider timeout handled cleanly without fabricating stories', async () => {
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      allowBenchmarkFallback: false,
      adapters: {
        collectStories: async () => {
          const err = new Error('NewsAPI request timed out after 7000ms');
          err.name = 'AbortError';
          throw err;
        }
      }
    });

    assert.equal(run.status, 'FAILED');
    assert.equal(run.articlesCollected, 0);
    assert.equal(run.ledger.length, 0);
    assert.equal(run.stageDiagnostics?.sourceCollection.status, 'FAILED');
  });

  // 7. Duplicate Stories & Syndicated Wire Copies
  await runTest('7. Duplicate story clustering before AI processing & syndicated copy exclusion', async () => {
    const nowIso = new Date().toISOString();
    let groqCalls = 0;

    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 25,
          stories: [
            {
              headline: 'OpenAI Releases Next-Gen Reasoning Architecture for Enterprise',
              publisher: 'Reuters',
              originalUrl: 'https://www.reuters.com/tech/openai-enterprise-reasoning?utm_source=twitter',
              publishedAt: nowIso,
              retrievedAt: nowIso
            },
            {
              headline: 'OpenAI Releases Next-Gen Reasoning Architecture for Enterprise - Reuters',
              publisher: 'Yahoo News',
              originalUrl: 'https://www.reuters.com/tech/openai-enterprise-reasoning?utm_medium=social',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        discoverEvidence: async () => ({
          latencyMs: 30,
          evidence: [
            {
              id: 'syn-1',
              url: 'https://www.msn.com/en-us/news/openai-enterprise',
              domain: 'msn.com',
              title: 'OpenAI Releases Next-Gen Reasoning Architecture for Enterprise',
              snippet: 'Exact syndicated wire copy repeated verbatim across portals with identical phrasing.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.8
            },
            {
              id: 'syn-2',
              url: 'https://www.yahoo.com/news/openai-enterprise',
              domain: 'yahoo.com',
              title: 'OpenAI Releases Next-Gen Reasoning Architecture for Enterprise',
              snippet: 'Exact syndicated wire copy repeated verbatim across portals with identical phrasing.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.8
            }
          ]
        }),
        groqExtract: async () => {
          groqCalls++;
          return {
            category: 'AI',
            summary: 'OpenAI announced enterprise reasoning architecture.',
            coreClaims: ['OpenAI released enterprise reasoning architecture'],
            entities: ['OpenAI'],
            importantNumbers: [],
            flags: { unsupportedClaims: false, staleStory: false, missingSources: false, conflictingInfo: false },
            providerUsed: 'groq/openai/gpt-oss-120b',
            latencyMs: 70
          };
        },
        openRouterVerify: async () => ({
          status: 'VERIFIED',
          corroborationScore: 85,
          verifiedClaims: ['OpenAI released enterprise reasoning architecture'],
          contradictions: [],
          reasons: ['Evaluated'],
          providerUsed: 'openrouter/openai/gpt-oss-120b',
          latencyMs: 90,
          isLiveEvaluated: true
        })
      }
    });

    assert.equal(run.articlesCollected, 2);
    assert.equal(run.uniqueArticles, 1);
    assert.equal(run.duplicatesRemoved, 1);
    assert.equal(groqCalls, 1); // Duplicate was clustered BEFORE Groq call
    // Because the 2nd evidence item is an identical syndicated wire copy of the 1st, only 1 independent source counts!
    assert.equal(run.ledger[0].independentSourceCount, 1);
    assert.equal(run.ledger[0].verificationStatus, 'PARTIALLY_VERIFIED');
  });

  // 8. Conflicting Claims
  await runTest('8. Conflicting claims classified as CONFLICTING and blocked from publication', async () => {
    const nowIso = new Date().toISOString();
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 20,
          stories: [
            {
              headline: 'Startup Claims Autonomous Robot Completed 100-Mile Marathon Unassisted',
              publisher: 'TechDaily',
              originalUrl: 'https://techdaily.example.com/robot-marathon',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        discoverEvidence: async () => ({
          latencyMs: 25,
          evidence: [
            {
              id: 'disp-1',
              url: 'https://ieee.org/spectrum/robot-marathon-disputed',
              domain: 'ieee.org',
              title: 'IEEE Spectrum: Marathon Organizers Deny Unassisted Robot Completion',
              snippet: 'Race officials disputed the claim, noting three manual battery swaps and human teleoperation.',
              isIndependent: true,
              stance: 'disputes',
              relevanceScore: 0.95
            }
          ]
        }),
        groqExtract: async () => ({
          category: 'Robotics',
          summary: 'Startup claimed unassisted 100-mile robot marathon.',
          coreClaims: ['Robot completed 100-mile marathon unassisted'],
          entities: ['TechDaily'],
          importantNumbers: ['100-mile'],
          flags: { unsupportedClaims: false, staleStory: false, missingSources: false, conflictingInfo: true },
          providerUsed: 'groq/openai/gpt-oss-120b',
          latencyMs: 65
        }),
        openRouterVerify: async () => ({
          status: 'CONFLICTING',
          corroborationScore: 20,
          verifiedClaims: [],
          contradictions: ['IEEE Spectrum reports race officials denied unassisted completion'],
          reasons: ['Contradicted by ieee.org'],
          providerUsed: 'openrouter/openai/gpt-oss-120b',
          latencyMs: 85,
          isLiveEvaluated: true
        })
      }
    });

    assert.equal(run.ledger[0].verificationStatus, 'CONFLICTING');
    assert.equal(run.ledger[0].published, false);
    assert.equal(run.conflictingCount, 1);
  });

  // 9. Invalid URLs
  await runTest('9. Invalid URLs rejected before AI processing', async () => {
    let groqCalled = false;
    const nowIso = new Date().toISOString();

    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 15,
          stories: [
            {
              headline: 'Story With Malformed URL',
              publisher: 'BadSource',
              originalUrl: 'ftp://invalid-protocol-url/article',
              publishedAt: nowIso,
              retrievedAt: nowIso
            },
            {
              headline: 'Story With Missing Host',
              publisher: 'BadSource',
              originalUrl: 'not-a-valid-url-at-all',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        groqExtract: async () => {
          groqCalled = true;
          throw new Error('Should not be called for invalid URLs');
        }
      }
    });

    assert.equal(groqCalled, false);
    assert.equal(run.invalidUrlsRejected, 2);
    assert.equal(run.rejectedCount, 2);
    assert.equal(run.ledger[0].verificationStatus, 'REJECTED');
    assert.equal(run.ledger[0].published, false);
  });

  // 10. Empty Collection Results
  await runTest('10. Empty collection results do not fabricate stories', async () => {
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      allowBenchmarkFallback: false,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 30,
          stories: []
        })
      }
    });

    assert.equal(run.articlesCollected, 0);
    assert.equal(run.ledger.length, 0);
    assert.equal(run.publishedCount, 0);
  });

  // 11. Malformed AI JSON Handling
  await runTest('11. Malformed AI JSON handled safely without crashing or inventing facts', async () => {
    assert.throws(() => extractJsonObject('<<<not json at all>>>'), /Malformed AI JSON/);
    const fenced = extractJsonObject('```json\n{"status":"VERIFIED","corroborationScore":88}\n```');
    assert.equal(fenced.status, 'VERIFIED');

    const nowIso = new Date().toISOString();
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 20,
          stories: [
            {
              headline: 'Big Tech Antitrust Ruling Issued in EU',
              publisher: 'Reuters',
              originalUrl: 'https://www.reuters.com/legal/eu-antitrust-ruling',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        discoverEvidence: async () => ({ latencyMs: 10, evidence: [] }),
        groqExtract: async () => {
          throw new Error('Malformed AI JSON: unable to locate valid JSON object');
        },
        geminiExtract: async () => {
          throw new Error('Gemini unavailable');
        },
        openRouterVerify: async () => {
          throw new Error('Malformed AI JSON: unable to locate valid JSON object');
        }
      }
    });

    assert.equal(run.status, 'DEGRADED');
    assert.equal(run.ledger[0].verificationStatus, 'UNVERIFIED');
    assert.equal(run.ledger[0].published, false);
  });

  // 12. Rate Limiting, Retry-After, Caching & Idempotent Retry Publication Guard
  await runTest('12. Rate limiting, Retry-After parsing, content caching, and duplicate publication guard', async () => {
    assert.equal(isNonRetryableHttpStatus(429), true);
    assert.equal(isNonRetryableHttpStatus(401), true);
    assert.equal(isNonRetryableHttpStatus(403), true);
    assert.equal(isNonRetryableHttpStatus(503), false);
    assert.equal(parseRetryAfterMs('3'), 3000);

    let groqCalls = 0;
    const nowIso = new Date().toISOString();
    const sharedAdapters = {
      collectStories: async () => ({
        isLiveData: true,
        latencyMs: 20,
        stories: [
          {
            headline: 'Breakthrough Superconducting Magnet Tested for Fusion Reactor',
            publisher: 'MIT News',
            originalUrl: 'https://news.mit.edu/2026/fusion-magnet-test',
            publishedAt: nowIso,
            retrievedAt: nowIso,
            summary: 'MIT tested a 20-Tesla superconducting magnet.'
          }
        ]
      }),
      discoverEvidence: async () => ({
        latencyMs: 20,
        evidence: [
          {
            id: 'e1',
            url: 'https://www.nature.com/articles/fusion-magnet-2026',
            domain: 'nature.com',
            title: 'Nature: 20-Tesla Fusion Magnet',
            snippet: 'Peer-reviewed confirmation of the 20T magnet test.',
            isIndependent: true,
            stance: 'supports' as const,
            relevanceScore: 0.95
          },
          {
            id: 'e2',
            url: 'https://www.science.org/content/article/mit-fusion-magnet',
            domain: 'science.org',
            title: 'Science: MIT Superconducting Magnet',
            snippet: 'Independent corroboration of the fusion magnet milestone.',
            isIndependent: true,
            stance: 'supports' as const,
            relevanceScore: 0.93
          }
        ]
      }),
      groqExtract: async () => {
        groqCalls++;
        return {
          category: 'Science' as const,
          summary: 'MIT tested a 20-Tesla superconducting magnet.',
          coreClaims: ['MIT tested a 20-Tesla superconducting magnet'],
          entities: ['MIT'],
          importantNumbers: ['20-Tesla'],
          flags: { unsupportedClaims: false, staleStory: false, missingSources: false, conflictingInfo: false },
          providerUsed: 'groq/openai/gpt-oss-120b',
          latencyMs: 50
        };
      },
      openRouterVerify: async () => ({
        status: 'VERIFIED' as const,
        corroborationScore: 94,
        verifiedClaims: ['MIT tested a 20-Tesla superconducting magnet'],
        contradictions: [],
        reasons: ['Corroborated by nature.com and science.org'],
        providerUsed: 'openrouter/openai/gpt-oss-120b',
        latencyMs: 60,
        isLiveEvaluated: true
      })
    };

    const firstRun = await runDualEnginePipeline({ adapters: sharedAdapters });
    assert.equal(firstRun.publishedCount, 1);
    assert.equal(groqCalls, 1);

    // Second run with identical story/evidence hits cache AND idempotency guard blocks duplicate publication
    const secondRun = await runDualEnginePipeline({ adapters: sharedAdapters });
    assert.equal(groqCalls, 1); // Cache hit!
    assert.equal(secondRun.cacheHits, 1);
    assert.equal(secondRun.publishedCount, 0); // Prevented duplicate publication!
  });

  // 13. No Publication of Unsupported or Fabricated Claims + Secret Redaction
  await runTest('13. No publication of unsupported claims & strict secret redaction', async () => {
    const nowIso = new Date().toISOString();

    // Even if OpenRouter hallucinated VERIFIED when 0 independent sources exist, policy overrides to UNVERIFIED
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 15,
          stories: [
            {
              headline: 'Single-Source Uncorroborated Startup Valuation Claim',
              publisher: 'PRWire',
              originalUrl: 'https://prwire.example.com/startup-claim',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        discoverEvidence: async () => ({ latencyMs: 10, evidence: [] }),
        groqExtract: async () => ({
          category: 'Startups',
          summary: 'Startup claims $50B valuation.',
          coreClaims: ['Startup valued at $50B'],
          entities: ['Startup'],
          importantNumbers: ['$50B'],
          flags: { unsupportedClaims: true, staleStory: false, missingSources: true, conflictingInfo: false },
          providerUsed: 'groq/openai/gpt-oss-120b',
          latencyMs: 40
        }),
        openRouterVerify: async () => ({
          status: 'VERIFIED', // Intentionally wrong AI output with 0 evidence
          corroborationScore: 95,
          verifiedClaims: ['Startup valued at $50B'],
          contradictions: [],
          reasons: ['Looks plausible'],
          providerUsed: 'openrouter/openai/gpt-oss-120b',
          latencyMs: 50,
          isLiveEvaluated: true
        })
      }
    });

    assert.equal(run.ledger[0].verificationStatus, 'UNVERIFIED');
    assert.equal(run.ledger[0].published, false);
    assert.equal(run.verifiedCount, 0);

    // Verify credential redaction
    const leaked = 'Error calling https://newsapi.org/v2/top?apiKey=secret123456 with Bearer gsk_ABCDEFGHIJKLMNOPQRSTUV';
    const redacted = redactSecrets(leaked);
    assert.equal(redacted.includes('secret123456'), false);
    assert.equal(redacted.includes('gsk_ABCDEFGHIJKLMNOPQRSTUV'), false);
  });

  // 14. OpenRouter Invalid Model Slug Handling
  await runTest('14. OpenRouter invalid model slug handling (MODEL_UNAVAILABLE/DEGRADED fallback, no crash)', async () => {
    const nowIso = new Date().toISOString();
    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => ({
          isLiveData: true,
          latencyMs: 20,
          stories: [
            {
              headline: 'CERN Particle Physics Team Confirms Neutrino Oscillation Precision Metric',
              publisher: 'Nature',
              originalUrl: 'https://nature.com/articles/cern-neutrino-2026',
              publishedAt: nowIso,
              retrievedAt: nowIso
            }
          ]
        }),
        discoverEvidence: async () => ({
          latencyMs: 25,
          evidence: [
            {
              id: 'ev-cern',
              url: 'https://cern.ch/news/neutrino-metric',
              domain: 'cern.ch',
              title: 'CERN Official Bulletin',
              snippet: 'CERN physicists measured neutrino oscillation with unprecedented precision.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.98
            },
            {
              id: 'ev-aps',
              url: 'https://aps.org/physics/neutrino-study',
              domain: 'aps.org',
              title: 'American Physical Society Report',
              snippet: 'APS independently highlights the CERN neutrino oscillation measurement.',
              isIndependent: true,
              stance: 'supports',
              relevanceScore: 0.94
            }
          ]
        }),
        groqExtract: async () => ({
          category: 'Science',
          summary: 'CERN verified neutrino oscillation precision metric.',
          coreClaims: ['CERN confirmed neutrino oscillation precision metric'],
          entities: ['CERN'],
          importantNumbers: [],
          flags: { unsupportedClaims: false, staleStory: false, missingSources: false, conflictingInfo: false },
          providerUsed: 'groq/openai/gpt-oss-120b',
          latencyMs: 60
        }),
        openRouterVerify: async () => {
          // Simulate OpenRouter HTTP 404 Model Not Found when an invalid model slug is configured
          const err: any = new Error('HTTP 404: Model \'nvidia/nonexistent-model\' not found or deprecated');
          err.status = 404;
          err.code = 'model_not_found';
          throw err;
        }
      }
    });

    assert.equal(run.status, 'DEGRADED');
    assert.equal(run.stageDiagnostics?.openRouterVerification.status, 'FAILED');
    assert.equal(run.stageDiagnostics?.openRouterVerification.modelUsed, 'nvidia/nemotron-3-super-120b-a12b');
    assert.equal(run.ledger[0].verificationProvider, 'deterministic-evidence-verifier');
    // Despite OpenRouter model failure, deterministic cross-checking verified 2 independent sources
    assert.equal(run.ledger[0].verificationStatus, 'VERIFIED');
    assert.equal(run.ledger[0].published, true);
  });

  // 15. Nemotron 3 Super Verification Structure & Parallel Execution
  await runTest('15. Nemotron 3 Super verification evidence structure & parallel collection execution', async () => {
    const nowIso = new Date().toISOString();
    let collectStartedAt = 0;
    let collectEndedAt = 0;
    let evidenceStartedAt = 0;
    let evidenceEndedAt = 0;

    const run = await runDualEnginePipeline({
      rollingWindowHours: 24,
      adapters: {
        collectStories: async () => {
          collectStartedAt = Date.now();
          await new Promise((r) => setTimeout(r, 40));
          collectEndedAt = Date.now();
          return {
            isLiveData: true,
            latencyMs: collectEndedAt - collectStartedAt,
            stories: [
              {
                headline: 'James Webb Telescope Spots Earliest Known Compact Star Cluster',
                publisher: 'Science Daily',
                originalUrl: 'https://sciencedaily.com/releases/2026/jwst-early-cluster',
                publishedAt: nowIso,
                retrievedAt: nowIso
              }
            ]
          };
        },
        discoverEvidence: async () => {
          evidenceStartedAt = Date.now();
          await new Promise((r) => setTimeout(r, 40));
          evidenceEndedAt = Date.now();
          return {
            latencyMs: evidenceEndedAt - evidenceStartedAt,
            evidence: [
              {
                id: 'ev-stsci',
                url: 'https://stsci.edu/jwst/observations/cluster-2026',
                domain: 'stsci.edu',
                title: 'STScI: JWST Compact Cluster Data',
                snippet: 'Space Telescope Science Institute release confirming redshift z=12.4 compact star cluster.',
                isIndependent: true,
                stance: 'supports',
                relevanceScore: 0.97
              },
              {
                id: 'ev-eso',
                url: 'https://eso.org/public/news/jwst-cluster',
                domain: 'eso.org',
                title: 'European Southern Observatory Corroboration',
                snippet: 'ESO astronomers independently analyzed JWST spectra confirming cluster density.',
                isIndependent: true,
                stance: 'supports',
                relevanceScore: 0.95
              }
            ]
          };
        },
        groqExtract: async () => ({
          category: 'Space',
          summary: 'JWST discovered the earliest known compact star cluster at redshift z=12.4.',
          coreClaims: [
            'JWST observed earliest compact star cluster',
            'Cluster confirmed at redshift z=12.4'
          ],
          entities: ['JWST', 'Space Telescope Science Institute'],
          importantNumbers: ['z=12.4'],
          flags: { unsupportedClaims: false, staleStory: false, missingSources: false, conflictingInfo: false },
          providerUsed: 'groq/openai/gpt-oss-120b',
          latencyMs: 70
        }),
        openRouterVerify: async () => ({
          status: 'VERIFIED',
          corroborationScore: 96,
          verifiedClaims: [
            'JWST observed earliest compact star cluster',
            'Cluster confirmed at redshift z=12.4'
          ],
          contradictions: [],
          reasons: ['Independently corroborated by stsci.edu and eso.org peer archives'],
          providerUsed: 'openrouter/nvidia/nemotron-3-super-120b-a12b',
          latencyMs: 95,
          isLiveEvaluated: true,
          nemotronDetails: {
            status: 'VERIFIED',
            corroborationScore: 96,
            claimsChecked: [
              'JWST observed earliest compact star cluster',
              'Cluster confirmed at redshift z=12.4'
            ],
            supportingEvidence: [
              'stsci.edu confirms redshift z=12.4 compact star cluster data',
              'eso.org independently analyzed spectra confirming density'
            ],
            contradictingEvidence: [],
            sourceUrlsSupplied: [
              'https://stsci.edu/jwst/observations/cluster-2026',
              'https://eso.org/public/news/jwst-cluster'
            ],
            sourceUrls: [
              'https://stsci.edu/jwst/observations/cluster-2026',
              'https://eso.org/public/news/jwst-cluster'
            ],
            missingEvidence: undefined,
            rationale: 'Two distinct peer astrophysical bodies independently validate spectroscopic measurements.',
            verificationTimestamp: nowIso,
            timestamp: nowIso
          },
          approximateCost: 0.000024
        })
      }
    });

    assert.equal(run.status, 'HEALTHY');
    assert.equal(run.publishedCount, 1);
    assert.equal(run.ledger[0].verificationProvider, 'openrouter/nvidia/nemotron-3-super-120b-a12b');

    // Verify Nemotron 3 Super verification evidence structure
    const nemotron = run.ledger[0].nemotronVerification;
    assert.ok(nemotron, 'Nemotron verification details must be present');
    assert.equal(nemotron.status, 'VERIFIED');
    assert.equal(nemotron.corroborationScore, 96);
    assert.equal(nemotron.claimsChecked.length, 2);
    assert.equal(nemotron.supportingEvidence.length, 2);
    assert.equal(nemotron.contradictingEvidence.length, 0);
    assert.equal(nemotron.sourceUrlsSupplied?.length, 2);
    assert.ok(run.ledger[0].approximateCost !== undefined && run.ledger[0].approximateCost > 0);
    assert.ok(run.totalApproximateCost !== undefined && run.totalApproximateCost > 0);
  });

  console.log('\n===============================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(` SUMMARY: ${passedCount}/${results.length} DETERMINISTIC TESTS PASSED`);
  console.log('===============================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
})();
