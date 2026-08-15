import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Mic, Upload, Play, Square, Sparkles, Check, 
  Volume2, Sliders, Radio, Music, ShieldCheck, AlertCircle, RefreshCw, Loader2, AudioWaveform as WaveformIcon
} from 'lucide-react';
import { FEATURED_REFERENCE_VOICES, MaleVoiceFormat, OFFICIAL_REEL_SCRIPT } from '../data.js';

interface ReferenceVoiceItem extends MaleVoiceFormat {
  isCustom?: boolean;
  audioBlobUrl?: string;
  fileName?: string;
}

interface VoiceStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoiceId: string;
  onSelectVoice: (voice: MaleVoiceFormat) => void;
  isVoiceoverEnabled: boolean;
  onToggleVoiceover: (enabled: boolean) => void;
}

export function VoiceStudioModal({
  isOpen,
  onClose,
  selectedVoiceId,
  onSelectVoice,
  isVoiceoverEnabled,
  onToggleVoiceover,
}: VoiceStudioModalProps) {
  const [voices, setVoices] = useState<ReferenceVoiceItem[]>([...FEATURED_REFERENCE_VOICES]);
  const [activeVoiceId, setActiveVoiceId] = useState<string>(selectedVoiceId || FEATURED_REFERENCE_VOICES[0].id);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isLoadingTts, setIsLoadingTts] = useState<boolean>(false);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);

  // Audio cache for instantaneous playback
  const ttsCacheRef = useRef<{ [key: string]: string }>({});

  // Recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Uploading / acoustic reference states
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Audio elements & Canvas Visualizer
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Active voice object
  const activeVoice = voices.find(v => v.id === activeVoiceId) || voices[0];

  // Fine-tuning values for active voice
  const [customPitch, setCustomPitch] = useState<number>(activeVoice.pitch);
  const [customRate, setCustomRate] = useState<number>(activeVoice.rate);
  const [customBass, setCustomBass] = useState<number>(activeVoice.bassBoost);

  useEffect(() => {
    if (activeVoice) {
      setCustomPitch(activeVoice.pitch);
      setCustomRate(activeVoice.rate);
      setCustomBass(activeVoice.bassBoost);
    }
  }, [activeVoiceId]);

  // Handle Phonetic text transformation for natural Latin American male speech
  const getLatinPhoneticText = (text: string) => {
    return text
      .replace(/9PM/g, 'Nain Pi Em')
      .replace(/9pm/g, 'nain pi em')
      .replace(/Afnan/g, 'Afnán')
      .replace(/arfagi\.com/g, 'arfagi punto com')
      .replace(/arfagi/gi, 'arfagi')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Play preview with Gemini Neural TTS
  const handlePlayVoicePreview = async (voice: ReferenceVoiceItem) => {
    if (isPlaying && playingVoiceId === voice.id) {
      handleStopAudio();
      return;
    }

    handleStopAudio();

    // If it's a custom uploaded/recorded audio file
    const referenceAudio = voice.audioBlobUrl || voice.audioUrl;
    if (referenceAudio) {
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio(referenceAudio);
      } else {
        audioPlayerRef.current.src = referenceAudio;
      }
      audioPlayerRef.current.playbackRate = customRate;
      audioPlayerRef.current.onended = () => {
        setIsPlaying(false);
        setPlayingVoiceId(null);
      };
      audioPlayerRef.current.play();
      setIsPlaying(true);
      setPlayingVoiceId(voice.id);
      startVisualizerAnimation();
      return;
    }

    // Neural TTS Generation
    try {
      setIsLoadingTts(true);
      setLoadingVoiceId(voice.id);

      const cacheKey = `${voice.id}_${voice.sampleAudioText}`;
      let audioUrl = ttsCacheRef.current[cacheKey];

      if (!audioUrl) {
        const response = await fetch('/api/generate-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: voice.sampleAudioText,
            voiceFormatId: voice.id,
            promptTone: voice.omniAudioDirective
          })
        });

        if (!response.ok) {
          throw new Error('Error al sintetizar voz neuronal');
        }

        const data = await response.json();
        if (data.audio) {
          audioUrl = data.audio;
          ttsCacheRef.current[cacheKey] = audioUrl;
        } else {
          throw new Error('No audio in response');
        }
      }

      if (audioUrl) {
        if (!audioPlayerRef.current) {
          audioPlayerRef.current = new Audio(audioUrl);
        } else {
          audioPlayerRef.current.src = audioUrl;
        }

        audioPlayerRef.current.playbackRate = customRate;
        audioPlayerRef.current.onended = () => {
          setIsPlaying(false);
          setPlayingVoiceId(null);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
        };

        audioPlayerRef.current.onerror = (e) => {
          console.error("Audio playback error:", e);
          setIsPlaying(false);
          setPlayingVoiceId(null);
        };

        await audioPlayerRef.current.play();
        setIsPlaying(true);
        setPlayingVoiceId(voice.id);
        startVisualizerAnimation();
      }
    } catch (error) {
      console.warn("Falling back to speech synthesis if server TTS fails:", error);
      // Fallback
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const phoneticText = getLatinPhoneticText(voice.sampleAudioText);
        const utterance = new SpeechSynthesisUtterance(phoneticText);
        utterance.pitch = customPitch;
        utterance.rate = customRate;
        utterance.lang = 'es-419';

        utterance.onend = () => {
          setIsPlaying(false);
          setPlayingVoiceId(null);
        };
        utterance.onerror = () => {
          setIsPlaying(false);
          setPlayingVoiceId(null);
        };

        setIsPlaying(true);
        setPlayingVoiceId(voice.id);
        startVisualizerAnimation();
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setIsLoadingTts(false);
      setLoadingVoiceId(null);
    }
  };

  const handleStopAudio = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setPlayingVoiceId(null);
    setIsLoadingTts(false);
    setLoadingVoiceId(null);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  // Visualizer animation
  const startVisualizerAnimation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let step = 0;
    const render = () => {
      step += 0.15;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bars = 28;
      const barWidth = canvas.width / bars - 2;

      for (let i = 0; i < bars; i++) {
        const height = Math.sin(step + i * 0.4) * 14 + 16 + Math.random() * 8;
        const x = i * (barWidth + 2);
        const y = (canvas.height - height) / 2;

        ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : '#f59e0b';
        ctx.fillRect(x, y, barWidth, height);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };
    render();
  };

  // Handle Audio File Upload (MP3, WAV, M4A, OGG)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setIsAnalyzing(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const blobUrl = URL.createObjectURL(file);

        const res = await fetch('/api/analyze-voice-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioData: base64Data,
            audioMimeType: file.type || 'audio/mp3',
            voiceLabel: file.name
          })
        });

        const profileData = await res.json();
        if (!res.ok) { setIsAnalyzing(false); alert(profileData.error || 'No se pudo procesar la voz.'); return; }
        
        const newReferenceVoice: ReferenceVoiceItem = {
          id: profileData.id || `custom-reference-${Date.now()}`,
          name: profileData.name || `Referencia: ${file.name.replace(/\.[^/.]+$/, "")}`,
          tag: profileData.tag || 'Audio Subido',
          badge: 'Perfil AI Studio',
          accent: profileData.accent || 'Español Neutro Latinoamericano',
          category: 'custom',
          description: profileData.description || 'Perfil acústico extraído del archivo de referencia para orientar el modelo de audio de AI Studio.',
          modality: profileData.modality || 'Locución comercial adaptada, elocuente y con articulación clara latinoamericana.',
          timbreDescription: profileData.timbreDescription || 'Timbre personalizado calibrado a partir del audio de referencia.',
          pitch: profileData.pitch || 0.92,
          rate: profileData.rate || 1.02,
          bassBoost: profileData.bassBoost || 70,
          sampleAudioText: OFFICIAL_REEL_SCRIPT.fullText,
          omniAudioDirective: profileData.omniAudioDirective || 'Audio: Professional Latin American neutral Spanish commercial voiceover, warm delivery, smooth pacing, and clear articulation.',
          isCustom: true,
          audioBlobUrl: blobUrl,
          fileName: file.name
        };

        setVoices(prev => [newReferenceVoice, ...prev]);
        setActiveVoiceId(newReferenceVoice.id);
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Error al subir audio:', err);
      setIsAnalyzing(false);
    }
  };

  // Record Voice via Microphone
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const blobUrl = URL.createObjectURL(audioBlob);
        setRecordedBlob(audioBlob);
        setRecordedAudioUrl(blobUrl);

        // Convert to base64 and analyze
        const reader = new FileReader();
        reader.onloadend = async () => {
          setIsAnalyzing(true);
          const base64Data = reader.result as string;

          const res = await fetch('/api/analyze-voice-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioData: base64Data,
              audioMimeType: 'audio/webm',
              voiceLabel: 'Muestra Grabada de Micrófono'
            })
          });

          const profileData = await res.json();
          const recordedVoice: ReferenceVoiceItem = {
            id: `mic-voice-${Date.now()}`,
            name: 'Voz Grabada de Micrófono',
            tag: 'Grabación en Vivo',
            badge: 'Muestra Propia',
            accent: 'Español Latinoamericano (Muestra Propia)',
            category: 'custom',
            description: 'Voz personalizada grabada desde tu micrófono y calibrada para la locución del reel publicitario.',
            modality: profileData.modality || 'Locución directa y cercana grabada desde micrófono en vivo.',
            timbreDescription: profileData.timbreDescription || 'Timbre natural con presencia acústica personalizada.',
            pitch: profileData.pitch || 0.95,
            rate: profileData.rate || 1.0,
            bassBoost: profileData.bassBoost || 65,
            sampleAudioText: OFFICIAL_REEL_SCRIPT.fullText,
            omniAudioDirective: profileData.omniAudioDirective || 'Audio: Custom recorded male Latin American voice narration with natural cadence and clear acoustic presence.',
            isCustom: true,
            audioBlobUrl: blobUrl
          };

          setVoices(prev => [recordedVoice, ...prev]);
          setActiveVoiceId(recordedVoice.id);
          setIsAnalyzing(false);
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      alert(`No se pudo acceder al micrófono: ${err.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Apply selected voice
  const handleApplyVoice = () => {
    const voiceToApply = {
      ...activeVoice,
      pitch: customPitch,
      rate: customRate,
      bassBoost: customBass
    };
    onSelectVoice(voiceToApply);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Estudio de Locución & Voces Masculinas Latinas
              </h2>
              <p className="text-xs font-mono text-zinc-400">
                Acento neutro latinoamericano · Cero acento de España · Compatible con Gemini Omni
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Toggle Voiceover in Video */}
            <button
              onClick={() => onToggleVoiceover(!isVoiceoverEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                isVoiceoverEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-zinc-850 text-zinc-400 border-zinc-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isVoiceoverEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              {isVoiceoverEnabled ? 'Locución en Video: ACTIVADA' : 'Locución: DESACTIVADA'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* BANNER OFICIAL */}
          <div className="bg-gradient-to-r from-amber-500/10 via-zinc-900/60 to-zinc-900/40 border border-amber-400/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400 text-zinc-950 uppercase">
                  Garantía Acústica
                </span>
                <span className="text-xs font-bold text-amber-300">
                  Cuatro perfiles comerciales para Gemini / AI Studio
                </span>
              </div>
              <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                Malena, Alejo, Gaby y Horacio funcionan como referencias de estilo y dirección. La voz final se sintetiza exclusivamente con el modelo de audio de Gemini/AI Studio.
              </p>
            </div>

            {/* Visualizer Canvas */}
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center min-w-[140px]">
              <span className="text-[10px] font-mono text-zinc-500 mb-1">
                {isPlaying ? 'AUDIO EN VIVO' : 'ESPECTRO VOCAL'}
              </span>
              <canvas ref={canvasRef} width={130} height={28} className="w-[130px] h-[28px]" />
            </div>
          </div>

          {/* SECTION 1: 4 MALE LATIN VOICE FORMATS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-bold flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" /> 1. Formatos de Voces Masculinas Disponibles
              </h3>
              <span className="text-[11px] font-mono text-zinc-400">
                Seleccioná una voz para escucharla y aplicarla
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {voices.map((voice) => {
                const isSelected = activeVoiceId === voice.id;
                const isThisPlaying = isPlaying && playingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    onClick={() => setActiveVoiceId(voice.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all relative overflow-hidden ${
                      isSelected
                        ? 'bg-amber-400/10 border-amber-400/80 shadow-lg shadow-amber-400/5 ring-1 ring-amber-400/50'
                        : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-white">
                            {voice.name}
                          </h4>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-amber-400 font-medium">
                          {voice.accent}
                        </span>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 whitespace-nowrap">
                        {voice.badge}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 font-sans leading-relaxed mb-3">
                      {voice.description}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-850">
                      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                        <span>Pitch: {voice.pitch}x</span>
                        <span>Ritmo: {voice.rate}x</span>
                        <span>Graves: {voice.bassBoost}%</span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayVoicePreview(voice);
                        }}
                        disabled={isLoadingTts && loadingVoiceId === voice.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                          isThisPlaying
                            ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                            : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-sm'
                        }`}
                      >
                        {isLoadingTts && loadingVoiceId === voice.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-zinc-950" /> Generando
                          </>
                        ) : isThisPlaying ? (
                          <>
                            <Square className="w-3 h-3 fill-current text-red-400" /> Detener
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" /> Probar Muestra IA
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: AUDIO REFERENCE STUDIO */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-white font-bold flex items-center gap-2">
                  <Upload className="w-4 h-4 text-amber-400" /> 2. Subir Referencias de Audio
                </h3>
                <p className="text-xs font-mono text-zinc-400 mt-0.5">
                  Subí tus archivos de audio (.mp3, .wav, .m4a, .ogg) o grabá tu voz para extraer su perfil acústico
                </p>
              </div>

              {isAnalyzing && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-400/20 text-amber-300 text-xs font-mono border border-amber-400/30 animate-pulse">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" /> Analizando perfil acústico...
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dropzone Upload */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-800 hover:border-amber-400/60 bg-zinc-950/40 hover:bg-zinc-900/50 rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-full bg-zinc-850 group-hover:bg-amber-400/10 flex items-center justify-center text-zinc-400 group-hover:text-amber-400 mb-2 transition-colors">
                  <Upload className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-zinc-200 group-hover:text-white">
                  Subir Archivo de Audio / Formato de Voz
                </h4>
                <p className="text-[11px] font-mono text-zinc-500 mt-1">
                  MP3, WAV, M4A, OGG o FLAC (Hasta 25MB)
                </p>
                {uploadedFileName && (
                  <span className="mt-2 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    ✓ Cargado: {uploadedFileName}
                  </span>
                )}
              </div>

              {/* Mic Recording */}
              <div className="border border-zinc-850 bg-zinc-950/40 rounded-xl p-5 flex flex-col items-center justify-center text-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all ${
                  isRecording 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse' 
                    : 'bg-zinc-850 text-zinc-400'
                }`}>
                  <Mic className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-zinc-200">
                  Grabar Muestra de Voz en Vivo
                </h4>
                <p className="text-[11px] font-mono text-zinc-500 mt-1 mb-3">
                  Leé 5 segundos del guión para calibrar tu timbre
                </p>

                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-red-500 hover:bg-red-600 text-white flex items-center gap-1.5 shadow-md shadow-red-500/20"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" /> Detener Grabación
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 flex items-center gap-1.5 transition-all"
                  >
                    <Mic className="w-3.5 h-3.5 text-amber-400" /> Iniciar Grabación
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: FINE-TUNING SLIDERS FOR SELECTED VOICE */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-white font-bold flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" /> 3. Calibración Fina de la Voz Activa ({activeVoice.name})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pitch */}
              <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-850">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">Tono / Timbre:</span>
                  <span className="text-amber-400 font-bold">{customPitch.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.70"
                  max="1.20"
                  step="0.02"
                  value={customPitch}
                  onChange={(e) => setCustomPitch(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1">
                  <span>Barítono profundo</span>
                  <span>Agudo</span>
                </div>
              </div>

              {/* Rate */}
              <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-850">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">Ritmo / Velocidad:</span>
                  <span className="text-amber-400 font-bold">{customRate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.80"
                  max="1.25"
                  step="0.02"
                  value={customRate}
                  onChange={(e) => setCustomRate(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1">
                  <span>Pausado de lujo</span>
                  <span>Dinámico TikTok</span>
                </div>
              </div>

              {/* Bass Boost */}
              <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-850">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">Presencia de Graves:</span>
                  <span className="text-amber-400 font-bold">{customBass}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={customBass}
                  onChange={(e) => setCustomBass(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-400 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1">
                  <span>Natural</span>
                  <span>Punch Comercial</span>
                </div>
              </div>
            </div>

            {/* Directiva de Audio Generada para Gemini Omni */}
            <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-850 text-xs font-mono">
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold block mb-1">
                Directiva Acústica que se inyecta en el Video (Omni):
              </span>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                "{activeVoice.omniAudioDirective}"
              </p>
            </div>
          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handlePlayVoicePreview(activeVoice)}
              className="px-4 py-2 text-xs font-mono font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-all flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 text-amber-400" /> Probar Voz Seleccionada
            </button>

            <button
              onClick={handleApplyVoice}
              className="px-5 py-2 text-xs font-mono font-bold uppercase tracking-wider bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 rounded-lg transition-all shadow-md shadow-amber-400/20 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Asignar como Voz Oficial de Video
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
