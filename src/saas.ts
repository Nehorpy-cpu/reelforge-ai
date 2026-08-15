export type PlanId = 'starter' | 'growth' | 'agency';

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  monthlyVideos: number;
  maxVideoSeconds: number;
  brands: number;
  pricePyg: number;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'starter', name: 'Starter', monthlyVideos: 8, maxVideoSeconds: 15, brands: 1, pricePyg: 299000 },
  { id: 'growth', name: 'Growth', monthlyVideos: 20, maxVideoSeconds: 30, brands: 2, pricePyg: 749000 },
  { id: 'agency', name: 'Agency', monthlyVideos: 60, maxVideoSeconds: 30, brands: 10, pricePyg: 1890000 },
];

export interface BrandDna {
  companyName: string;
  industry: string;
  locale: string;
  audience: string[];
  valueProposition: string;
  tone: string[];
  visualStyle: {
    colors: string[];
    materials: string[];
    lighting: string;
    cameraLanguage: string;
    forbiddenElements: string[];
  };
  contentPillars: string[];
  callsToAction: string[];
  claimsToAvoid: string[];
  productSignals: Array<{
    name: string;
    category: string;
    benefits: string[];
    differentiators: string[];
    price?: string;
    url?: string;
  }>;
}

export interface ReelCostInput {
  provider: 'gemini' | 'openai';
  videoSeconds: number;
  videoTier?: 'economy' | 'standard' | 'premium';
  generatedImages?: number;
  scriptInputTokens?: number;
  scriptOutputTokens?: number;
  voiceSeconds?: number;
}

export function estimateReelCost(input: ReelCostInput) {
  const seconds = Math.max(1, Math.min(60, Number(input.videoSeconds) || 8));
  const images = Math.max(0, Number(input.generatedImages) || 0);
  const inputTokens = Math.max(0, Number(input.scriptInputTokens) || 0);
  const outputTokens = Math.max(0, Number(input.scriptOutputTokens) || 0);
  const voiceSeconds = Math.max(0, Number(input.voiceSeconds) || 0);

  if (input.provider === 'gemini') {
    const videoRate = input.videoTier === 'premium' ? 0.40 : input.videoTier === 'standard' ? 0.10 : 0.05;
    const video = seconds * videoRate;
    const image = images * 0.0336;
    const text = inputTokens / 1_000_000 * 0.25 + outputTokens / 1_000_000 * 1.50;
    const voice = voiceSeconds * 25 / 1_000_000 * 20;
    return { currency: 'USD', provider: input.provider, video, image, text, voice, total: video + image + text + voice };
  }

  const videoRate = input.videoTier === 'premium' ? 0.30 : 0.10;
  const video = seconds * videoRate;
  // Medium portrait estimate for GPT Image 1.5. Kept explicit until the GPT Image 2
  // calculator exposes a stable per-image table in the model documentation.
  const image = images * 0.05;
  const text = inputTokens / 1_000_000 * 0.20 + outputTokens / 1_000_000 * 1.20;
  const voice = 0; // Selectable TTS provider/rate belongs in the production billing adapter.
  return { currency: 'USD', provider: input.provider, video, image, text, voice, total: video + image + text + voice };
}
