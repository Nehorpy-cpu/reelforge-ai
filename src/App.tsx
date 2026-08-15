import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ArrowRight, ChevronRight, Download, Sparkles, ExternalLink, Flame, Mic, Volume2, Play, Square, Radio, Check, Sliders, Building2 } from 'lucide-react';
import { PRODUCTS, ATMOSPHERES, MediaSelection, FEATURED_REFERENCE_VOICES, MaleVoiceFormat, OFFICIAL_REEL_SCRIPT } from './data.js';
import { ImageUploader } from './components/ImageUploader.js';
import { VideoOutput } from './components/VideoOutput.js';
import { ScrollRow } from './components/ScrollRow.js';
import { RebelCampaignPanel } from './components/RebelCampaignPanel.js';
import { VoiceStudioModal } from './components/VoiceStudioModal.js';
import { toInlineImages, InlineImage } from './images.js';
import { BrandDnaModal } from './components/BrandDnaModal.js';
import { BrandDna, PlanId } from './saas.js';
import { AuthScreen } from './components/AuthScreen.js';
import { WorkspacePanel } from './components/WorkspacePanel.js';

type LogType = 'info' | 'success' | 'warn' | 'error';
type AppState = 'IDLE' | 'GENERATING_ATMOSPHERE' | 'GENERATING_PROMPT' | 'GENERATING_VIDEO' | 'VIDEO_READY';

interface VideoVersion {
  label: string;          // 'V1', 'V2', ...
  interactionId: string;  // Omni interaction id — chained from for edits
  videoUrl: string;
  prompt: string;         // the cinematic directive (V1) or the edit instructions
}

