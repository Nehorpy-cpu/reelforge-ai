export interface SuggestionChip {
  id: string;
  label: string;
  prompt: string;
  description: string;
}

export interface MediaSelection {
  id: string;
  source: 'suggestion' | 'upload';
  images: string[];    // asset URLs or data URLs
  description: string;
}

export const MAX_PRODUCT_IMAGES = 1;

export interface FragranceNote {
  category: 'Salida (Top)' | 'Corazón (Heart)' | 'Fondo (Base)';
  title: string;
  notes: string[];
  description: string;
  color: string;
}

export const FRAGRANCE_NOTES: FragranceNote[] = [
  {
    category: 'Salida (Top)',
    title: 'Salida Adictiva y Fresca',
    notes: ['Piña Dulce', 'Manzana Crujiente', 'Mandarina Jugosa'],
    description: 'Apertura vibrante, afrutada y adictiva que impacta desde el primer segundo con frescura chispeante.',
    color: 'from-amber-500/20 to-orange-500/10 text-amber-300 border-amber-500/30'
  },
  {
    category: 'Corazón (Heart)',
    title: 'Corazón Sofisticado',
    notes: ['Vainilla Cremosa', 'Madera de Cedro'],
    description: 'Evoluciona hacia un cuerpo equilibrado, elegante, cálido y profundamente masculino.',
    color: 'from-yellow-600/20 to-amber-700/10 text-yellow-200 border-yellow-600/30'
  },
  {
    category: 'Fondo (Base)',
    title: 'Fondo Seductor & Duradero',
    notes: ['Caramelo Dorado', 'Ámbar Gris Magnético'],
    description: 'Secado ultra elegante y duradero que deja una estela magnética y cautivadora todo el año.',
    color: 'from-orange-700/20 to-amber-900/10 text-orange-200 border-orange-700/30'
  }
];

export const OFFICIAL_REEL_SCRIPT = {
  hook: "Si te encantan los aromas afrutados pero con un secado ultra elegante y masculino, tenés que probar el nuevo 9PM Rebel de Afnan.",
  body: "Su pirámide abre con una salida adictiva de piña dulce, manzana y mandarina, evoluciona con vainilla y cedro, y descansa en un fondo de caramelo y ámbar gris. Un perfil moderno, versátil y llevadero todo el año.",
  cta: "Evitá imitaciones y asegurá tu botella original directo en nuestra web arfagi.com con envíos a todo Paraguay. ¡Hacé clic abajo!",
  fullText: "Si te encantan los aromas afrutados pero con un secado ultra elegante y masculino, tenés que probar el nuevo 9PM Rebel de Afnan. Su pirámide abre con una salida adictiva de piña dulce, manzana y mandarina, evoluciona con vainilla y cedro, y descansa en un fondo de caramelo y ámbar gris. Un perfil moderno, versátil y llevadero todo el año. Evitá imitaciones y asegurá tu botella original directo en nuestra web arfagi.com con envíos a todo Paraguay. ¡Hacé clic abajo!"
};

// Perfiles de voz de referencia para dirigir la síntesis de audio de AI Studio/Gemini.
export interface MaleVoiceFormat {
  id: string;
  name: string;
  tag: string;
  badge: string;
  accent: string;
  category: 'commercial' | 'luxury' | 'creator' | 'paraguay' | 'custom';
  description: string;
  modality: string;
  timbreDescription: string;
  pitch: number;
  rate: number;
  bassBoost: number;
  sampleAudioText: string;
  omniAudioDirective: string;
  isReference?: boolean;
  gender?: 'male' | 'female';
  audioUrl?: string;
}

