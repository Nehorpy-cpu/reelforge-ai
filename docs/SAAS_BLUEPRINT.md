# Reel SaaS blueprint

## Current state

The repository is now a multi-tenant React/Vite + Express MVP with authentication, organization boundaries, SQLite persistence, a render queue, usage ledger, provider-cost tracking, Bancard billing transactions and audit records. Production scale still requires shared object storage, PostgreSQL, a durable external queue and official social-network authorization.

## Target workflow

1. A company creates a workspace and selects its market/language.
2. It imports authorized sources (website/catalog feed and OAuth-connected social accounts) or pastes/uploads exports.
3. The Brand DNA agent extracts audience, tone, visual rules, content pillars, CTAs, prohibited claims and normalized products. The customer approves it before generation.
4. A campaign planner selects product, objective, network, duration and format.
5. A creative director emits a structured reel brief: hook, script, shot list, atmosphere prompt, video prompts, voice direction, caption timing, post copy and hashtags.
6. Render jobs create scene images/video segments, voice/audio and deterministic subtitles, then assemble a 9:16 MP4.
7. A policy/brand QA pass checks claims, logo/product fidelity, safe zones, subtitle timing and duration.
8. Only a successful final render consumes one monthly video credit. Failed provider renders still remain visible as infrastructure cost.

## Recommended production boundaries

- `organizations`, `members`, `brand_profiles`, `social_connections`
- `products`, `product_assets`, `source_snapshots`, `source_evidence`
- `campaigns`, `creative_briefs`, `render_jobs`, `render_attempts`, `artifacts`
- `subscriptions`, `usage_ledger`, `provider_cost_events`

Use Postgres with row-level tenant isolation, S3-compatible object storage, and a durable queue. Never store large base64 media in Postgres. Record provider request IDs, model IDs, measured usage and list-price snapshot for every attempt.

## Quota rule

Reserve a credit transactionally when a render starts. Finalize it when the deliverable succeeds; release it on failure. Enforce `used + reserved < monthly_limit` on the server, never only in the UI. Use an idempotency key per generation request. Signed Bancard confirmations are the source of truth for paid plan changes.

## Social DNA ingestion

Do not scrape logged-in Instagram/TikTok pages. Use official OAuth/API permissions where available, website/catalog feeds, CSV exports and customer uploads. Keep evidence next to every extracted fact so the customer can correct the DNA. Refresh source snapshots on demand and require approval before replacing an active DNA version.

## Campaign agent swarm

Adapted from the existing MetaBot.OS campaign pattern: CEO defines strategy; Creative writes the timed reel; Visual creates coherent scene prompts; Copy produces subtitles and social text; Guard audits Meta policy and brand constraints; Producer enforces quota, duration, cost and render readiness. Guard runs before any paid render or publication. Server-side deterministic checks flag prices and discounts absent from the approved brief even when the model says the campaign is safe.

## Voice references and provenance

Every uploaded reference must record its source and authorized owner. The application extracts speaking characteristics to direct Gemini/AI Studio TTS and does not offer exact voice cloning. Generated advertising keeps an internal provenance record linking the selected reference profile, script, model and provider request.

## Suggested commercial plans

Starter: 8 videos/month, 15 seconds, 1 brand, ₲299,000. Growth: 20 videos/month, 30 seconds, 2 brands, ₲749,000. Agency: 60 videos/month, 30 seconds, 10 brands, ₲1,890,000. These are launch hypotheses; validate conversion and actual retry rates before publishing.

Video length and quality must be capped per plan because seconds of generated video dominate COGS. Add paid credit packs instead of silently allowing overages.
