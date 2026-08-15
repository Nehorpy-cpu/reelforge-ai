import './src/server/env.js';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { estimateReelCost, SUBSCRIPTION_PLANS } from './src/saas.js';
import { REEL_AGENTS } from './src/agents.js';
import { migrate } from './src/server/db.js';
import { AuthRequest, registerAuthRoutes, registerMeRoute, requireAuth, requireRole } from './src/server/auth.js';
import { registerWorkspaceRoutes } from './src/server/workspace.js';
import { db, id, json, now } from './src/server/db.js';
import { consumeReservation, currentEntitlement, releaseReservation, reserveVideo } from './src/server/usage.js';
import { registerBillingRoutes } from './src/server/billing.js';
import { requireAiQuota } from './src/server/ai-quota.js';
import { AI_MODELS } from './src/ai-models.js';
import { runCampaignAgents, type AgentId } from './src/server/agent-runtime.js';

let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is missing');
    }
    // Video generation/editing runs with background:false, so interactions.create
    // blocks until the render finishes (1–3 min). The SDK default timeout is 1 min,
    // which kills longer renders (notably edits) — raise it well above max render time.
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 300000 }, // 5 minutes
    });
  }
  return aiClient;
}

// Product and atmosphere reference images arrive from the client as base64
// (either a selected suggestion or images the user uploaded). Each is forwarded
// straight on to Gemini — the server keeps no image state of its own.
type ImageMime =
  | 'image/png' | 'image/jpeg' | 'image/webp'
  | 'image/heic' | 'image/heif' | 'image/gif' | 'image/bmp' | 'image/tiff';

interface InlineImage {
  data: string;       // base64, without the data: URI prefix
  mimeType: ImageMime;
}

interface VoiceConfigBody {
  enabled?: boolean;
  voiceId?: string;
  voiceName?: string;
  accent?: string;
  toneDescription?: string;
  customScript?: string;
}

interface GenerateBody {
  productDesc?: string;
  atmosphereDesc?: string;
  productImages?: InlineImage[];
  atmosphereImages?: InlineImage[];
  voiceConfig?: VoiceConfigBody;
}

function validateInlineImages(images: InlineImage[], maxItems = 4) {
  if (!Array.isArray(images) || images.length > maxItems) throw new Error(`Se permiten hasta ${maxItems} imágenes por solicitud.`);
  let encodedBytes = 0;
  for (const image of images) {
    if (!image || !/^image\/(png|jpeg|webp|heic|heif|gif)$/.test(String(image.mimeType)) || !/^[A-Za-z0-9+/=]+$/.test(String(image.data || ''))) throw new Error('Imagen o tipo MIME inválido.');
    encodedBytes += image.data.length;
  }
  if (encodedBytes > 10 * 1024 * 1024) throw new Error('Las imágenes superan el límite permitido.');
}

// Turns a tiny setting word/phrase ("jungle", "Mediterranean studio") into one
// ~100-word natural-language image prompt for the configured image model: a clean, empty,
// on-aesthetic product-environment shot with a clear staging surface.
const ATMOSPHERE_DIRECTOR_SYSTEM_INSTRUCTION = `#Your Role

You are an art director, prompt writer and **materials aestheticist** for the Omni product-image flow. A user types a tiny setting input — often a single word. You don't depict the place; you **translate it into premium materials, palette and light**, and return **one natural-language prompt (~100 words)** for Instant Ramen that yields a minimal, textural product-photography vignette: a gorgeous surface, simple planes, and clean space for a small product. Elite product-photographer's-portfolio quality.

### The rule that governs everything

**Decode, don't depict.** Read the setting as a cue for materials, color and light — never as a literal scene. "Log cabin" is not a room with furniture; it's warm timber, grain and low sun. Strip away architecture, props, furniture and lifestyle. The *material* is the subject.

### Constant quality core (every image)

- **Photo-real product photography only.** Never anime, illustration, painting, sketch, render-toy, fantasy or graphic-design looks.
- **Real camera:** full-frame digital SLR, 85mm prime, true-to-life colour, exquisite fine texture, shallow depth of field.
- **Tight, textural crop:** move in close on a small, beautiful passage of surface. Short-telephoto compression, soft background fall-off. No wide shots, no rooms, no establishing views.
- **Extreme minimalism:** at most two simple planes (a backdrop and a ground/ledge), or a single surface. Generous negative space. Nothing else in frame.
- **Premium always.** No product, objects, furniture, people, text, logos, household items or clutter. No staging objects or podiums.
- **Open foreground, never a "spot".** Let the surface continue low in the frame as generous, unbroken negative space — calm, soft-focus, uninterrupted. Compose this emptiness as a deliberate aesthetic quality of the photograph. **Never state a purpose for it**, and never describe it as a cleared, polished, wiped, flattened or "reserved" area, or as space "for" anything. A stated purpose makes the model fabricate an artefact — a slip of paper, a placemat, an unnaturally buffed patch. Open, natural surface only.
- Portrait orientation (~4:5).

### Material aestheticist layer (derive, don't default)

- Choose **1–2 premium materials** truly authentic to the setting, paired with a designer's eye. "Premium" = natural, tactile, characterful, beautifully finished, real texture (stone, timber, plaster, marble, linen, metal, water, leaf). Named examples are sparks, **not a menu**; invent freely; always honor a user-named material.
- Build **palette and light** from those materials. One palette, one light direction per image.

### Method (run silently)

1. Decode the setting into 1–2 premium materials, a palette, and a light.
2. Compose a minimal two-plane (or single-surface) vignette, framed tight.
3. Open the foreground into generous negative space — composed for beauty, with no stated purpose.
4. Write the ~100-word prompt.
5. Append the fixed suppression line on its own line (see Output contract).

### Examples (decode demos, not lookups)

- **"log cabin"** → a tight study of warm oak or cedar planks meeting honed travertine, deep timber palette, low raking sun catching the grain — no room, no furniture.
- **"jungle"** → a single broad waxy green leaf against damp dark stone, deep greens, dappled light — a material study, not a scene.
- **"pool"** → sunlit pale stone meeting still water, soft caustics — clean and close, not a resort.

### Output contract

Output **only**, in this order:

1. The ~100-word natural-language paragraph — one real photograph shot tight on an 85mm lens, minimal and textural. The paragraph never mentions products, placement or purpose.
2. A line break.
3. This exact line, verbatim, on its own (not counted toward the ~100 words):

No products in shot. No logos. No product plinth.

No title, notes or quotes. The suppression line is the only place the word "product" appears.`;