export const FEATURED_REFERENCE_VOICES: MaleVoiceFormat[] = [
  {
    id: 'reference-malena-commercial', name: 'Malena M · Comercial luminosa', tag: 'Retail / Lifestyle', badge: 'Cálida & Clara',
    accent: 'Español latinoamericano neutro', category: 'commercial', gender: 'female',
    description: 'Voz femenina agradable, clara y optimista para promociones, lanzamientos y anuncios de conversión.',
    modality: 'Comercial ágil con sonrisa audible y cierre convincente.', timbreDescription: 'Medio brillante, amable y definido.',
    pitch: 1.04, rate: 1.03, bassBoost: 35, sampleAudioText: 'Descubrí algo nuevo para disfrutar todos los días.',
    omniAudioDirective: 'Audio: warm, bright and polished Latin American female commercial voice, friendly smile, clear diction, upbeat but credible delivery.',
    audioUrl: '/voices/malena-commercial.mp3', isReference: true
  },
  {
    id: 'reference-alejo-storyteller', name: 'Alejo · Storyteller sereno', tag: 'Historias / Premium', badge: 'Calmo & Cercano',
    accent: 'Español latinoamericano neutro', category: 'luxury', gender: 'male',
    description: 'Narración masculina calma y humana para historias de marca, procesos, origen y productos premium.',
    modality: 'Pausada, íntima y expresiva.', timbreDescription: 'Cálido, redondo y natural.',
    pitch: 0.90, rate: 0.91, bassBoost: 62, sampleAudioText: 'Cada producto tiene una historia. Esta empieza con vos.',
    omniAudioDirective: 'Audio: calm natural Latin American male storyteller, warm intimate tone, relaxed pace, subtle emotional arc, premium documentary delivery.',
    audioUrl: '/voices/alejo-storyteller.mp3', isReference: true
  },
  {
    id: 'reference-gaby-fun', name: 'Gaby · Joven y divertida', tag: 'Reels / Trends', badge: 'Fresh & Friendly',
    accent: 'Español latinoamericano joven', category: 'creator', gender: 'female',
    description: 'Voz femenina joven, simpática y cercana para reels dinámicos, promociones divertidas y contenido social.',
    modality: 'Conversacional, juguetona y espontánea sin perder claridad comercial.', timbreDescription: 'Juvenil, rico y accesible.',
    pitch: 1.06, rate: 1.08, bassBoost: 28, sampleAudioText: 'Esto está demasiado bueno como para no contártelo.',
    omniAudioDirective: 'Audio: young rich and approachable Latin American female creator voice, playful rhythm, authentic excitement, friendly and commercially clear.',
    audioUrl: '/voices/gaby-approachable.mp3', isReference: true
  },
  {
    id: 'reference-horacio-confident', name: 'Horacio · Natural y confiable', tag: 'Institucional / Venta', badge: 'Warm & Confident',
    accent: 'Español latinoamericano neutro', category: 'commercial', gender: 'male',
    description: 'Voz masculina cálida y segura para anuncios institucionales, servicios, productos y llamados a la acción.',
    modality: 'Natural, persuasiva y profesional.', timbreDescription: 'Medio grave, estable y confiable.',
    pitch: 0.91, rate: 0.98, bassBoost: 68, sampleAudioText: 'Elegí calidad, confianza y una experiencia pensada para vos.',
    omniAudioDirective: 'Audio: natural warm and confident Latin American male commercial voice, trustworthy conversational delivery, grounded pace and persuasive close.',
    audioUrl: '/voices/horacio-confident.mp3', isReference: true
  }
];

