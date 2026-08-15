import { findInventedOffers } from '../agents.js';

export type AgentId = 'ceo' | 'creative' | 'visual' | 'copy' | 'guard';
export type AskAgent = (agent: AgentId, instruction: string, input: unknown) => Promise<any>;
export type AgentEvent = { agent: AgentId; phase: 'started' | 'completed' | 'retry' | 'failed'; iteration: number; input?: unknown; output?: unknown; error?: string };
export const META_POLICY_PACK = { version: 'meta-ads-2026-08-15', source: 'https://www.facebook.com/policies/ads/' } as const;

export function scanDeterministicPolicy(text: string) {
  const rules = [
    { id:'personal-attributes', pattern:/\b(?:tu|tus|usted|vos)\s+(?:diabetes|depresi[oó]n|enfermedad|discapacidad|deuda|obesidad)\b|\b(?:sufres|padeces|ten[eé]s)\s+(?:de\s+)?(?:diabetes|depresi[oó]n|obesidad|deudas)\b/i, message:'Evitar afirmar o insinuar atributos personales sensibles del público.' },
    { id:'guaranteed-outcome', pattern:/\b(?:cura|curar[aá]|garantiza(?:do)?|resultado garantizado|100\s*%\s*(?:seguro|efectivo))\b/i, message:'Eliminar resultados médicos o comerciales garantizados no verificables.' },
    { id:'discriminatory-targeting', pattern:/\b(?:excluir|solo para)\s+(?:personas\s+)?(?:por su raza|por su religi[oó]n|por su discapacidad)\b/i, message:'Eliminar segmentación discriminatoria por características protegidas.' }
  ];
  return rules.filter(rule => rule.pattern.test(text)).map(rule => ({ id:rule.id, message:rule.message, policyVersion:META_POLICY_PACK.version }));
}

