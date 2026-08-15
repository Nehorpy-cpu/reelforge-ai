export interface InlineImage {
  data: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | 'image/heif' | 'image/gif' | 'image/bmp' | 'image/tiff';
}

export interface VoiceProfile {
  id: string;
  name: string;
  tag: string;
  category: 'commercial' | 'luxury' | 'creator' | 'paraguay' | 'custom';
  description: string;
  accent: 'Latin American Neutral Male' | 'Latin American Deep Luxury' | 'Latin American Creator' | 'Rioplatense / PY Commercial';
  gender: 'male';
  pitch: number;      // e.g. 0.75 - 1.25
  rate: number;       // e.g. 0.85 - 1.25
  bassBoost: number;  // 0 - 100
  previewSample: string;
  omniAudioDirective: string;
  audioUrl?: string;  // If user uploaded an audio file or custom sample
  isReference?: boolean;
}

export interface VideoVoiceConfig {
  enabled: boolean;
  profileId: string;
  customScript?: string;
  pitch: number;
  rate: number;
  accent: string;
}

export interface VideoVersion {
  label: string;          // 'V1', 'V2', ...
  interactionId: string;  // Omni interaction id — chained from for edits
  videoUrl: string;
  prompt: string;         // the cinematic directive (V1) or the edit instructions
  voiceConfig?: VideoVoiceConfig;
}