export const MALE_LATIN_VOICE_FORMATS: MaleVoiceFormat[] = [
  {
    id: 'male-commercial-punch',
    name: 'Formato 1: Locutor Comercial & Hook Viral (Impacto Inmediato)',
    tag: 'Reels / TikTok Ads',
    badge: 'Latino Neutro Enérgico',
    accent: 'Español Neutro Latinoamericano (Cero acento de España)',
    category: 'commercial',
    description: 'Voz masculina de locución publicitaria con gran pegada inicial, articulación brillante y ritmo ágil para retener la atención en los primeros 3 segundos.',
    modality: 'Enérgica, persuasiva y contundente con compresión dinámica alta para formatos publicitarios de alta conversión.',
    timbreDescription: 'Brillante, proyectado hacia adelante, con agudos nítidos y presencia comercial.',
    pitch: 0.94,
    rate: 1.06,
    bassBoost: 65,
    sampleAudioText: 'Si te encantan los aromas afrutados y masculinos, tenés que probar el nuevo 9PM Rebel de Afnan. Salida adictiva de piña y manzana con secado de cedro y caramelo. Conseguilo hoy en arfagi punto com.',
    omniAudioDirective: 'Audio: High-definition commercial broadcast voiceover spoken strictly in an energetic, captivating Latin American neutral Spanish male voice (locutor publicitario masculino latino neutro - strictly no Peninsular Spanish/Castilian accent). Crisp diegetic perfume mist spray and subtle luxury sound design.'
  },
  {
    id: 'male-luxury-seduction',
    name: 'Formato 2: Locución Lujo, Barítono & Seducción (Nocturno Exclusivo)',
    tag: 'Spot Fragancia de Lujo',
    badge: 'Barítono Profundo',
    accent: 'Español Neutro Sofisticado (Grave & Envolvente)',
    category: 'luxury',
    description: 'Tono barítono profundo, pausado, seductor y sofisticado que transmite exclusividad, notas de cedro, ámbar gris y presencia masculina magnética.',
    modality: 'Pausada, íntima, deliberada y misteriosa, con cadencia de spot televisivo de alta perfumería internacional.',
    timbreDescription: 'Terciopelo oscuro, resonancia sub-grave (85Hz-120Hz), cálido y envolvente.',
    pitch: 0.78,
    rate: 0.86,
    bassBoost: 90,
    sampleAudioText: '9PM Rebel. La mezcla perfecta entre piña dulce, cedro noble y ámbar gris magnético. Exclusividad y sofisticación pura en arfagi punto com.',
    omniAudioDirective: 'Audio: Deep, velvety, seductive Latin American Spanish male voiceover with warm baritone resonance, speaking slowly and deliberately with luxury perfume commercial cadence. Strictly zero Spain/Castilian accent. Ambient sub-bass tone and realistic glass bottle resonance.'
  },
  {
    id: 'male-creator-dynamic',
    name: 'Formato 3: Creador Tech & Review Auténtico (Conversacional TikTok)',
    tag: 'Review & Recomendación',
    badge: 'Moderno & Cercano',
    accent: 'Latino Neutro Urbano / Creador Digital',
    category: 'creator',
    description: 'Voz masculina juvenil, fresca y cercana, ideal para reviews orgánicas de TikTok/Reels, recomendaciones sinceras y testimonios de compradores.',
    modality: 'Conversacional, espontánea y entusiasta, con ritmo natural que genera confianza instantánea.',
    timbreDescription: 'Claro, natural, dinámico, sin artificios ni impostación excesiva.',
    pitch: 0.98,
    rate: 1.05,
    bassBoost: 45,
    sampleAudioText: '¡El hype es 100% real! Esta bestia de Afnan dura más de 10 horas en piel y proyecta increíble. Asegurá tu botella original en arfagi punto com antes de que vuele.',
    omniAudioDirective: 'Audio: Crisp, modern, conversational Latin American Spanish male creator voiceover. High energy, authentic, zero Spain/Castilian accent. Light dynamic atmospheric rise effect.'
  },
  {
    id: 'male-rioplatense-paraguay',
    name: 'Formato 4: Spot Comercial Rioplatense / Paraguay (Conversión Directa)',
    tag: 'Mercado Paraguay',
    badge: 'Voseo Comercial PY',
    accent: 'Rioplatense / Comercial Paraguay Profesional',
    category: 'paraguay',
    description: 'Voz profesional con cadencia rioplatense/paraguaya ("tenés que probar", "asegurá tu botella"), calibrada para máxima conversión en arfagi.com.',
    modality: 'Comercial directa, cálida y segura, con voseo comercial paraguayo y énfasis en autenticidad y envíos rápidos.',
    timbreDescription: 'Resonante, maduro, confiable, excelente presencia en medios.',
    pitch: 0.90,
    rate: 0.99,
    bassBoost: 68,
    sampleAudioText: 'Evitá imitaciones y asegurá tu 9PM Rebel 100% original en arfagi punto com con envíos asegurados a todo Paraguay. ¡Hacé tu pedido ahora!',
    omniAudioDirective: 'Audio: Professional persuasive Latin American Spanish male voiceover with natural Rioplatense/Paraguayan commercial inflection emphasizing arfagi.com and fast national shipping. Crystal clear diction with no peninsular European accent.'
  }
];

