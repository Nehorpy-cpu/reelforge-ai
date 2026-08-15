import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Copy, Check, Sparkles, ExternalLink, ShieldCheck, Truck, Flame, Award, Sliders, Mic, Play, Square, RefreshCw, Radio, Loader2, Sparkle } from 'lucide-react';
import { FRAGRANCE_NOTES, OFFICIAL_REEL_SCRIPT, MALE_LATIN_VOICE_FORMATS, MaleVoiceFormat } from '../data.js';

interface ScriptVariant {
  title: string;
  hook: string;
  body: string;
  shotDirections: string[];
  hashtags: string[];
}

interface RebelCampaignPanelProps {
  onApplyPrompt?: (prompt: string) => void;
  onOpenVoiceStudio?: () => void;
}

export function RebelCampaignPanel({ onApplyPrompt, onOpenVoiceStudio }: RebelCampaignPanelProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingTts, setIsLoadingTts] = useState(false);
  const [playingFormatId, setPlayingFormatId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'voice-settings' | 'pyramid' | 'variants'>('script');
  const [loadingVariant, setLoadingVariant] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<'reel' | 'story' | 'whatsapp' | 'luxury'>('reel');
  const [currentVariant, setCurrentVariant] = useState<ScriptVariant | null>(null);

  // Audio & Voice Engine States
  const [activePresetId, setActivePresetId] = useState<string>(MALE_LATIN_VOICE_FORMATS[0].id);
  const [pitch, setPitch] = useState<number>(MALE_LATIN_VOICE_FORMATS[0].pitch);
  const [rate, setRate] = useState<number>(MALE_LATIN_VOICE_FORMATS[0].rate);
  const [currentSpokenText, setCurrentSpokenText] = useState<string>('');

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Record<string, string>>({});

  // Active format
  const activeFormat = MALE_LATIN_VOICE_FORMATS.find(v => v.id === activePresetId) || MALE_LATIN_VOICE_FORMATS[0];

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  // Apply voice format
  const handleSelectFormat = (format: MaleVoiceFormat) => {
    setActivePresetId(format.id);
    setPitch(format.pitch);
    setRate(format.rate);
    if (isPlayingAudio) {
      handleStopVoiceover();
    }
  };

  // Convert script to natural phonetic pronunciation for smooth Latin American enunciation
  const formatPhoneticText = (text: string) => {
    return text
      .replace(/9PM/g, '9 PM')
      .replace(/arfagi\.com/g, 'arfagi punto com')
      .trim();
  };

  // Real AI Neural TTS Voiceover Playback
  const handlePlayVoiceover = async (textToSpeak: string, specificFormatId?: string) => {
    const targetFormatId = specificFormatId || activePresetId;
    const cacheKey = `${targetFormatId}_${textToSpeak.trim()}`;

    // If currently playing, stop
    if (isPlayingAudio) {
      handleStopVoiceover();
      if (playingFormatId === targetFormatId) return;
    }

    const textFormatted = formatPhoneticText(textToSpeak);
    setCurrentSpokenText(textFormatted);
    setIsLoadingTts(true);
    setPlayingFormatId(targetFormatId);

    try {
      let audioUrl = ttsCacheRef.current[cacheKey];

      if (!audioUrl) {
        const res = await fetch('/api/generate-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textFormatted,
            voiceFormatId: targetFormatId
          })
        });

        if (!res.ok) {
          throw new Error('Error al sintetizar voz neuronal con Gemini');
        }

        const data = await res.json();
        audioUrl = data.audioUrl;
        ttsCacheRef.current[cacheKey] = audioUrl;
      }

      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audio.playbackRate = rate;
      audioPlayerRef.current = audio;

      audio.onended = () => {
        setIsPlayingAudio(false);
        setPlayingFormatId(null);
      };
      audio.onerror = () => {
        setIsPlayingAudio(false);
        setPlayingFormatId(null);
        setIsLoadingTts(false);
      };

      await audio.play();
      setIsPlayingAudio(true);
    } catch (err) {
      console.error('TTS playback error:', err);
      setIsPlayingAudio(false);
      setPlayingFormatId(null);
    } finally {
      setIsLoadingTts(false);
    }
  };

  const handleStopVoiceover = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setIsPlayingAudio(false);
    setPlayingFormatId(null);
    setIsLoadingTts(false);
  };

  const handleCopyScript = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateVariant = async (style: 'reel' | 'story' | 'whatsapp' | 'luxury') => {
    setSelectedStyle(style);
    setLoadingVariant(true);
    try {
      const res = await fetch('/api/generate-reel-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          style, 
          tone: activePresetId === 'male-luxury-seduction' ? 'luxury seduction' : 'persuasive Latin American commercial'
        })
      });
      if (!res.ok) throw new Error('Error al generar variante');
      const data = await res.json();
      setCurrentVariant(data);
      setActiveTab('variants');
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingVariant(false);
    }
  };

  return (
    <div className="bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-950/90 border border-slate-700/60 rounded-2xl p-5 md:p-6 shadow-2xl backdrop-blur-xl mb-8 relative overflow-hidden">
      {/* Subtle luxury ambient glow */}
      <div className="absolute top-0 right-1/4 w-96 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-80 h-32 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-amber-400 text-slate-950 shadow-sm shadow-amber-400/20">
              <Flame className="w-3 h-3 fill-current" /> Lanzamiento Oficial
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider text-emerald-300 bg-emerald-950/60 border border-emerald-700/40">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> 100% Original
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider text-amber-300 bg-amber-950/50 border border-amber-800/40">
              <Truck className="w-3 h-3 text-amber-400" /> Envíos a todo Paraguay
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider text-sky-300 bg-sky-950/50 border border-sky-800/40">
              <Mic className="w-3 h-3 text-sky-400" /> 4 Voces Latinas de Referencia
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            9PM Rebel <span className="text-amber-400 font-light font-mono text-sm tracking-normal">de Afnan</span>
          </h2>
          <p className="text-xs text-slate-300 mt-0.5 font-sans leading-relaxed">
            Salida afrutada adictiva (Piña & Manzana) · Secado ultra elegante (Cedro & Ámbar Gris) · Masculino & versátil todo el año
          </p>
        </div>

        {/* Action Links */}
        <div className="flex items-center gap-2.5 shrink-0">
          {onOpenVoiceStudio && (
            <button
              onClick={onOpenVoiceStudio}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800/90 hover:bg-slate-750 text-amber-300 border border-amber-400/40 rounded-xl font-mono text-xs font-bold transition-all shadow-md"
            >
              <Mic className="w-3.5 h-3.5 text-amber-400" />
              <span>Estudio de Voces</span>
            </button>
          )}

          <a
            href="https://arfagi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-xl font-mono text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-amber-400/20 group"
          >
            <span>arfagi.com</span>
            <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mt-4 border-b border-slate-800 pb-3 overflow-x-auto hide-scrollbar relative z-10">
        <button
          onClick={() => setActiveTab('script')}
          className={`px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'script'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
              : 'text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50'
          }`}
        >
          🎙️ Guión Oficial del Reel
        </button>
        <button
          onClick={() => setActiveTab('voice-settings')}
          className={`px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'voice-settings'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
              : 'text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" /> 4 Perfiles de Voz ({activeFormat.badge})
        </button>
        <button
          onClick={() => setActiveTab('pyramid')}
          className={`px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'pyramid'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
              : 'text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50'
          }`}
        >
          🧪 Pirámide Olfativa
        </button>
        <button
          onClick={() => setActiveTab('variants')}
          className={`px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'variants'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
              : 'text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50'
          }`}
        >
          ✨ Variaciones IA ({currentVariant ? '1 Generada' : 'Generar'})
        </button>
      </div>

      {/* TAB 1: SCRIPT OFICIAL CON LOCUCIÓN NEURONAL IA */}
      {activeTab === 'script' && (
        <div className="mt-4 space-y-4 relative z-10">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4.5 relative overflow-hidden">
            
            {/* Audio Control Bar with Presets & Waveform */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> {activeFormat.name}
                </span>
                
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40 font-medium">
                  {activeFormat.badge}
                </span>

                {isPlayingAudio && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono text-emerald-300 bg-emerald-950/80 border border-emerald-700/50 animate-pulse">
                    <Volume2 className="w-3 h-3 text-emerald-400" />
                    <span>Reproduciendo Audio Neuronal</span>
                  </span>
                )}

                {isLoadingTts && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono text-amber-300 bg-amber-950/80 border border-amber-700/50">
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                    <span>Sintetizando Voz con IA...</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('voice-settings')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 flex items-center gap-1 transition-all"
                  title="Ver los 4 perfiles de voz"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ver 4 Voces</span>
                </button>

                <button
                  onClick={() => {
                    if (isPlayingAudio) {
                      handleStopVoiceover();
                    } else {
                      handlePlayVoiceover(OFFICIAL_REEL_SCRIPT.fullText);
                    }
                  }}
                  disabled={isLoadingTts}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-md ${
                    isPlayingAudio
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                      : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 hover:shadow-amber-400/20'
                  }`}
                  title={isPlayingAudio ? 'Detener audio' : 'Escuchar locución neuronal'}
                >
                  {isLoadingTts ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" /> Generando...
                    </>
                  ) : isPlayingAudio ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current text-rose-400" /> Detener Voz
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current text-slate-950" /> Escuchar Locución IA
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleCopyScript(OFFICIAL_REEL_SCRIPT.fullText)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1.5 transition-all"
                  title="Copiar guión"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> ¡Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Voice Formats Row */}
            <div className="mb-3.5 flex flex-wrap items-center gap-1.5 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold mr-1">
                Voces Disponibles:
              </span>
              {MALE_LATIN_VOICE_FORMATS.map((format, idx) => (
                <button
                  key={format.id}
                  onClick={() => {
                    handleSelectFormat(format);
                    if (isPlayingAudio) {
                      handleStopVoiceover();
                    }
                  }}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded-lg border transition-all ${
                    activePresetId === format.id
                      ? 'bg-amber-400/20 text-amber-300 border-amber-400/60 font-bold shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  Formato {idx + 1}: {format.badge}
                </button>
              ))}
            </div>

            {/* Script Text with visual breakdowns */}
            <div className="text-slate-200 text-sm leading-relaxed space-y-2.5 font-sans font-normal">
              <p className="bg-slate-900/80 p-3.5 rounded-xl border-l-2 border-amber-400 text-slate-100 shadow-sm">
                <strong className="text-amber-300 font-mono text-xs block mb-1 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Gancho (0-3s) · Impacto Inmediato:
                </strong>
                "{OFFICIAL_REEL_SCRIPT.hook}"
              </p>
              
              <p className="bg-slate-900/60 p-3.5 rounded-xl border-l-2 border-sky-400 text-slate-200 shadow-sm">
                <strong className="text-sky-300 font-mono text-xs block mb-1 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Desarrollo & Notas Olfativas (3-9s) · Explicación de Pirámide:
                </strong>
                "{OFFICIAL_REEL_SCRIPT.body}"
              </p>

              <p className="bg-slate-900/80 p-3.5 rounded-xl border-l-2 border-emerald-400 text-slate-100 font-medium shadow-sm">
                <strong className="text-emerald-300 font-mono text-xs block mb-1 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Cierre & Conversión (9-12s) · arfagi.com (Envíos a todo Paraguay):
                </strong>
                "{OFFICIAL_REEL_SCRIPT.cta}"
              </p>
            </div>

            {/* Quick generator tags */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-slate-400">Generar más variantes para redes:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleGenerateVariant('reel')}
                  disabled={loadingVariant}
                  className="px-2.5 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-300 rounded-md transition-all flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" /> TikTok / Reels
                </button>
                <button
                  onClick={() => handleGenerateVariant('story')}
                  disabled={loadingVariant}
                  className="px-2.5 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-300 rounded-md transition-all flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" /> Story 15s
                </button>
                <button
                  onClick={() => handleGenerateVariant('whatsapp')}
                  disabled={loadingVariant}
                  className="px-2.5 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-300 rounded-md transition-all flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" /> WhatsApp Ventas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATÁLOGO DE 4 VOCES DE REFERENCIA CON SUS PARTICULARIDADES Y AUDIOS */}
      {activeTab === 'voice-settings' && (
        <div className="mt-4 space-y-4 relative z-10">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Mic className="w-4 h-4 text-amber-400" /> Catálogo de 4 Perfiles de Voz para AI Studio
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Cada voz posee su timbre, tono, frecuencia acústica y cadencia de locución personalizada sin acento de España.
                </p>
              </div>
              
              <button
                onClick={() => handlePlayVoiceover(activeFormat.sampleAudioText, activeFormat.id)}
                disabled={isLoadingTts}
                className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-md shrink-0"
              >
                {isLoadingTts && playingFormatId === activeFormat.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sintetizando...
                  </>
                ) : isPlayingAudio && playingFormatId === activeFormat.id ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current text-rose-800" /> Detener
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" /> Probar Formato Activo
                  </>
                )}
              </button>
            </div>

            {/* 4 Voice Format Cards with individual play buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {MALE_LATIN_VOICE_FORMATS.map((format, idx) => {
                const isThisPlaying = isPlayingAudio && playingFormatId === format.id;
                const isThisLoading = isLoadingTts && playingFormatId === format.id;
                const isSelected = activePresetId === format.id;

                return (
                  <div
                    key={format.id}
                    onClick={() => handleSelectFormat(format)}
                    className={`p-4 rounded-xl border transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-400/80 shadow-md ring-1 ring-amber-400/50'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                          Formato {idx + 1}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-amber-300 rounded border border-slate-700 font-medium">
                          {format.badge}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-white mb-1.5">
                        {format.name}
                      </h4>

                      <p className="text-[11px] text-slate-300 font-sans leading-relaxed mb-3">
                        {format.description}
                      </p>

                      <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 space-y-1.5 mb-3 text-[10px] font-mono">
                        <div className="text-slate-300 leading-tight">
                          <span className="text-amber-400 font-bold">Modalidad:</span> {format.modality}
                        </div>
                        <div className="text-slate-300 leading-tight">
                          <span className="text-sky-400 font-bold">Timbre:</span> {format.timbreDescription}
                        </div>
                        <div className="text-slate-400 leading-tight">
                          <span className="text-emerald-400 font-bold">Acento:</span> {format.accent}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                        <span>Pitch: {format.pitch}x</span>
                        <span>·</span>
                        <span>Graves: {format.bassBoost}%</span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFormat(format);
                          if (isThisPlaying) {
                            handleStopVoiceover();
                          } else {
                            handlePlayVoiceover(format.sampleAudioText, format.id);
                          }
                        }}
                        disabled={isThisLoading}
                        className={`px-3 py-1 text-[11px] font-mono rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                          isThisPlaying
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : isSelected
                            ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {isThisLoading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" /> Cargando
                          </>
                        ) : isThisPlaying ? (
                          <>
                            <Square className="w-3 h-3 fill-current text-rose-400" /> Detener
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" /> Escuchar Muestra
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fine Tuning Sliders */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                Calibración de Velocidad y Modulación Acústica:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1.5">
                    <span className="text-slate-300">Tono / Timbre ({activeFormat.badge}):</span>
                    <span className="text-amber-400 font-bold">{pitch.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.3"
                    step="0.02"
                    value={pitch}
                    onChange={(e) => setPitch(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                    <span>Grave barítono</span>
                    <span>Brillante y enérgico</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono mb-1.5">
                    <span className="text-slate-300">Velocidad de Reproducción:</span>
                    <span className="text-amber-400 font-bold">{rate.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.25"
                    step="0.02"
                    value={rate}
                    onChange={(e) => {
                      const newRate = parseFloat(e.target.value);
                      setRate(newRate);
                      if (audioPlayerRef.current) {
                        audioPlayerRef.current.playbackRate = newRate;
                      }
                    }}
                    className="w-full accent-amber-400 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                    <span>Pausado y elegante</span>
                    <span>Ágil comercial</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400">
                Voz seleccionada: <strong className="text-amber-400">{activeFormat.name}</strong>
              </span>
              <button
                onClick={() => setActiveTab('script')}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono text-xs font-bold rounded-lg transition-all shadow-md hover:scale-[1.02]"
              >
                Aplicar Voz y Volver al Guión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PIRÁMIDE OLFATIVA */}
      {activeTab === 'pyramid' && (
        <div className="mt-4 space-y-3 relative z-10">
          <p className="text-xs font-mono text-slate-400">
            Pirámide olfativa detallada de 9PM Rebel de Afnan:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {FRAGRANCE_NOTES.map((layer, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border bg-gradient-to-b ${layer.color} backdrop-blur-sm relative overflow-hidden transition-all hover:scale-[1.01]`}
              >
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold block mb-1">
                  {layer.category}
                </span>
                <h4 className="text-sm font-bold text-white mb-2">{layer.title}</h4>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {layer.notes.map((n, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-black/40 border border-white/10 text-white font-medium"
                    >
                      {n}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {layer.description}
                </p>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-400 flex items-center justify-between flex-wrap gap-2">
            <span>🔥 Perfil general: Moderno, afrutado seductor, masculino, versátil día/noche todo el año.</span>
            {onApplyPrompt && (
              <button
                onClick={() => onApplyPrompt("A luxury product showcase reel of 9PM Rebel by Afnan perfume with cinematic shots of fresh pineapple and apple top notes, elegant cedarwood and vanilla heart, and warm amber-caramel base")}
                className="px-3 py-1 bg-amber-400 text-slate-950 font-bold rounded-lg hover:bg-amber-300 transition-colors shrink-0"
              >
                Crear Reel con estas Notas
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: VARIANTES DE GUION */}
      {activeTab === 'variants' && (
        <div className="mt-4 space-y-4 relative z-10">
          {loadingVariant ? (
            <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 font-mono text-xs text-amber-400 flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
              Generando variante con Gemini para {selectedStyle.toUpperCase()} en tono latinoamericano...
            </div>
          ) : currentVariant ? (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4.5 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                  {currentVariant.title}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePlayVoiceover(`${currentVariant.hook} ${currentVariant.body}`)}
                    className="px-2.5 py-1 text-xs font-mono bg-amber-400 text-slate-950 font-bold rounded-md hover:bg-amber-300 flex items-center gap-1"
                  >
                    <Play className="w-3 h-3 fill-current" /> Escuchar
                  </button>
                  <button
                    onClick={() => handleCopyScript(`${currentVariant.hook}\n\n${currentVariant.body}\n\n${currentVariant.hashtags.join(' ')}`)}
                    className="px-2.5 py-1 text-xs font-mono bg-slate-850 text-white rounded-md hover:bg-slate-800 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copiar
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-200 font-sans leading-relaxed">
                <strong className="text-amber-400 font-mono text-[11px] block">Hook:</strong> {currentVariant.hook}
              </p>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                <strong className="text-sky-400 font-mono text-[11px] block">Cuerpo:</strong> {currentVariant.body}
              </p>

              <div className="pt-2 border-t border-slate-850">
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Dirección de Planos:</span>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1 font-mono">
                  {currentVariant.shotDirections.map((dir, i) => (
                    <li key={i}>{dir}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-1 pt-2">
                {currentVariant.hashtags.map((tag, i) => (
                  <span key={i} className="text-[10px] font-mono text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
