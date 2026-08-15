import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateReelCost, SUBSCRIPTION_PLANS } from '../src/saas.js';
import { findInventedOffers, REEL_AGENTS } from '../src/agents.js';

test('Gemini Lite reel cost is deterministic', () => {
  const cost = estimateReelCost({ provider:'gemini', videoSeconds:15, videoTier:'economy', generatedImages:2, voiceSeconds:15 });
  assert.equal(cost.total, 0.8247);
});

test('plan limits increase monotonically', () => {
  assert.deepEqual(SUBSCRIPTION_PLANS.map(plan => plan.monthlyVideos), [8,20,60]);
});

test('deterministic regulator flags unsupported offers', () => {
  assert.deepEqual(findInventedOffers('Oferta válida: 10%', 'Aprovechá 10% y pagá ₲50.000'), ['₲50.000']);
});

test('campaign swarm includes mandatory control roles', () => {
  assert.deepEqual(REEL_AGENTS.map(agent => agent.id), ['ceo','creative','visual','copy','guard','producer']);
});