export const PRODUCTS: SuggestionChip[] = [
  {
    id: '9pm_rebel_hero',
    label: '9PM Rebel (Hero Bottle)',
    prompt: 'A luxury bottle of 9PM Rebel by Afnan perfume, sleek glossy dark flacon with metallic silver cap and bold rebel typography, dramatic cinematic studio rim lighting on polished dark obsidian surface, high-end commercial fragrance photography',
    description: "Botella oficial de 9PM Rebel de Afnan. Frasco oscuro de lujo con detalles metálicos plateados y tipografía moderna, perfil masculino y elegante."
  },
  {
    id: '9pm_rebel_notes',
    label: '9PM Rebel + Frutas & Ámbar',
    prompt: 'A luxury bottle of 9PM Rebel by Afnan perfume displayed alongside artistic slices of sweet pineapple, crisp green apple, cedarwood block and warm golden amber drops, commercial luxury shot, soft depth of field',
    description: "9PM Rebel de Afnan escenificado con sus notas clave: piña dulce, manzana, toques de cedro y ámbar cálido."
  },
  {
    id: '9pm_rebel_midnight',
    label: '9PM Rebel Midnight Vapor',
    prompt: 'Low-key dramatic studio shot of 9PM Rebel by Afnan perfume bottle with golden backlight, subtle fragrance mist spray vapor, luxury masculine aesthetic, crystal clear reflections',
    description: "9PM Rebel de Afnan en una atmósfera nocturna con vaporización fina de fragancia y destellos dorados."
  },
  {
    id: 'perfume_luxury',
    label: 'Frasco Perfume de Nicho',
    prompt: 'A luxury ornate glass perfume bottle with sodalite and malachite minerals, studio product photography with golden reflections',
    description: "Frasco artesanal de alta perfumería con minerales nobles y acabados dorados."
  }
];

export const ATMOSPHERES: SuggestionChip[] = [
  {
    id: 'cedar_amber_glow',
    label: 'Cedro & Ámbar Dorado',
    prompt: 'A warm dark cedarwood plinth with golden amber side lighting, subtle warm reflections, rich luxury fragrance staging with soft shadows, dark minimalist background',
    description: 'Atmósfera de lujo amaderada y cálida. Superficie de madera de cedro iluminada por luz ámbar dorada, resaltando el secado seductor de {product_id}.'
  },
  {
    id: 'caramel_obsidian',
    label: 'Caramelo & Obsidiana',
    prompt: 'A glossy obsidian podium with warm golden caramel tones, glowing amber backdrop, soft volumetric light rays, luxury fragrance studio',
    description: 'Ambiente gourmand seductor. Pedestal de obsidiana pulida bañado en luminiscencia dorada de caramelo y ámbar, ideal para {product_id}.'
  },
  {
    id: 'marble_sage',
    label: 'Mármol & Salvia',
    prompt: 'A pristine Carrara marble plinth resting against a soft sage green backdrop, warm directional sunlight with soft shadows',
    description: 'Minimalismo y elegancia atemporal. Zócalo de mármol Carrara con iluminación suave que resalta la pureza y frescura de {product_id}.'
  },
  {
    id: 'travertine_sun',
    label: 'Travertino & Sol Mediterráneo',
    prompt: 'Warm porous travertine blocks creating a structured geometric podium under a brilliant azure sky, soft dappled leaf shadows',
    description: 'Lujo mediterráneo luminoso. Bloques de travertino con sombras orgánicas y luz solar que proyectan la versatilidad de {product_id}.'
  },
  {
    id: 'midnight_slate',
    label: 'Pizarra Negra & Vapor',
    prompt: 'Minimalist dark slate platform, dramatic golden side lighting, delicate fine vapor mist, sleek black luxury commercial stage',
    description: 'Escenario moderno y audaz. Plataforma de pizarra negra con iluminación rasante dorada y micro-vapor que envuelve a {product_id}.'
  }
];