const text = (value: unknown, field: string, max = 4000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Campo inválido: ${field}`);
  return value.trim();
};
const list = (value: unknown, field: string, min = 1, max = 8) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`Lista inválida: ${field}`);
  return value;
};

function validate(agent: AgentId, value: any, duration: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La salida debe ser un objeto JSON.');
  if (agent === 'ceo') return {
    title: text(value.title, 'title', 200), objective: text(value.objective, 'objective', 500), audience: text(value.audience, 'audience', 500),
    offer: text(value.offer, 'offer', 500), angle: text(value.angle, 'angle', 500), kpi: text(value.kpi, 'kpi', 300)
  };
  if (agent === 'creative') {
    const scenes = list(value.scenes, 'scenes', 1, 6).map((scene: any, index) => {
      const start = Number(scene?.start), end = Number(scene?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) throw new Error(`Tiempo inválido en escena ${index + 1}`);
      return { start, end, visual: text(scene.visual, `scenes.${index}.visual`, 1000), copy: text(scene.copy, `scenes.${index}.copy`, 300) };
    });
    for (let index = 1; index < scenes.length; index++) if (scenes[index].start < scenes[index - 1].end) throw new Error('Las escenas no pueden superponerse.');
    return { hook: text(value.hook, 'hook', 300), voiceover: text(value.voiceover, 'voiceover', 3000), cta: text(value.cta, 'cta', 300), scenes };
  }
  if (agent === 'visual') return {
    continuity: text(value.continuity, 'continuity', 1000),
    scenes: list(value.scenes, 'scenes', 1, 6).map((scene: any, index) => ({
      start: Number(scene.start), end: Number(scene.end), visual: text(scene.visual, `scenes.${index}.visual`, 1000), copy: text(scene.copy, `scenes.${index}.copy`, 300),
      camera: text(scene.camera, `scenes.${index}.camera`, 500), lighting: text(scene.lighting, `scenes.${index}.lighting`, 500), prompt: text(scene.prompt, `scenes.${index}.prompt`, 3000)
    }))
  };
  if (agent === 'copy') return {
    subtitles: list(value.subtitles, 'subtitles', 1, 12).map((cue: any, index) => {
      const start = Number(cue.start), end = Number(cue.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) throw new Error(`Subtítulo inválido ${index + 1}`);
      return { start, end, text: text(cue.text, `subtitles.${index}.text`, 300) };
    }),
    onScreenText: text(value.onScreenText, 'onScreenText', 300), caption: text(value.caption, 'caption', 2200),
    hashtags: list(value.hashtags, 'hashtags', 1, 30).map((tag, index) => text(tag, `hashtags.${index}`, 100))
  };
  const severity = String(value.severity || 'critical');
  if (!['ok', 'info', 'warning', 'critical'].includes(severity)) throw new Error('Severidad inválida.');
  return { severity, findings: Array.isArray(value.findings) ? value.findings.slice(0, 30) : [], requiredChanges: Array.isArray(value.requiredChanges) ? value.requiredChanges.slice(0, 30) : [], publishable: value.publishable === true };
}

async function step(agent: AgentId, instruction: string, input: unknown, duration: number, iteration: number, ask: AskAgent, event: (event: AgentEvent) => void) {
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    event({ agent, phase: attempt === 1 ? 'started' : 'retry', iteration, input: attempt === 1 ? input : undefined, error: lastError || undefined });
    try {
      const output = validate(agent, await ask(agent, `${instruction}${lastError ? `\nPrevious output failed validation: ${lastError}. Correct it.` : ''}`, input), duration);
      event({ agent, phase: 'completed', iteration, output });
      return output;
    } catch (error: any) { lastError = String(error.message || error); }
  }
  event({ agent, phase: 'failed', iteration, error: lastError });
  throw new Error(`${agent}: ${lastError}`);
}

export async function runCampaignAgents(options: { brief: string; brandDna: any; products: any[]; platform: string; duration: number; ask: AskAgent; event?: (event: AgentEvent) => void; maxRevisions?: number }) {
  const event = options.event || (() => {}); const base = { brief: options.brief, brandDna: options.brandDna, products: options.products, platform: options.platform };
  const strategy = await step('ceo', 'Define title, objective, audience, evidence-based offer, angle and KPI.', base, options.duration, 0, options.ask, event);
  let creative: any = await step('creative', `Create a ${options.duration}-second vertical reel with hook, voiceover, CTA and 3-6 timed scenes.`, { ...base, strategy }, options.duration, 0, options.ask, event);
  let visual: any; let copy: any; let audit: any; let revisions = 0;
  for (let iteration = 0; iteration <= (options.maxRevisions ?? 2); iteration++) {
    visual = await step('visual', 'Specify product fidelity, atmosphere, camera, light, motion and an English prompt for every scene.', { ...base, strategy, creative }, options.duration, iteration, options.ask, event);
    copy = await step('copy', 'Produce readable subtitle cues, on-screen text, caption and hashtags without unsupported claims.', { ...base, strategy, creative }, options.duration, iteration, options.ask, event);
    const inventedOffers = findInventedOffers(`${options.brief}\n${JSON.stringify(options.brandDna)}\n${JSON.stringify(options.products)}`, JSON.stringify({ strategy, creative, visual, copy }));
    const policyRisks = scanDeterministicPolicy(JSON.stringify({ strategy, creative, visual, copy }));
    audit = await step('guard', 'Audit Meta advertising and brand rules. Check misleading claims, personal attributes, discriminatory targeting, prohibited health claims and DNA violations.', { ...base, strategy, creative, visual, copy, policyPack:META_POLICY_PACK, deterministicFlags: { inventedOffers, policyRisks } }, options.duration, iteration, options.ask, event);
    if (inventedOffers.length) {
      audit = { ...audit, severity: audit.severity === 'critical' ? 'critical' : 'warning', publishable: false, requiredChanges: [...audit.requiredChanges, `Remove or verify unsupported offers: ${inventedOffers.join(', ')}`] };
    }
    if (policyRisks.length) audit = { ...audit, policyVersion:META_POLICY_PACK.version, severity:'critical', publishable:false, findings:[...audit.findings, ...policyRisks.map(risk => risk.message)], requiredChanges:[...audit.requiredChanges, ...policyRisks.map(risk => risk.message)] };
    else audit = { ...audit, policyVersion:META_POLICY_PACK.version };
    if (audit.publishable || iteration === (options.maxRevisions ?? 2)) break;
    revisions++;
    creative = await step('creative', 'Revise the creative to satisfy every required change. Preserve only claims supported by the brief, DNA and product catalog.', { ...base, strategy, creative, visual, copy, audit }, options.duration, iteration + 1, options.ask, event);
  }
  return { strategy, creative, visual, copy, audit, revisions };
}