export default function App() {
  const [me, setMe] = useState<any>(undefined);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [product, setProduct] = useState<MediaSelection | null>(null);
  const [atmosphere, setAtmosphere] = useState<MediaSelection | null>(null);
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [submittedImages, setSubmittedImages] = useState<string[]>([]);

  // Voice Engine State
  const [selectedVoice, setSelectedVoice] = useState<MaleVoiceFormat>(FEATURED_REFERENCE_VOICES[0]);
  const [isVoiceoverEnabled, setIsVoiceoverEnabled] = useState<boolean>(true);
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState<boolean>(false);
  const [isPlayingQuickVoice, setIsPlayingQuickVoice] = useState<boolean>(false);

  // "Generate your own atmosphere": a setting the user types instead of picking
  // or uploading an atmosphere image. On submit it's expanded by Flash Lite and
  // rendered by gemini-3.1-flash-lite-image, then fed into the video pipeline as the reference.
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');

  const [versions, setVersions] = useState<VideoVersion[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const versionCount = useRef(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [customPromptOverride, setCustomPromptOverride] = useState<string | null>(null);

  const [logs, setLogs] = useState<{ id: string; timestamp: string; message: string; type: LogType; image?: string }[]>([]);
  const [isBrandDnaOpen, setIsBrandDnaOpen] = useState(false);
  const [brandDna, setBrandDna] = useState<BrandDna | null>(() => {
    try { return JSON.parse(localStorage.getItem('reel-brand-dna') || 'null'); } catch { return null; }
  });
  const [planId, setPlanId] = useState<PlanId>(() => (localStorage.getItem('reel-plan') as PlanId) || 'starter');
  const [usedVideos] = useState(() => Number(localStorage.getItem('reel-used-videos') || 0));

  const loadMe = async () => {
    try { const response = await fetch('/api/me'); setMe(response.ok ? await response.json() : null); }
    catch { setMe(null); }
  };
  useEffect(() => { void loadMe(); }, []);

  const addLog = (message: string, type: LogType = 'info', image?: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString().split('T')[1].substring(0, 12),
      message,
      type,
      image
    }]);
  };

  const describe = (sel: MediaSelection) => sel.description || `${sel.images.length} imagen${sel.images.length > 1 ? 'es' : ''}`;

  // Audio Preview handler for Latin neutral male voice
  const handleQuickPlayVoice = (voice: MaleVoiceFormat) => {
    if (isPlayingQuickVoice) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsPlayingQuickVoice(false);
      return;
    }

    if (!('speechSynthesis' in window)) {
      alert('Síntesis de voz no disponible.');
      return;
    }

    window.speechSynthesis.cancel();
    const phoneticText = OFFICIAL_REEL_SCRIPT.fullText
      .replace(/9PM/g, 'Nain Pi Em')
      .replace(/Afnan/g, 'Afnán')
      .replace(/arfagi\.com/g, 'arfagi punto com');

    const utterance = new SpeechSynthesisUtterance(phoneticText);
    utterance.pitch = voice.pitch;
    utterance.rate = voice.rate;
    utterance.lang = 'es-419';

    const voices = window.speechSynthesis.getVoices();
    const latinMale = voices.find(v => {
      const l = v.lang.toLowerCase();
      const n = v.name.toLowerCase();
      return (l.includes('419') || l.includes('py') || l.includes('ar') || l.includes('mx') || l.includes('us')) && (n.includes('diego') || n.includes('jorge') || n.includes('carlos') || n.includes('male'));
    }) || voices.find(v => !v.lang.toLowerCase().includes('es-es') && v.lang.startsWith('es'));

    if (latinMale) utterance.voice = latinMale;

    utterance.onend = () => setIsPlayingQuickVoice(false);
    utterance.onerror = () => setIsPlayingQuickVoice(false);

    setIsPlayingQuickVoice(true);
    window.speechSynthesis.speak(utterance);
  };

  // Quick preset loader for 9PM Rebel
  const handleQuickLoadRebel = async () => {
    const rebelProduct = PRODUCTS[0];
    const rebelAtmosphere = ATMOSPHERES[0];
    
    addLog('Cargando preset oficial 9PM Rebel de Afnan...', 'warn');
    try {
      // Generate the product image if needed
      const prodRes = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: rebelProduct.prompt, type: 'product' }),
      });
      const prodData = await prodRes.json();
      
      const atmoRes = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: rebelAtmosphere.prompt, type: 'atmosphere' }),
      });
      const atmoData = await atmoRes.json();

      if (prodData.imageUrl) {
        setProduct({
          id: '9pm-rebel-quick',
          source: 'suggestion',
          images: [prodData.imageUrl],
          description: rebelProduct.description
        });
      }

      if (atmoData.imageUrl) {
        setAtmosphere({
          id: 'cedar-amber-quick',
          source: 'suggestion',
          images: [atmoData.imageUrl],
          description: rebelAtmosphere.description
        });
      }
      addLog('Preset 9PM Rebel + Cedro & Ámbar cargado exitosamente.', 'success');
    } catch (e: any) {
      addLog(`Error al cargar preset: ${e.message}`, 'error');
    }
  };

  // Typing a setting is an alternative to picking/uploading an atmosphere image.
  const usingGenerate = !atmosphere && generatePrompt.trim().length > 0;
  const hasAtmosphere = !!atmosphere || usingGenerate;

  const selectAtmosphere: React.Dispatch<React.SetStateAction<MediaSelection | null>> = (value) => {
    setAtmosphere(value);
    if (typeof value !== 'function' && value) {
      setGenerateOpen(false);
      setGeneratePrompt('');
    }
  };

  const isGenerating = appState === 'GENERATING_ATMOSPHERE' || appState === 'GENERATING_PROMPT' || appState === 'GENERATING_VIDEO';
  const canSubmit = !!product && hasAtmosphere && !isGenerating;

  const submitHint = isGenerating
    ? 'Generando video reel — por favor aguarda'
    : !product && !hasAtmosphere
    ? 'Agregá una imagen de producto y una atmósfera para comenzar'
    : !product
    ? 'Agregá una imagen de producto'
    : !hasAtmosphere
    ? 'Agregá una atmósfera de fondo'
    : undefined;

  const selected = versions.find(v => v.label === selectedLabel) ?? null;
  const otherVersions = versions.filter(v => v.label !== selectedLabel);

  const addVersion = (interactionId: string, fileId: string, promptText: string) => {
    const label = `V${++versionCount.current}`;
    setVersions(prev => [...prev, { label, interactionId, videoUrl: `/api/video/${fileId}`, prompt: promptText }]);
    setSelectedLabel(label);
  };

  const pollVideoStatus = (fileId: string, interactionId: string, promptText: string, isInitial: boolean) => {
    addLog('Consultando estado del render en Gemini Omni...', 'warn');
    let lastState = '';

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/file-status/${fileId}`);
        const data = await res.json();

        if (data.state === 'ACTIVE') {
          clearInterval(interval);
          addLog('Render completado. Reel cinematográfico listo.', 'success');
          addVersion(interactionId, fileId, promptText);
          setAppState('VIDEO_READY');
          if (isInitial) {
            setProduct(null);
            setAtmosphere(null);
            setGenerateOpen(false);
            setGeneratePrompt('');
          }
        } else if (data.state === 'FAILED') {
          clearInterval(interval);
          addLog('El backend de Omni reportó estado FAILED.', 'error');
          setAppState(isInitial ? 'IDLE' : 'VIDEO_READY');
        } else if (data.state !== lastState) {
          lastState = data.state;
          addLog(`Estado de render: ${data.state}`);
        }
      } catch (e: any) {
        addLog(`Error de sondeo: ${e.message}`, 'error');
      }
    }, 5000);
  };

  const handleSubmit = async () => {
    if (!product || !hasAtmosphere) {
      addLog('Por favor agregá producto y atmósfera.', 'error');
      return;
    }
    const settingInput = generatePrompt.trim();

    versionCount.current = 0;
    setVersions([]);
    setSelectedLabel(null);
    setEditOpen(false);
    setPromptOpen(false);

    try {
      const productImages = await toInlineImages(product.images);
      const productLabel = product.source === 'suggestion' ? product.id : 'product';

      let atmosphereImages: InlineImage[];
      let atmosphereDesc: string;
      let atmosphereSources: string[];

      if (usingGenerate) {
        setAppState('GENERATING_ATMOSPHERE');
        addLog(`Generando atmósfera con IA para: "${settingInput}"`, 'info');
        addLog('Redactando prompt fotográfico (Gemini Flash Lite)…', 'warn');
        addLog('Renderizando atmósfera con gemini-3.1-flash-lite-image…', 'warn');

        const atmoRes = await fetch('/api/generate-atmosphere', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: settingInput })
        });
        const atmoData = await atmoRes.json();
        if (!atmoRes.ok) throw new Error(atmoData.error || 'Fallo al generar atmósfera');

        const atmoDataUrl = `data:${atmoData.image.mimeType};base64,${atmoData.image.data}`;
        addLog('Atmósfera renderizada exitosamente.', 'success', atmoDataUrl);
        atmosphereImages = [{ data: atmoData.image.data, mimeType: atmoData.image.mimeType }];
        atmosphereDesc = (atmoData.prompt as string) || settingInput;
        atmosphereSources = [atmoDataUrl];
      } else {
        setAppState('GENERATING_PROMPT');
        addLog('Analizando referencias visuales...');
        addLog(`Producto: ${describe(product)}`, 'info');
        addLog(`Atmósfera: ${describe(atmosphere!)}`, 'info');
        addLog('Codificando imágenes...', 'warn');
        atmosphereImages = await toInlineImages(atmosphere!.images);
        atmosphereDesc = atmosphere!.description.replace(/\{product_id\}/g, productLabel);
        atmosphereSources = atmosphere!.images;
      }

      setSubmittedImages([...product.images, ...atmosphereSources]);

      setAppState('GENERATING_PROMPT');
      
      const voiceConfigPayload = isVoiceoverEnabled ? {
        enabled: true,
        voiceId: selectedVoice.id,
        voiceName: selectedVoice.name,
        accent: selectedVoice.accent,
        toneDescription: selectedVoice.description,
        customScript: OFFICIAL_REEL_SCRIPT.fullText
      } : {
        enabled: false
      };

      if (isVoiceoverEnabled) {
        addLog(`Configuración de audio: ${selectedVoice.name} (${selectedVoice.accent})`, 'info');
        addLog('Inyectando directiva acústica: cero acento de España.', 'warn');
      }

      addLog('Generando directiva cinematográfica de Omni...', 'warn');

      let generatedPrompt = customPromptOverride;
      if (!generatedPrompt) {
        const promptRes = await fetch('/api/generate-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            productDesc: `${product.description}${brandDna ? `\n\nAPPROVED BRAND DNA (obey tone, audience, visual rules, CTAs and prohibited claims):\n${JSON.stringify(brandDna)}` : ''}`, 
            atmosphereDesc, 
            productImages, 
            atmosphereImages,
            voiceConfig: voiceConfigPayload
          })
        });
        const promptData = await promptRes.json();
        if (!promptRes.ok) throw new Error(promptData.error || 'Error al generar prompt cinematográfico');
        generatedPrompt = promptData.prompt as string;
      }

      addLog('Directiva cinematográfica lista.', 'success');

      setAppState('GENERATING_VIDEO');
      addLog('Iniciando pipeline de video en Gemini Omni...');
      addLog('Enviando referencias y directivas de audio a Omni...', 'warn');

      const videoRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: generatedPrompt, productImages, atmosphereImages })
      });
      const videoData = await videoRes.json();
      if (!videoRes.ok) throw new Error(videoData.error || 'Error al iniciar generación de video');

      addLog(`Interacción Omni creada. ID: ${videoData.interactionId}`, 'success');
      pollVideoStatus(videoData.fileId, videoData.interactionId, generatedPrompt, true);
    } catch (e: any) {
      setAppState('IDLE');
      addLog(`Error: ${e.message}`, 'error');
    }
  };

  const handleEdit = async () => {
    if (!selected || !editText.trim() || isGenerating) return;
    const instructions = editText.trim();
    const fromLabel = selected.label;
    const fromInteractionId = selected.interactionId;

    setEditOpen(false);
    setEditText('');
    setAppState('GENERATING_VIDEO');
    addLog(`Editando ${fromLabel}: ${instructions}`, 'warn');
    addLog('Enviando edición a Omni...', 'warn');

    try {
      const res = await fetch('/api/edit-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousInteractionId: fromInteractionId, instructions })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo en la edición');

      addLog(`Interacción de edición creada: ${data.interactionId}`, 'success');
      pollVideoStatus(data.fileId, data.interactionId, instructions, false);
    } catch (e: any) {
      setAppState('VIDEO_READY');
      addLog(`Error en edición: ${e.message}`, 'error');
    }
  };

  const selectVersion = (label: string) => {
    setSelectedLabel(label);
    setEditOpen(false);
  };

  const downloadVideo = async (version: VideoVersion) => {
    setDownloading(true);
    try {
      const res = await fetch(version.videoUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `9pm-rebel-reel-${version.label.toLowerCase()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      addLog(`Error en descarga: ${e.message}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (me === undefined) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>;
  if (me === null) return <AuthScreen onAuthenticated={loadMe} />;

  return (
    <div className="min-h-screen w-full flex flex-col bg-zinc-950 font-sans text-zinc-100 selection:bg-amber-400 selection:text-zinc-950">

      {/* TOP BAR */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 px-6 md:px-10 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsBrandDnaOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${brandDna ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-zinc-900 text-amber-300 border-amber-400/30'}`}
          >
            <Building2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{brandDna ? brandDna.companyName : 'Configurar marca'}</span>
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-zinc-950 font-black text-sm shadow-md shadow-amber-500/20">
            9R
          </div>
          <div>
            <h1 className="text-base md:text-lg font-black tracking-tight uppercase flex items-center gap-2">
              ReelForge AI <span className="text-amber-400 text-xs font-mono lowercase font-normal">creative operating system</span>
            </h1>
            <p className="text-[11px] font-mono text-zinc-400 hidden sm:block">
              {me.organizations?.find((org: any) => org.id === me.activeOrganizationId)?.name || 'Estudio creativo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setIsWorkspaceOpen(true)} className="hidden sm:inline-flex px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-900 border border-zinc-700">Workspace</button>
          <button
            onClick={() => setIsVoiceStudioOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-400/30 transition-all shadow-sm"
            title="Abrir estudio de voces latinas de referencia para AI Studio"
          >
            <Mic className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Voces Latinas</span>
            <span className="text-[10px] bg-amber-400/20 px-1.5 py-0.2 rounded font-mono text-amber-200">4 Formatos</span>
          </button>

          <button
            onClick={handleQuickLoadRebel}
            disabled={isGenerating}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-zinc-850 hover:bg-zinc-750 text-amber-300 border border-amber-500/30 transition-all"
            title="Carga automática de 9PM Rebel y atmósfera de Cedro & Ámbar"
          >
            <Sparkles className="w-3.5 h-3.5" /> Preset 9PM Rebel
          </button>
          
          <a
            href="https://arfagi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-xs font-black rounded-lg uppercase tracking-wider transition-all shadow-md shadow-amber-400/20"
          >
            <span>arfagi.com</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 flex flex-col">
        
        {/* REBEL CAMPAIGN & SCRIPT SHOWCASE */}
        <RebelCampaignPanel
          onApplyPrompt={(prompt) => {
            setCustomPromptOverride(prompt);
            addLog(`Directiva de notas aplicada: "${prompt}"`, 'info');
          }}
        />

        {/* WORKSPACE: LEFT BUILDER & RIGHT VIDEO OUTPUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT - BUILDER (5 COLS) */}
          <div className="lg:col-span-5 bg-zinc-900/30 border border-zinc-850 rounded-2xl p-5 md:p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" /> Reel Video Creator
                </h2>
                <p className="text-xs font-mono text-zinc-400 mt-0.5">
                  Generá reels en video con Gemini Omni Flash
                </p>
              </div>
            </div>

            {/* STEP 1: PRODUCT */}
            <ImageUploader
              title="1. Imagen del Perfume / Producto"
              type="product"
              suggestions={PRODUCTS}
              selection={product}
              onSelect={setProduct}
              disabled={isGenerating}
            />

            {/* STEP 2: ATMOSPHERE */}
            <ImageUploader
              title="2. Atmósfera de Fondo / Escenario"
              type="atmosphere"
              suggestions={ATMOSPHERES}
              selection={atmosphere}
              onSelect={selectAtmosphere}
              disabled={isGenerating}
            />

            {/* STEP 3: MALE LATIN AMERICAN VOICE CONFIGURATION */}
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
                    <Mic className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      3. Locución (Voz Masculina Neutra)
                    </h3>
                    <span className="text-[10px] font-mono text-emerald-400">
                      ✓ Cero acento de España · Acento latino
                    </span>
                  </div>
                </div>

                {/* Voice toggle */}
                <button
                  type="button"
                  onClick={() => setIsVoiceoverEnabled(!isVoiceoverEnabled)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border ${
                    isVoiceoverEnabled 
                      ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' 
                      : 'bg-zinc-850 text-zinc-500 border-zinc-700'
                  }`}
                >
                  {isVoiceoverEnabled ? 'Activada' : 'Mute'}
                </button>
              </div>

              {isVoiceoverEnabled && (
                <>
                  {/* 4 Male Formats Quick Selector */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {FEATURED_REFERENCE_VOICES.map((v) => {
                      const isSelected = selectedVoice.id === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => setSelectedVoice(v)}
                          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-400/15 border-amber-400 shadow-sm'
                              : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-white truncate">
                              {v.name.split('(')[0]}
                            </span>
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400 block truncate">
                            {v.tag}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Voice Info & Tools */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-850 text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickPlayVoice(selectedVoice)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all ${
                          isPlayingQuickVoice
                            ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                            : 'bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700'
                        }`}
                      >
                        {isPlayingQuickVoice ? (
                          <>
                            <Square className="w-3 h-3 fill-current text-red-400" /> Detener
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current text-amber-400" /> Probar Muestra
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsVoiceStudioOpen(true)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 underline underline-offset-2"
                    >
                      <Sliders className="w-3 h-3" /> Referencias / Calibrar
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Persistent submit */}
            <div title={submitHint} className={submitHint ? 'cursor-not-allowed' : undefined}>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="group w-full flex items-center justify-center gap-2 py-3.5 px-6 font-mono font-bold text-xs uppercase tracking-widest text-zinc-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-xl transition-all shadow-lg shadow-amber-400/15 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-amber-400 disabled:hover:to-amber-500"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                    Generando Reel Cinematográfico…
                  </>
                ) : (
                  <>
                    Generar Reel 9PM Rebel
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT - OUTPUT (7 COLS) */}
          <div className="lg:col-span-7 bg-zinc-900/30 border border-zinc-850 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-300">
                Vista Previa del Reel (Gemini Omni)
              </span>
              {selected && (
                <span className="font-mono text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30 font-bold">
                  Versión Activa: {selected.label}
                </span>
              )}
            </div>

            {/* PREVIOUS VERSIONS */}
            {otherVersions.length > 0 && (
              <div className="flex gap-3 mb-6">
                <div className="flex-none w-10" />
                <ScrollRow className="flex-1 min-w-0" rowClassName="gap-3" deps={[otherVersions.length]}>
                  {otherVersions.map(v => (
                    <button key={v.label} onClick={() => selectVersion(v.label)} className="group flex-none text-left">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 group-hover:text-amber-400 mb-1 transition-colors">{v.label}</div>
                      <video
                        src={v.videoUrl}
                        playsInline
                        preload="metadata"
                        className="w-32 aspect-video object-cover bg-black rounded-lg border border-zinc-800 opacity-70 group-hover:opacity-100 transition-opacity"
                      />
                    </button>
                  ))}
                </ScrollRow>
              </div>
            )}

            {/* MAIN VIDEO PLAYER */}
            <div className="w-full bg-black/60 rounded-xl overflow-hidden border border-zinc-800 shadow-2xl">
              <VideoOutput
                appState={appState}
                videoUrl={selected?.videoUrl || null}
                logs={logs}
              />
            </div>

            {/* ACTIONS BAR FOR ACTIVE VIDEO */}
            {selected && (
              <div className="mt-4 pt-4 border-t border-zinc-850 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadVideo(selected)}
                    disabled={downloading}
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-amber-400/10"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar Reel MP4
                  </button>

                  <button
                    onClick={() => setEditOpen(!editOpen)}
                    className="px-3.5 py-2 bg-zinc-850 hover:bg-zinc-750 text-white font-mono text-xs rounded-lg transition-all border border-zinc-700 flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Editar con Omni
                  </button>
                </div>

                <button
                  onClick={() => setPromptOpen(!promptOpen)}
                  className="text-xs font-mono text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
                >
                  {promptOpen ? 'Ocultar Prompt de Video' : 'Ver Prompt de Video'}
                </button>
              </div>
            )}

            {/* EDIT DRAWER */}
            {editOpen && selected && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3"
              >
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold block">
                  Editar {selected.label} con Instrucciones de Omni
                </span>
                <input
                  type="text"
                  placeholder="Ej: Agregá más humo y gotas de lluvia sobre la botella de 9PM Rebel..."
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 p-2.5 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditOpen(false)}
                    className="px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleEdit}
                    disabled={!editText.trim() || isGenerating}
                    className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-mono font-bold rounded-lg transition-all"
                  >
                    Aplicar Edición
                  </button>
                </div>
              </motion.div>
            )}

            {/* PROMPT DRAWER */}
            {promptOpen && selected && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs font-mono"
              >
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">
                  Directiva Cinematográfica Utilizada:
                </span>
                <p className="text-zinc-300 leading-relaxed break-words whitespace-pre-wrap">
                  {selected.prompt}
                </p>
              </motion.div>
            )}

          </div>

        </div>

      </div>

      {/* VOICE STUDIO MODAL */}
      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
        selectedVoiceId={selectedVoice.id}
        onSelectVoice={(voice) => {
          setSelectedVoice(voice);
          addLog(`Voz asignada: ${voice.name} (${voice.accent})`, 'success');
        }}
        isVoiceoverEnabled={isVoiceoverEnabled}
        onToggleVoiceover={setIsVoiceoverEnabled}
      />

      <BrandDnaModal
        isOpen={isBrandDnaOpen}
        onClose={() => setIsBrandDnaOpen(false)}
        value={brandDna}
        onSave={(dna) => { setBrandDna(dna); localStorage.setItem('reel-brand-dna', JSON.stringify(dna)); void fetch('/api/workspace/brand-dna', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ data:dna, status:'approved', sources:[] }) }); addLog(`DNA aprobado para ${dna.companyName}.`, 'success'); }}
        planId={planId}
        onPlanChange={(next) => { setPlanId(next); localStorage.setItem('reel-plan', next); }}
        usedVideos={usedVideos}
      />

      <WorkspacePanel isOpen={isWorkspaceOpen} onClose={() => setIsWorkspaceOpen(false)} onOpenStudio={() => setIsWorkspaceOpen(false)} />

      {/* FOOTER */}
      <footer className="border-t border-zinc-850 bg-zinc-950 px-6 md:px-10 py-5 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-mono">
          <div>
            <span className="text-zinc-300 font-bold">Perfume Rebel</span> · 9PM Rebel de Afnan. Asegurá tu botella original en{' '}
            <a href="https://arfagi.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">
              arfagi.com
            </a>{' '}
            con envíos a todo Paraguay.
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Locución Masculina Neutra Latina · Omni Video</span>
            <a
              href="https://policies.google.com/terms/generative-ai/use-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-400"
            >
              Uso Generativo
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