// gemini-3.1-flash-lite-image with delivery:'inline' returns image bytes in the response, but
// fall back to downloading the File API uri if a uri ever comes back instead.
async function fileUriToBase64(uri: string): Promise<{ data: string; mimeType: string }> {
  const fileId = uri.match(/files\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!fileId) throw new Error('Could not parse file id from image uri');
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}:download?alt=media&key=${apiKey}`;
  const upstream = await fetch(url);
  if (!upstream.ok) throw new Error(`Failed to download generated image: ${upstream.statusText}`);
  const buffer = Buffer.from(await upstream.arrayBuffer());
  return { data: buffer.toString('base64'), mimeType: 'image/jpeg' };
}

async function startServer() {
  migrate();
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be an integer between 1 and 65535');

  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use((req, res, next) => {
    const length = Number(req.headers['content-length'] || 0);
    if (length > 12 * 1024 * 1024) return res.status(413).json({ error: 'Solicitud demasiado grande.' });
    next();
  });
  const mediaRoutes = ['/api/generate-prompt','/api/analyze-voice-profile','/api/describe','/api/generate-video','/api/generate-image'];
  app.use(mediaRoutes, express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.path === '/api/billing/bancard/confirm') return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    const allowed = new Set([process.env.APP_URL, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`].filter(Boolean));
    if (!allowed.has(origin)) return res.status(403).json({ error: 'Origen no permitido.' });
    next();
  });
  const generatedDir = path.resolve(process.env.DATA_DIR || 'data', 'artifacts');
  fs.mkdirSync(generatedDir, { recursive: true });
  app.use('/generated', requireAuth, (req: AuthRequest, res, next) => {
    const requestedOrg = req.path.split('/').filter(Boolean)[0];
    if (requestedOrg !== req.auth!.organizationId) return res.status(403).json({ error: 'Acceso denegado.' });
    next();
  }, express.static(generatedDir, { maxAge: '1y', immutable: true }));
  registerAuthRoutes(app);
  registerMeRoute(app);
  registerWorkspaceRoutes(app);
  registerBillingRoutes(app);

  app.get('/api/plans', (_req, res) => {
    res.json({ plans: SUBSCRIPTION_PLANS });
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'reelforge-ai', timestamp: new Date().toISOString() }));

  app.get('/api/agents', (_req, res) => res.json({ agents: REEL_AGENTS }));

  app.post('/api/campaign/prepare', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('analysis'), async (req: AuthRequest, res) => {
    const runId = id();
    try {
      const { brief, brandDna: suppliedBrandDna, platform = 'instagram', durationSeconds = 15 } = req.body;
      if (!brief || String(brief).trim().length < 10) return res.status(400).json({ error: 'A campaign brief of at least 10 characters is required' });
      const requestedDuration = Number(durationSeconds);
      const entitlement = currentEntitlement(req.auth!.organizationId);
      if (!Number.isFinite(requestedDuration) || requestedDuration < 5 || requestedDuration > entitlement.plan.maxVideoSeconds) return res.status(400).json({ error: `El plan ${entitlement.plan.name} permite videos de 5 a ${entitlement.plan.maxVideoSeconds} segundos.` });
      const approvedDna = db.prepare("SELECT version,data_json FROM brand_dna WHERE organization_id=? AND status='approved' ORDER BY version DESC LIMIT 1").get(req.auth!.organizationId) as any;
      const brandDna = suppliedBrandDna && Object.keys(suppliedBrandDna).length ? suppliedBrandDna : approvedDna ? JSON.parse(approvedDna.data_json) : {};
      const products = db.prepare('SELECT name,category,description,benefits_json,price,url FROM products WHERE organization_id=? AND active=1 ORDER BY created_at DESC LIMIT 100').all(req.auth!.organizationId).map((row: any) => ({ ...row, benefits: JSON.parse(row.benefits_json || '[]'), benefits_json: undefined }));
      const ai = process.env.GEMINI_API_KEY ? getAiClient() : null;
      db.prepare('INSERT INTO agent_runs VALUES(?,?,?,?,?,?,?,?,?,?)').run(runId, req.auth!.organizationId, null, 'running', ai ? 'gemini' : 'local-simulation', approvedDna?.version ?? null, 0, now(), null, null);

      const askJson = async (role: string, input: unknown) => {
        if (!process.env.GEMINI_API_KEY) {
          const source: any = input;
          if (role.includes('campaign CEO')) return { title: String(source.brief).slice(0, 60), objective: 'conversion', audience: source.brandDna?.audience?.[0] || 'audiencia de la marca', offer: 'Solo la oferta incluida en el brief', angle: 'beneficio demostrable', kpi: 'clicks y conversiones' };
          if (role.includes('creative director')) return { hook: 'Mirá esto antes de elegir', voiceover: String(source.brief).slice(0, 280), cta: 'Conocé más', scenes: [{ start: 0, end: 3, visual: 'Producto protagonista', copy: 'Una nueva forma de elegir' }, { start: 3, end: Math.max(6, durationSeconds - 3), visual: 'Beneficio en contexto', copy: String(source.strategy?.angle || '') }, { start: Math.max(6, durationSeconds - 3), end: durationSeconds, visual: 'Producto y CTA', copy: 'Conocé más' }] };
          if (role.includes('visual director')) return { continuity: 'Producto fiel, iluminación coherente y formato 9:16', scenes: (source.creative?.scenes || []).map((scene: any) => ({ ...scene, camera: '85mm product commercial', lighting: 'soft directional studio light', prompt: `Vertical premium product commercial, ${scene.visual}, realistic photography, no text` })) };
          if (role.includes('subtitle editor')) return { subtitles: (source.creative?.scenes || []).map((scene: any) => ({ start: scene.start, end: scene.end, text: scene.copy })), onScreenText: source.creative?.hook, caption: `${source.creative?.hook}. ${source.creative?.cta}.`, hashtags: ['#Reels', '#Producto', '#Marca'] };
          return { severity: 'ok', findings: [], requiredChanges: [], publishable: true, mode: 'local-demo-audit' };
        }
        const response = await ai!.models.generateContent({
          model: AI_MODELS.textFast,
          contents: [{ text: JSON.stringify(input) }],
          config: { systemInstruction: role + '\nReturn only valid JSON. Never invent prices, discounts, certifications, availability or product claims.', responseMimeType: 'application/json', temperature: 0.45 }
        });
        return JSON.parse((response.text || '{}').replace(/```(json)?/gi, '').trim());
      };

      const result = await runCampaignAgents({ brief: String(brief), brandDna, products, platform, duration: requestedDuration, maxRevisions: 2,
        ask: (agent: AgentId, instruction, input) => askJson(`You are the ${agent === 'ceo' ? 'campaign CEO' : agent === 'creative' ? 'creative director' : agent === 'visual' ? 'visual director' : agent === 'copy' ? 'social copy and subtitle editor' : 'Meta advertising policy and brand regulator'}. ${instruction}`, input),
        event: event => db.prepare('INSERT INTO agent_run_events VALUES(?,?,?,?,?,?,?,?,?)').run(id(), runId, event.agent, event.phase, event.iteration, event.input ? json(event.input) : null, event.output ? json(event.output) : null, event.error || null, now())
      });
      const { strategy, creative, visual, copy, audit, revisions } = result;

      const status = audit.publishable === true ? 'approved' : 'review_required';
      const campaignId = id();
      const timestamp = now();
      db.prepare('INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        campaignId, req.auth!.organizationId, String(strategy.title || brief).slice(0, 200), brief, platform,
        requestedDuration, status, json(strategy), json(creative),
        json(visual), json(copy), json(audit), req.body.voiceProfileId || null, req.auth!.userId, timestamp, timestamp
      );
      db.prepare("UPDATE agent_runs SET campaign_id=?,status='completed',revision_count=?,completed_at=? WHERE id=?").run(campaignId, revisions, now(), runId);
      res.status(201).json({ id: campaignId, runId, mode: ai ? 'gemini' : 'local-simulation', dnaVersion: approvedDna?.version ?? null, status, agents: REEL_AGENTS, strategy, creative, visual, copy, audit, revisions });
    } catch (error: any) {
      console.error('Error preparing agent campaign:', error);
      db.prepare("UPDATE agent_runs SET status='failed',error=?,completed_at=? WHERE id=?").run(String(error.message || error).slice(0, 2000), now(), runId);
      res.status(500).json({ error: 'No se pudo preparar la campaña.' });
    }
  });

  app.post('/api/cost-estimate', (req, res) => {
    try {
      res.json(estimateReelCost(req.body));
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Invalid cost estimate input' });
    }
  });

  const writeArtifact = (organizationId: string, campaignId: string, renderJobId: string, kind: string, extension: string, mimeType: string, content: string | Buffer, metadata: unknown = {}) => {
    const folder = path.join(generatedDir, organizationId);
    fs.mkdirSync(folder, { recursive: true });
    const filename = `${campaignId}-${kind}-${Date.now()}.${extension}`;
    const target = path.join(folder, filename);
    fs.writeFileSync(target, content);
    const artifactId = id();
    db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?)').run(artifactId, organizationId, campaignId, renderJobId, kind, `/generated/${organizationId}/${filename}`, mimeType, fs.statSync(target).size, json(metadata), now());
    return { id: artifactId, url: `/generated/${organizationId}/${filename}`, kind, mimeType };
  };

  const recordProviderAsset = (organizationId: string, renderJobId: string | null, fileId: string | null, interactionId: string | null, kind: string) => {
    db.prepare('INSERT OR IGNORE INTO provider_assets VALUES(?,?,?,?,?,?,?,?)').run(id(), organizationId, renderJobId, 'gemini', fileId, interactionId, kind, now());
  };

  const toSrt = (copy: any, duration: number) => {
    const cues = Array.isArray(copy?.subtitles) ? copy.subtitles : Array.isArray(copy?.subtitleCues) ? copy.subtitleCues : [];
    const time = (seconds: number) => new Date(Math.max(0, seconds) * 1000).toISOString().slice(11, 23).replace('.', ',');
    if (!cues.length) return `1\n00:00:00,000 --> ${time(duration)}\n${copy?.caption || copy?.onScreenText || ''}\n`;
    return cues.map((cue: any, index: number) => `${index + 1}\n${time(Number(cue.start ?? cue.startSeconds ?? 0))} --> ${time(Number(cue.end ?? cue.endSeconds ?? duration))}\n${cue.text || cue.copy || ''}\n`).join('\n');
  };

  const processRenderJob = async (jobId: string) => {
    const claimed = db.prepare("UPDATE render_jobs SET status='processing',progress=10,started_at=? WHERE id=? AND status='queued'").run(now(), jobId);
    if (Number(claimed.changes) !== 1) return;
    const job = db.prepare('SELECT * FROM render_jobs WHERE id=?').get(jobId) as any;
    if (!job) return;
    try {
      const campaign = db.prepare('SELECT * FROM campaigns WHERE id=? AND organization_id=?').get(job.campaign_id, job.organization_id) as any;
      const creative = JSON.parse(campaign.creative_json || '{}');
      const visual = JSON.parse(campaign.visual_json || '{}');
      const copy = JSON.parse(campaign.copy_json || '{}');
      const manifest = { campaignId: campaign.id, title: campaign.title, platform: campaign.platform, durationSeconds: campaign.duration_seconds, creative, visual, copy, provider: job.provider, model: job.model };
      writeArtifact(job.organization_id, campaign.id, job.id, 'manifest', 'json', 'application/json', JSON.stringify(manifest, null, 2));
      writeArtifact(job.organization_id, campaign.id, job.id, 'subtitles', 'srt', 'application/x-subrip', toSrt(copy, campaign.duration_seconds));
      db.prepare('UPDATE render_jobs SET progress=35 WHERE id=?').run(job.id);

      if (job.provider === 'gemini') {
        const prompt = `Create a vertical 9:16 commercial reel. Duration: ${campaign.duration_seconds}s. Creative: ${campaign.creative_json}. Visual direction: ${campaign.visual_json}. Copy and subtitles: ${campaign.copy_json}. Preserve product and brand fidelity. Do not invent text or claims.`;
        const interaction = await getAiClient().interactions.create({ model: job.model, input: [{ type: 'text', text: prompt }], response_format: { type: 'video', delivery: 'uri' }, store: true, background: false, stream: false });
        if (!interaction.output_video?.uri) throw new Error('El proveedor no devolvió video.');
        const fileId = interaction.output_video.uri.match(/files\/([a-zA-Z0-9_-]+)/)?.[1];
        if (!fileId) throw new Error('URI de video inválida.');
        recordProviderAsset(job.organization_id, job.id, fileId, interaction.id || null, 'video');
        const artifactId = id();
        db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?)').run(artifactId, job.organization_id, campaign.id, job.id, 'video', `/api/video/${fileId}`, 'video/mp4', null, json({ providerUri: interaction.output_video.uri }), now());
        db.prepare('UPDATE render_jobs SET provider_job_id=?,progress=90 WHERE id=?').run(interaction.id, job.id);
      }

      consumeReservation(job.organization_id, job.id);
      db.prepare("UPDATE render_jobs SET status='completed',progress=100,actual_cost_usd=estimated_cost_usd,completed_at=? WHERE id=?").run(now(), job.id);
      db.prepare('INSERT INTO provider_cost_events VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id(), job.organization_id, job.id, job.provider, job.model, 'video_render', campaign.duration_seconds, 'seconds', job.estimated_cost_usd, json({ estimated: true, capturedAt: now() }), now());
    } catch (error: any) {
      releaseReservation(job.organization_id, job.id);
      db.prepare("UPDATE render_jobs SET status='failed',error=?,completed_at=? WHERE id=?").run(String(error.message || error).slice(0, 2000), now(), job.id);
    }
  };

  app.post('/api/workspace/campaigns/:id/render', requireAuth, requireRole('owner','admin','editor'), (req: AuthRequest, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id=? AND organization_id=?').get(req.params.id, req.auth!.organizationId) as any;
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada.' });
    const canOverrideReview = ['owner','admin'].includes(req.auth!.role) && req.body.forceReview === true;
    if (campaign.status !== 'approved' && !canOverrideReview) return res.status(409).json({ error: 'La campaña requiere aprobación del regulador.' });
    const provider = req.body.provider === 'gemini' ? 'gemini' : 'mock';
    const model = provider === 'gemini' ? AI_MODELS.videoConversational : 'local-manifest';
    const estimate = estimateReelCost({ provider: 'gemini', videoSeconds: campaign.duration_seconds, videoTier: req.body.videoTier || 'economy', generatedImages: Number(req.body.generatedImages || 0), voiceSeconds: campaign.duration_seconds });
    const jobId = id();
    try {
      db.prepare('INSERT INTO render_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(jobId, req.auth!.organizationId, campaign.id, String(req.body.idempotencyKey || id()), 'queued', provider, model, 0, null, null, estimate.total, null, now(), null, null);
      reserveVideo(req.auth!.organizationId, jobId);
      const run = db.prepare('SELECT id FROM agent_runs WHERE campaign_id=? AND organization_id=? ORDER BY started_at DESC LIMIT 1').get(campaign.id, req.auth!.organizationId) as any;
      if (run) db.prepare('INSERT INTO agent_run_events VALUES(?,?,?,?,?,?,?,?,?)').run(id(), run.id, 'producer', 'completed', 0, json({ provider, model, durationSeconds:campaign.duration_seconds }), json({ jobId, quotaReserved:true, estimatedCostUsd:estimate.total, format:'9:16' }), null, now());
      setImmediate(() => void processRenderJob(jobId));
      res.status(202).json({ id: jobId, status: 'queued', estimatedCostUsd: estimate.total });
    } catch (error: any) {
      db.prepare('DELETE FROM render_jobs WHERE id=? AND status=?').run(jobId, 'queued');
      if (String(error.message).includes('QUOTA_EXCEEDED')) return res.status(402).json({ error: 'Límite mensual alcanzado.' });
      if (String(error.message).includes('SUBSCRIPTION_INACTIVE')) return res.status(402).json({ error: 'Suscripción inactiva.' });
      if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Esta solicitud ya fue procesada.' });
      res.status(500).json({ error: 'No se pudo reservar el render.' });
    }
  });

  app.get('/api/workspace/renders/:id', requireAuth, (req: AuthRequest, res) => {
    const job = db.prepare('SELECT * FROM render_jobs WHERE id=? AND organization_id=?').get(req.params.id, req.auth!.organizationId);
    if (!job) return res.status(404).json({ error: 'Render no encontrado.' });
    const artifacts = db.prepare('SELECT * FROM artifacts WHERE render_job_id=? AND organization_id=?').all(req.params.id, req.auth!.organizationId);
    res.json({ ...(job as any), artifacts });
  });

  // Converts customer-provided social/profile exports, website copy and product data
  // into reusable brand constraints. Production social imports must use each network's
  // OAuth/API; this endpoint intentionally does not scrape protected pages.
  app.post('/api/brand-dna/extract', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('analysis'), async (req: AuthRequest, res) => {
    try {
      const { companyName, websiteText = '', socialProfiles = [], products = [], locale = 'es-PY' } = req.body;
      if (!companyName || (!websiteText && socialProfiles.length === 0 && products.length === 0)) {
        return res.status(400).json({ error: 'companyName and at least one source are required' });
      }

      if (!process.env.GEMINI_API_KEY) {
        const productSignals = products.map((item: any, index: number) => ({ name: item.name || item.description?.split('|')[0]?.trim() || `Producto ${index + 1}`, category: item.category || '', benefits: item.benefits || [], differentiators: item.differentiators || [], price: item.price, url: item.url }));
        return res.json({ companyName, industry: 'Por confirmar', locale, audience: ['Clientes definidos por la empresa'], valueProposition: String(websiteText).slice(0, 240) || 'Por confirmar con fuentes adicionales', tone: ['cercano', 'comercial', 'claro'], visualStyle: { colors: [], materials: [], lighting: 'comercial natural', cameraLanguage: 'producto protagonista', forbiddenElements: ['claims no verificados'] }, contentPillars: ['producto', 'beneficios verificables', 'confianza'], callsToAction: ['Conocé más'], claimsToAvoid: ['precios, descuentos o resultados no presentes en las fuentes'], productSignals });
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: AI_MODELS.textFast,
        contents: [{ text: JSON.stringify({ companyName, locale, websiteText, socialProfiles, products }) }],
        config: {
          systemInstruction: `You are a brand strategist and evidence-bound catalog analyst. Build a reusable social-media Brand DNA only from the supplied source material. Never invent product claims, prices or URLs. Separate visual observations from marketing claims. Use natural language appropriate for the supplied locale. Return JSON matching the schema.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              companyName: { type: Type.STRING }, industry: { type: Type.STRING }, locale: { type: Type.STRING },
              audience: { type: Type.ARRAY, items: { type: Type.STRING } }, valueProposition: { type: Type.STRING },
              tone: { type: Type.ARRAY, items: { type: Type.STRING } },
              visualStyle: { type: Type.OBJECT, properties: {
                colors: { type: Type.ARRAY, items: { type: Type.STRING } }, materials: { type: Type.ARRAY, items: { type: Type.STRING } },
                lighting: { type: Type.STRING }, cameraLanguage: { type: Type.STRING }, forbiddenElements: { type: Type.ARRAY, items: { type: Type.STRING } }
              }, required: ['colors', 'materials', 'lighting', 'cameraLanguage', 'forbiddenElements'] },
              contentPillars: { type: Type.ARRAY, items: { type: Type.STRING } }, callsToAction: { type: Type.ARRAY, items: { type: Type.STRING } },
              claimsToAvoid: { type: Type.ARRAY, items: { type: Type.STRING } },
              productSignals: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                name: { type: Type.STRING }, category: { type: Type.STRING }, benefits: { type: Type.ARRAY, items: { type: Type.STRING } },
                differentiators: { type: Type.ARRAY, items: { type: Type.STRING } }, price: { type: Type.STRING }, url: { type: Type.STRING }
              }, required: ['name', 'category', 'benefits', 'differentiators'] } }
            },
            required: ['companyName', 'industry', 'locale', 'audience', 'valueProposition', 'tone', 'visualStyle', 'contentPillars', 'callsToAction', 'claimsToAvoid', 'productSignals']
          }
        }
      });
      res.json(JSON.parse((response.text || '{}').replace(/```(json)?/gi, '').trim()));
    } catch (error: any) {
      console.error('Error extracting brand DNA:', error);
      res.status(500).json({ error: 'No se pudo extraer el DNA de marca.' });
    }
  });

  // Endpoint to generate prompt with explicit Latin American Neutral Male voice configuration
  app.post('/api/generate-prompt', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('analysis'), async (req: AuthRequest, res) => {
    try {
      const { productDesc, atmosphereDesc, productImages = [], atmosphereImages = [], voiceConfig }: GenerateBody = req.body;
      validateInlineImages(productImages);
      validateInlineImages(atmosphereImages);
      const ai = getAiClient();

      const isVoiceoverEnabled = voiceConfig?.enabled !== false;
      const voiceAccent = voiceConfig?.accent || 'Latin American Neutral Spanish Male Voice (Locutor Comercial Latino Neutro)';
      const voiceTone = voiceConfig?.toneDescription || 'Charismatic, deep, confident, commercial radio/reel cadence';
      const voiceScript = voiceConfig?.customScript || 'Si te encantan los aromas afrutados pero con un secado ultra elegante y masculino, tenés que probar el nuevo 9PM Rebel de Afnan. Salida adictiva de piña, manzana y mandarina, corazón de vainilla y cedro, y fondo de caramelo y ámbar gris. Comprá original en arfagi.com con envíos a todo Paraguay.';

      const promptWriterSystemInstruction = `## Role
You are an elite product-film director, editor and Gemini Omni prompt engineer in one box. You receive a handful of plain inputs from an everyday seller and return **one flawless, timestamped Omni directive prompt** that yields a premium, short-form product showcase reel built from several shots. You direct like a luxury commercial and cut like a master editor. Your taste *is* the product: restrained, expensive, clarifying. Never slop, never gimmick, never overclaim.

## Inputs you receive
- **1–4 product reference images** — e-commerce style, white background; any mix of front, side, top, detail views.
- **A short product description** — what it is, plus key aesthetic details (plain language).
- **A simple style brief** — often only a few words (e.g. "white studio", "clinical skincare lab"). May include a camera or shot request.
- **Voiceover & Audio Configuration**: ${isVoiceoverEnabled ? `VOICEOVER ACTIVATED. Voice profile: "${voiceAccent}". Tone: "${voiceTone}". Voiceover script: "${voiceScript}". CRITICAL: Must be Latin American neutral Spanish male voice. STRICTLY PROHIBIT any Peninsular Spain / Castilian accent (no 'vosotros', no ceceo/distinción).` : 'No voiceover requested. Near-silent diegetic sound effects only.'}
- **Optional extra notes** — treat any later or added input as an override.

## Non-negotiable taste
- Classy, simple, high-end. A tight, deliberate edit where every cut earns its place.
- Forbidden: vulgar, crass, busy, cheap, "AI-looking", frantic over-cutting.
- Premium = restraint and intent: controlled palette, motivated light, real materials behaving correctly, a confident rhythm.

## Format & length
- **~10 seconds total. 2–7 shots.** *You* decide the count for this product — never pad to seven.
- **Each shot = one timestamp.** Beats typically 1–2s; vary deliberately.
- Cut with an editor's eye: hook on frame one, vary scale and angle every cut, end on a held hero the product reads on.

## Omni craft you apply
Levers per shot: **subject · camera framing + motion · style · lighting · location.** Detail buys control; specify deliberately, never bloat.
- **Reference the images.** Lock identity, geometry, proportions, label and material from *all* views. The product never distorts, rebrands, or sprouts features it doesn't have — identity holds across every cut.
- **Camera repertoire.** Draw across shots: "slow push in", "orbit / arc", "macro detail", "rack focus", "top-down reveal", "gentle levitation", "locked off", "static", "dolly", "natural smartphone zoom".
- **Physics & materials.** Omni reasons about gravity, fluids and light. Make glass refract, metal catch a rim, serum bead, powder settle — accurately.
- **World knowledge.** Don't over-explain. State intent and let Omni reason the rest.

## Audio & Voice Directives
${isVoiceoverEnabled ? `- **Audio:** Professional studio commercial voiceover delivered strictly in a charismatic, deep Latin American neutral Spanish male voice (locutor comercial masculino latinoamericano neutro). Strictly eliminate and prohibit any Peninsular Spain accent (no Castilian ceceo). The narrator delivers the commercial hook and notes with broadcast quality: "${voiceScript}". Paired with subtle realistic diegetic spray mist, luxury bottle clinking, and a subtle luxury sub-bass transition riser.
- **No music clutter.** No distracting cheesy background music or loud musical stings.` : `- **Audio is near-silent:** only very subtle, realistic diegetic sound effects (a faint surface tap, soft glass chime, gentle spray atomization mist).
- **No music of any kind.** No score, soundtrack, background music, beat, or musical sting — ever.
- **No voice.** No voiceover, narration, dialogue or vocals.`}
- **No overlaid graphics.** No on-screen text, titles, captions, subtitles, lower thirds, typography, added logos, badges, watermarks or UI. The only text permitted is what physically exists on the product itself.

## Editing patterns (the repertoire)
- **Sequencing:** open with a hook (hero or striking detail) → vary shot scale and angle so each cut feels intentional → match-cut on motion or shape where possible → accent a beat or two → **land on a clean, held hero frame**.
- **Rhythm:** brisk but never frantic; let the final shot breathe ~0.5s longer.
- **Default arc (adapt, don't obey):** hero wide → macro detail → arc → push-in → held hero.

## Method (run silently, then output)
1. **Read the product** — category, material, finish, features most worth showing.
2. **Translate the brief** into a crafted environment, palette and light. Elevate; never literalise crudely.
   - *"white studio"* → seamless cyclorama, soft key, gentle floor gradient, one clean shadow.
   - *"clinical / skincare lab"* → cool neutral palette, glass and brushed chrome, caustic light, one tasteful water / serum motion.
3. **Design the edit** — choose shot count and order; assign each a move that reveals a *real* feature; vary scale.
4. **Time it** across ~10s with editorial rhythm and a held final beat.
5. **Write the directive prompt** per the contract below.

## Output contract
Output **only** the directive prompt — nothing else. No "shot logic" line, no headings, no fences, no explanation before or after. It must begin with the words **"Create a professional product showcase reel"** and read as one clean, paste-ready directive in this shape:

Create a professional product showcase reel of  <product> locked to the reference images so its identity, proportions, label and material stay accurate in every shot. Hard cuts between shots; the product is the hero throughout. Environment: . Grade and mood: premium, calm, confident, with soft motivated lighting that reveals the material truthfully.

0.0–0.0s — .
0.0–0.0s — .
… (2–7 shots, varied in scale and motion) …
0.0–10.0s — .

Materials and physics: <how light and matter behave securely>. ${isVoiceoverEnabled ? `Audio: High-definition commercial voiceover spoken strictly in an energetic, deep Latin American neutral Spanish male voice (locutor comercial masculino latino neutro - no Peninsular Spain accent) delivering: "${voiceScript}", accompanied by subtle realistic perfume spray atomization and luxury glass clink.` : 'Audio: near-silent, only very subtle realistic diegetic sound effects; no music of any kind, no score, no soundtrack, no musical sting, no voiceover, no vocals.'} No on-screen text, titles, captions, lower thirds, typography, added logos, graphics, watermarks or UI of any kind. Avoid: distorted or rebranded product, invented features, extra props, harsh shadows, over-cutting, frantic pace, cheap gloss.`;
      
      const response = await ai.models.generateContent({
        model: AI_MODELS.textFast,
        contents: [
          { text: `Product: ${productDesc || '(no description provided — infer from the reference images)'}\nAtmosphere: ${atmosphereDesc || '(no description provided — infer from the reference images)'}\nVoiceover Configuration: ${isVoiceoverEnabled ? `Enabled (Male Latin American Neutral, Script: ${voiceScript})` : 'Disabled'}\n\nProduct reference images:` },
          ...productImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
          { text: 'Atmosphere reference images:' },
          ...atmosphereImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        ],
        config: { systemInstruction: promptWriterSystemInstruction },
      });

      res.json({ prompt: response.text });
    } catch (e: any) {
      console.error('Error generating prompt:', e);
      res.status(500).json({ error: 'No se pudo generar el prompt.' });
    }
  });

  // Analiza una referencia y crea directivas para la síntesis de audio de AI Studio.
  app.post('/api/analyze-voice-profile', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('analysis'), async (req: AuthRequest, res) => {
    try {
      const { audioData, audioMimeType = 'audio/mp3', voiceLabel = 'Custom Voice Sample' } = req.body;
      if (!audioData || String(audioData).length > 10 * 1024 * 1024 || !/^audio\/(mpeg|mp3|wav|webm|ogg)$/.test(String(audioMimeType))) return res.status(400).json({ error: 'Referencia de audio inválida o demasiado grande.' });
      const ai = getAiClient();

      let parts: any[] = [];
      if (audioData) {
        // Strip data prefix if present
        const cleanBase64 = audioData.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: audioMimeType,
            data: cleanBase64
          }
        });
      }

      parts.push({
        text: `Analyze this voice audio sample (${voiceLabel}) for professional Latin American commercial reel narration.
Extract vocal acoustics, pitch, pace, timbre, delivery style and accent without changing the speaker's identity or gender. Produce a reusable direction profile for Gemini/AI Studio TTS.

Output JSON with:
- "name": Concise name for this reference voice format
- "tag": Short tag (e.g. "Barítono Comercial", "Spot Dinámico")
- "accent": Detected or adjusted accent description (e.g. "Español Neutro Latinoamericano")
- "description": 2-sentence description of the voice qualities and suggested usage
- "pitch": number (0.75 - 1.25)
- "rate": number (0.85 - 1.25)
- "bassBoost": number (0 - 100)
- "omniAudioDirective": Complete English audio direction string for Gemini/AI Studio.`
      });

      const response = await ai.models.generateContent({
        model: AI_MODELS.textFast,
        contents: parts,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              tag: { type: Type.STRING },
              accent: { type: Type.STRING },
              description: { type: Type.STRING },
              pitch: { type: Type.NUMBER },
              rate: { type: Type.NUMBER },
              bassBoost: { type: Type.NUMBER },
              omniAudioDirective: { type: Type.STRING }
            },
            required: ['name', 'tag', 'accent', 'description', 'pitch', 'rate', 'bassBoost', 'omniAudioDirective']
          },
          temperature: 0.4
        }
      });

      const raw = (response.text || '{}').replace(/```(json)?/gi, '').trim();
      res.json(JSON.parse(raw));
    } catch (e: any) {
      console.error('Error analyzing voice sample:', e);
      // Return a graceful fallback reference profile
      res.json({
        name: 'Voz de Referencia (Latino Neutro)',
        tag: 'Perfil Acústico',
        accent: 'Español Neutro Latinoamericano',
        description: 'Perfil de referencia calibrado con acento latino, timbre natural y claridad comercial.',
        pitch: 0.92,
        rate: 1.04,
        bassBoost: 60,
        omniAudioDirective: 'Audio: Professional Latin American Spanish commercial voiceover with natural timbre, smooth pacing and clear articulation.'
      });
    }
  });

  // Helper to wrap raw PCM audio in a valid WAV header so any browser audio player can play it natively
  function wrapPcmInWav(pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
    if (pcmBuffer.length >= 4 && pcmBuffer.toString('ascii', 0, 4) === 'RIFF') {
      return pcmBuffer;
    }
    const byteRate = (sampleRate * channels * bitDepth) / 8;
    const blockAlign = (channels * bitDepth) / 8;
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  // Neural Gemini Text-to-Speech (TTS) Endpoint
  // Generates studio-quality speech with AI Studio using the selected reference style.
  app.post('/api/generate-tts', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('audio'), async (req: AuthRequest, res) => {
    try {
      const { text, voiceFormatId, voiceName, customDirective } = req.body;
      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Text is required for TTS synthesis' });
        return;
      }
      if (String(text).length > 10_000 || String(customDirective || '').length > 2_000) return res.status(400).json({ error: 'Texto o directiva demasiado largos.' });
      const ai = getAiClient();

      let targetVoice = 'Puck';
      let promptInstruction = '';

      if (voiceFormatId === 'reference-malena-commercial') {
        targetVoice = 'Kore';
        promptInstruction = `Di con una voz comercial latina cálida, luminosa y clara, sonrisa audible, tono optimista y cierre convincente: ${text.trim()}`;
      } else if (voiceFormatId === 'reference-alejo-storyteller') {
        targetVoice = 'Charon';
        promptInstruction = `Di con una voz latina calma, humana y cercana, ritmo pausado, arco emocional sutil y estilo storyteller premium: ${text.trim()}`;
      } else if (voiceFormatId === 'reference-gaby-fun') {
        targetVoice = 'Leda';
        promptInstruction = `Di con una voz latina joven, simpática y cercana, ritmo juguetón, entusiasmo auténtico y claridad comercial para reels: ${text.trim()}`;
      } else if (voiceFormatId === 'reference-horacio-confident') {
        targetVoice = 'Orus';
        promptInstruction = `Di con una voz latina natural, cálida y segura, ritmo estable, tono confiable y cierre persuasivo: ${text.trim()}`;
      } else if (voiceName) {
        targetVoice = voiceName;
        promptInstruction = customDirective ? `${customDirective}: ${text.trim()}` : `Di con voz comercial profesional en español latino: ${text.trim()}`;
      } else {
        targetVoice = 'Puck';
        promptInstruction = customDirective ? `${customDirective}: ${text.trim()}` : `Di con voz comercial profesional en español latino: ${text.trim()}`;
      }

      console.log(`Generating Gemini TTS with voice "${targetVoice}"...`);

      const response = await ai.models.generateContent({
        model: AI_MODELS.tts,
        contents: [{ parts: [{ text: promptInstruction }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: targetVoice },
            },
          },
        },
      });

      const candidate = response.candidates?.[0];
      const audioPart = candidate?.content?.parts?.find((p: any) => p.inlineData && p.inlineData.data);
      const rawBase64 = audioPart?.inlineData?.data;

      if (!rawBase64) {
        throw new Error('Gemini TTS did not return audio data.');
      }

      // Convert to WAV buffer with 44-byte RIFF header so standard HTML5 Audio can play it seamlessly
      const rawBuffer = Buffer.from(rawBase64, 'base64');
      const wavBuffer = wrapPcmInWav(rawBuffer, 24000, 1, 16);
      const wavBase64 = wavBuffer.toString('base64');
      const audioDataUrl = `data:audio/wav;base64,${wavBase64}`;

      res.json({
        audioUrl: audioDataUrl,
        mimeType: 'audio/wav',
        sampleRate: 24000,
        voiceUsed: targetVoice
      });
    } catch (e: any) {
      console.error('Error in /api/generate-tts:', e);
      res.status(500).json({ error: 'No se pudo generar la locución.' });
    }
  });

  // Quickly auto-describe an uploaded product/atmosphere in the same voice as the
  // hard-coded examples, so every selection carries a description / style brief.
  app.post('/api/describe', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('analysis'), async (req: AuthRequest, res) => {
    try {
      const { type, images = [] }: { type?: 'product' | 'atmosphere'; images?: InlineImage[] } = req.body;
      if (images.length === 0) {
        res.status(400).json({ error: 'No images provided' });
        return;
      }
      validateInlineImages(images);
      const ai = getAiClient();

      const productInstruction = `You write ultra-concise product descriptions for a premium product-film tool.
Given product reference image(s), output ONE short description (1–2 sentences, plain language): what the product is, plus its key aesthetic and material details. Match the voice of these examples:
- "An oversized cup holder-friendly mug that comes with the last straw you will ever need."
- "Premium luxury running sneakers. Sculptural modular sole and an upper made out of suede nubuck leather and mesh sculptural panels."
- "A bottle of perfume called 'Nerelle'. The ornate bottle features real stone minerals, sodalite, and malachite."
Output ONLY the description text — no labels, no quotes, no preamble.`;

      const atmosphereInstruction = `You write ultra-concise environment "style briefs" for a premium product-film tool.
Given a reference image of an empty scene or backdrop, output ONE short style brief (1–3 sentences) describing the environment, materials, lighting and mood. Where the product would sit, refer to it as the literal token "the {product_id}" so it can be substituted later. Match the voice of these examples:
- "Minimalist craft luxury. A pristine Carrara marble plinth rests against a soft sage backdrop. Crisp directional sunlight casts soft shadows, creating an earthy yet elevated aesthetic. The {product_id} is seen in perfect detail, conveying texture, calm, and sophisticated gradients."
- "Mediterranean, modern luxury. Warm, porous travertine blocks create a structured geometric podium beneath a brilliant azure sky, presenting the {product_id} perfectly. Soft dappled leaf shadows contrast the sharp architectural lines, evoking a serene, sun-drenched coastal escape."
- "Mediterranean minimalism utilizing a warm sun-drenched, polished plaster corner with a soft rose-tinted floor. Crisp palm frond silhouettes cast dramatic yet serene shadows evoking a premium organic golden-hour mood."
Output ONLY the style brief text — no labels, no quotes, no preamble.`;

      const isAtmosphere = type === 'atmosphere';
      const response = await ai.models.generateContent({
        model: AI_MODELS.textFast,
        contents: [
          { text: isAtmosphere ? 'Describe this scene/backdrop as a style brief:' : 'Describe this product:' },
          ...images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        ],
        config: {
          systemInstruction: isAtmosphere ? atmosphereInstruction : productInstruction,
          maxOutputTokens: 512,
          temperature: 0.7,
        },
      });

      res.json({ description: (response.text || '').trim() });
    } catch (e: any) {
      console.error('Error describing image:', e);
      res.status(500).json({ error: 'No se pudo describir el recurso.' });
    }
  });

  // Generate an atmosphere image from a tiny setting input. Two stages:
  //   1. The configured fast text model expands the input into a ~100-word image prompt.
  //   2. gemini-3.1-flash-lite-image (Nano Banana family) renders the atmosphere from that prompt.
  // Returns the image inline as base64 so it can flow straight into the video
  // pipeline as the atmosphere reference — the user never sees it until it lands
  // in the "sources" strip under the finished video.
  app.post('/api/generate-atmosphere', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('image'), async (req: AuthRequest, res) => {
    try {
      const { input }: { input?: string } = req.body;
      if (!input || !input.trim()) {
        res.status(400).json({ error: 'No atmosphere prompt provided' });
        return;
      }
      const ai = getAiClient();

      // Stage 1 — interpret the user's setting into an on-aesthetic image prompt.
      const promptResponse = await ai.models.generateContent({
        model: AI_MODELS.textFast,
        contents: [{ text: `Setting: ${input.trim()}` }],
        config: {
          systemInstruction: ATMOSPHERE_DIRECTOR_SYSTEM_INSTRUCTION,
          maxOutputTokens: 512,
          temperature: 0.8,
        },
      });
      const imagePrompt = (promptResponse.text || '').trim();
      if (!imagePrompt) throw new Error('Failed to write an atmosphere prompt');

      // Stage 2 — render the atmosphere with gemini-3.1-flash-lite-image (1K is the only
      // supported resolution; portrait 4:5 matches the house aesthetic).
      const interaction = await ai.interactions.create({
        model: AI_MODELS.imageFast,
        input: [{ type: 'text', text: imagePrompt }],
        // gemini-3.1-flash-lite-image rejects a `delivery` field and returns the image inline by
        // default. 1K is the only supported resolution; 4:5 matches the house look.
        response_format: { type: 'image', image_size: '1K', aspect_ratio: '4:5', mime_type: 'image/jpeg' },
        store: false,
        background: false,
        stream: false,
      });

      const image = interaction.output_image;
      let data = image?.data;
      let mimeType: string = image?.mime_type || 'image/jpeg';
      if (!data && image?.uri) ({ data, mimeType } = await fileUriToBase64(image.uri));
      if (!data) throw new Error('gemini-3.1-flash-lite-image returned no image');

      res.json({ image: { data, mimeType }, prompt: imagePrompt });
    } catch (e: any) {
      console.error('Error generating atmosphere:', e);
      res.status(500).json({ error: 'No se pudo generar el ambiente.' });
    }
  });

  // Endpoint to start omni generation
  app.post('/api/generate-video', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('video'), async (req: AuthRequest, res) => {
    try {
      const { prompt, productImages = [], atmosphereImages = [] }: GenerateBody & { prompt?: string } = req.body;
      if (!prompt || String(prompt).length > 20_000) return res.status(400).json({ error: 'Prompt inválido.' });
      validateInlineImages(productImages);
      validateInlineImages(atmosphereImages);
      const ai = getAiClient();

      console.log(`Sending request to Gemini Omni (${productImages.length} product, ${atmosphereImages.length} atmosphere images)...`);

      const interaction = await ai.interactions.create({
        model: AI_MODELS.videoConversational,
        input: [
            ...productImages.map(img => ({ type: 'image' as const, data: img.data, mime_type: img.mimeType })),
            ...atmosphereImages.map(img => ({ type: 'image' as const, data: img.data, mime_type: img.mimeType })),
            { type: 'text', text: prompt }
        ],
        response_format: { type: 'video', delivery: 'uri' },
        store: true,
        background: false,
        stream: false
      });

      console.log(`Interaction created: ${interaction.id}`);
      
      // We will do background polling here so we don't hold the HTTP request open if we can avoid it.
      // Or we can just hold it open since EAP allows background: true/false. Actually, for simplicity on MVP, we can return the interaction ID or file ID and let the client explicitly poll us for status.
      
      if (!interaction.output_video || !interaction.output_video.uri) {
        throw new Error('No video URI returned from interaction.');
      }
      
      const fileIdMatch = interaction.output_video.uri.match(/files\/([a-zA-Z0-9_-]+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : null;
      recordProviderAsset(req.auth!.organizationId, null, fileId, interaction.id || null, 'video');

      res.json({ interactionId: interaction.id, uri: interaction.output_video.uri, fileId });
    } catch (e: any) {
      console.error('Error generating video:', e);
      // Try to dump error details closely
      res.status(500).json({ error: 'No se pudo generar el video.' });
    }
  });

  // Endpoint to edit an existing video via Omni's stateful interaction chaining.
  // No images needed — the model remembers the prior video from previous_interaction_id.
  app.post('/api/edit-video', requireAuth, requireRole('owner','admin','editor'), requireAiQuota('video'), async (req: AuthRequest, res) => {
    try {
      const { previousInteractionId, instructions }: { previousInteractionId?: string; instructions?: string } = req.body;
      if (!previousInteractionId || !instructions) {
        res.status(400).json({ error: 'previousInteractionId and instructions are required' });
        return;
      }
      const ownedInteraction = db.prepare('SELECT id FROM provider_assets WHERE organization_id=? AND provider_interaction_id=?').get(req.auth!.organizationId, previousInteractionId);
      if (!ownedInteraction) return res.status(404).json({ error: 'Interacción no encontrada.' });
      const ai = getAiClient();

      console.log(`Editing interaction ${previousInteractionId}...`);
      const interaction = await ai.interactions.create({
        model: AI_MODELS.videoConversational,
        previous_interaction_id: previousInteractionId,
        input: [{ type: 'text', text: instructions }],
        response_format: { type: 'video', delivery: 'uri' },
        store: true,
        background: false,
        stream: false
      });

      if (!interaction.output_video || !interaction.output_video.uri) {
        throw new Error('No video URI returned from interaction.');
      }

      const fileIdMatch = interaction.output_video.uri.match(/files\/([a-zA-Z0-9_-]+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : null;
      recordProviderAsset(req.auth!.organizationId, null, fileId, interaction.id || null, 'video');

      res.json({ interactionId: interaction.id, uri: interaction.output_video.uri, fileId });
    } catch (e: any) {
      console.error('Error editing video:', e);
      res.status(500).json({ error: 'No se pudo editar el video.' });
    }
  });

  // Endpoint to poll file status
  app.get('/api/file-status/:fileId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fileId } = req.params;
      const owned = db.prepare('SELECT id FROM provider_assets WHERE organization_id=? AND provider_file_id=?').get(req.auth!.organizationId, fileId);
      if (!owned) return res.status(404).json({ error: 'Archivo no encontrado.' });
      const ai = getAiClient();
      
      const fInfo = await ai.files.get({ name: `files/${fileId}` });
      const state = (fInfo.state as any)?.name || fInfo.state;
      res.json({ state });
    } catch (e: any) {
      console.error('Error getting file status:', e);
      res.status(500).json({ error: 'No se pudo consultar el archivo.' });
    }
  });

  // Ownership-checked streaming proxy. Range requests are forwarded upstream,
  // avoiding whole-video buffering in the Node heap.
  app.get('/api/video/:fileId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fileId } = req.params;
      const owned = db.prepare('SELECT id FROM provider_assets WHERE organization_id=? AND provider_file_id=?').get(req.auth!.organizationId, fileId);
      if (!owned) return res.status(404).json({ error: 'Video no encontrado.' });
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'Proveedor de video no configurado.' });
      const url = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}:download?alt=media&key=${apiKey}`;
      const headers: Record<string,string> = {};
      if (req.headers.range) headers.Range = req.headers.range;
      const upstream = await fetch(url, { headers });
      if (!upstream.ok || !upstream.body) return res.status(upstream.status).json({ error: 'No se pudo obtener el video.' });
      const length = Number(upstream.headers.get('content-length') || 0);
      if (length > 100 * 1024 * 1024) return res.status(413).json({ error: 'El video supera el límite permitido.' });
      res.status(upstream.status);
      for (const header of ['content-type','content-length','content-range','accept-ranges']) {
        const value = upstream.headers.get(header); if (value) res.setHeader(header, value);
      }
      res.setHeader('Cache-Control', 'private, max-age=3600');
      Readable.fromWeb(upstream.body as any).on('error', () => res.destroy()).pipe(res);
    } catch (e: any) {
      console.error('Error streaming video:', e);
      if (!res.headersSent) res.status(500).json({ error: 'No se pudo transmitir el video.' });
    }
  });

  // User-facing endpoints backed by the centrally configured image and text models.
  app.post("/api/generate", requireAuth, requireRole('owner','admin','editor'), requireAiQuota('analysis'), async (req: AuthRequest, res) => {
    try {
      const { prompt } = req.body;
      const ai = getAiClient();
      const textResponse = await ai.models.generateContent({
        model: AI_MODELS.textFast,
        contents: prompt,
        config: {
          systemInstruction: "You are an infinite spatial-knowledge-engine generator. Respond to the user's query by generating AI content in a specific JSON format. The format must contain: 'text' (AI-generated explanatory text detailing the topic. Use markdown if necessary, but keep it brief and impactful. CRITICAL: You MUST wrap 2 to 4 key concepts or interesting terms in your text as markdown links using the exact format `[Search Term](Search Term)`, so users can click them to branch off and explore that topic further!), and 'prompts' (an array of exactly 3 string items containing suggested follow-up questions or sub-topics). Keep text concise and informative.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              prompts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["text", "prompts"],
          },
        },
      });

      let rawText = textResponse.text || "{}";
      rawText = rawText.replace(/```(json)?/gi, '').trim();
      const responseData = JSON.parse(rawText);
      res.json(responseData);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate text content." });
    }
  });

  app.post("/api/generate-image", requireAuth, requireRole('owner','admin','editor'), requireAiQuota('image'), async (req: AuthRequest, res) => {
    try {
      const { prompt, imageBase64, type } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      if (String(prompt).length > 20_000) return res.status(400).json({ error: 'Prompt demasiado largo.' });
      const ai = getAiClient();

      let prefix = "Strictly professional, elegant, highly detailed color photography. High-resolution, cinematic lighting, realistic vibrant colors, crisp focus. Single cohesive image, no text inside the image, no grid layout, no multiple panels. ";
      if (type === 'product') {
        prefix += "The focus is strictly and entirely on the product itself, placed against a completely clean, solid, minimalist neutral studio background with absolutely no busy or distracting elements. ";
      } else if (type === 'atmosphere') {
        prefix += "The focus is strictly on the background scene, atmosphere, room, backdrop, or stage itself, showcasing rich textures, materials, and elegant geometric structures. There are no foreground products, no subjects, and no people in the scene. ";
      }

      let parts: any[] = [{ text: prefix + prompt }];
      if (imageBase64) {
        const match = String(imageBase64).match(/^data:(image\/(?:png|jpeg|webp|heic|heif|gif));base64,([A-Za-z0-9+/=]+)$/);
        if (!match || match.length !== 3) return res.status(400).json({ error: 'Imagen inválida.' });
        validateInlineImages([{ mimeType: match[1] as ImageMime, data: match[2] }]);
        parts.unshift({ inlineData: { mimeType: match[1], data: match[2] } });
      }

      const imageResponse = await ai.models.generateContent({
        model: AI_MODELS.imageFast,
        contents: { parts },
        config: {
          imageConfig: { aspectRatio: "4:3" }
        } as any,
      });

      let base64EncodeString = "";
      for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          base64EncodeString = part.inlineData.data;
          break;
        }
      }

      if (base64EncodeString) {
        res.json({ imageUrl: `data:image/jpeg;base64,${base64EncodeString}` });
      } else {
        res.status(500).json({ error: "No image generated" });
      }
    } catch (error: any) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: 'No se pudo generar la imagen.' });
    }
  });

  // Endpoint to generate specialized marketing scripts & reel copy for 9PM Rebel / Perfumes
  app.post("/api/generate-reel-script", requireAuth, requireRole('owner','admin','editor'), requireAiQuota('analysis'), async (req: AuthRequest, res) => {
    try {
      const { style = 'reel', duration = '30s', tone = 'persuasive' } = req.body;
      const ai = getAiClient();
      
      const scriptPrompt = `Act as an elite luxury perfume copywriter and commercial director for the fragrance "9PM Rebel de Afnan".
Create a high-converting Spanish commercial video script for style: ${style}, duration: ${duration}, tone: ${tone}.

Essential perfume DNA that MUST be highlighted:
- Salida (Top Notes): Piña dulce, manzana crujiente y mandarina fresca.
- Corazón (Heart Notes): Vainilla cremosa y madera de cedro elegante.
- Fondo (Base Notes): Caramelo adictivo y ámbar gris seductor y duradero.
- Perfil: Masculino, moderno, ultra elegante, versátil todo el año.
- Call to Action: Comprar el original en la tienda oficial 'arfagi.com' con envíos seguros a todo Paraguay.

Output JSON with:
- "title": Title of this reel variant
- "hook": The opening 3-second attention grabber
- "body": Full voiceover script in natural Spanish (Paraguay / Latin America conversational tone)
- "shotDirections": Array of 3-4 visual shot directions for the video editor/AI reel
- "hashtags": Array of 5-6 top trending perfume hashtags (e.g. #9PMRebel, #Afnan, #PerfumesParaguay, #Arfagi, #FraganciasMasculinas)`;

      const response = await ai.models.generateContent({
        model: AI_MODELS.textFast,
        contents: [{ text: scriptPrompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              hook: { type: Type.STRING },
              body: { type: Type.STRING },
              shotDirections: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["title", "hook", "body", "shotDirections", "hashtags"]
          },
          temperature: 0.75
        }
      });

      const raw = (response.text || '{}').replace(/```(json)?/gi, '').trim();
      res.json(JSON.parse(raw));
    } catch (e: any) {
      console.error('Error generating reel script:', e);
      res.status(500).json({ error: 'No se pudo generar el guion.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR === 'true' ? false : { port: Number(process.env.HMR_PORT || PORT + 10_000) } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  const shutdown = (signal: string) => {
    console.log(`${signal} received; closing server.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

startServer();
