import React, { useRef, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { SuggestionChip, MediaSelection } from '../data.js';
import { fileToDownscaledDataUrl } from '../images.js';

interface ImageUploaderProps {
  title: string;
  type: 'product' | 'atmosphere';
  suggestions: SuggestionChip[];
  selection: MediaSelection | null;
  onSelect: React.Dispatch<React.SetStateAction<MediaSelection | null>>;
  disabled?: boolean;
}

export function ImageUploader({
  title,
  type,
  suggestions,
  selection,
  onSelect,
  disabled = false,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChipClick = (suggestion: SuggestionChip) => {
    setPromptText(suggestion.prompt);
    setError(null);
  };

  const handleGenerate = async () => {
    const prompt = promptText.trim();
    if (!prompt) {
      setError('Please write or select a prompt first.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate image');
      }

      if (data.imageUrl) {
        onSelect({
          id: `generated-${Date.now()}`,
          source: 'upload',
          images: [data.imageUrl],
          description: prompt,
        });
      } else {
        throw new Error('Image URL not returned from backend');
      }
    } catch (err: any) {
      console.error('Error in image generation:', err);
      setError(err.message || 'Failed to generate image. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    const picked = Array.from(fileList ?? []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (picked.length === 0) return;

    try {
      const dataUrl = await fileToDownscaledDataUrl(picked[0]);
      onSelect({
        id: `upload-${Date.now()}`,
        source: 'upload',
        images: [dataUrl],
        description: `Uploaded reference photo`,
      });
      setError(null);
    } catch (err: any) {
      setError('Failed to process uploaded file.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleClear = () => {
    onSelect(null);
    setError(null);
  };

  const hasSelection = !!selection && selection.images.length > 0;

  return (
    <div className="mb-6 p-5 bg-zinc-900/50 rounded-xl border border-zinc-800/80 shadow-lg shadow-black/20">
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-300 mb-3 flex items-center justify-between">
        <span>{title}</span>
        {generating && (
          <span className="flex items-center gap-1.5 text-[11px] text-amber-400 font-mono normal-case">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            Generando con IA...
          </span>
        )}
      </h2>

      {hasSelection ? (
        <div className="space-y-3">
          <div className="relative group w-full aspect-[4/3] rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800/60 shadow-inner">
            <img
              src={selection.images[0]}
              alt={selection.description}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            {!disabled && (
              <button
                onClick={handleClear}
                className="absolute top-2 right-2 p-1.5 bg-black/80 hover:bg-black text-white rounded-full transition-colors border border-zinc-700 shadow-md"
                aria-label="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 pt-6">
              <p className="text-xs font-mono text-zinc-200 line-clamp-2">
                {selection.description}
              </p>
            </div>
          </div>
          {!disabled && (
            <button
              onClick={handleClear}
              className="w-full py-2 font-mono text-xs uppercase tracking-wider text-zinc-400 hover:text-white transition-colors bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800"
            >
              Cambiar / Generar Nueva Imagen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="space-y-1">
            <textarea
              value={promptText}
              onChange={(e) => {
                setPromptText(e.target.value);
                setError(null);
              }}
              disabled={disabled || generating}
              placeholder={type === 'product' ? 'Ej: Frasco de lujo 9PM Rebel de Afnan con iluminación de estudio...' : 'Ej: Zócalo de cedro con luz ámbar dorada y sombras suaves...'}
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-transparent rounded-lg resize-none placeholder-zinc-600"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">Presets Sugeridos</p>
              <span className="text-[10px] font-mono text-zinc-500">Click para elegir</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleChipClick(item)}
                  disabled={disabled || generating}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition-all ${
                    promptText === item.prompt
                      ? 'bg-amber-400 text-zinc-950 border-amber-400 font-bold shadow-sm'
                      : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={disabled || generating || !promptText.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-mono text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-md hover:shadow-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generando imagen con IA...
              </>
            ) : (
              <>
                Generar imagen de {type === 'product' ? 'Producto' : 'Atmósfera'}
              </>
            )}
          </button>

          <div className="relative flex py-0.5 items-center">
            <div className="flex-grow border-t border-zinc-800"></div>
            <span className="flex-shrink mx-2 text-[10px] font-mono uppercase text-zinc-500">o subí tu propia foto</span>
            <div className="flex-grow border-t border-zinc-800"></div>
          </div>

          <div
            onClick={() => !generating && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!generating) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!generating) handleFiles(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            className={`border border-dashed p-3 text-center rounded-lg transition-colors cursor-pointer ${
              dragging
                ? 'border-amber-400 bg-zinc-900/80'
                : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/30'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Plus className="w-4 h-4 text-zinc-400" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                Arrastrá o haz clic para subir foto
              </span>
            </div>
          </div>

          {error && (
            <p className="text-xs font-mono text-red-400 bg-red-950/40 border border-red-900/60 p-2.5 rounded-lg">
              {error}
            </p>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
