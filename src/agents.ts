export const REEL_AGENTS = [
  { id: 'ceo', name: 'CEO de campaña', purpose: 'Define objetivo, segmento, oferta verificable, ángulo y KPI.' },
  { id: 'creative', name: 'Director creativo', purpose: 'Convierte la estrategia en hook, guion, escenas, CTA y concepto sonoro.' },
  { id: 'visual', name: 'Director visual', purpose: 'Produce prompts de ambiente, producto, cámara, iluminación y continuidad.' },
  { id: 'copy', name: 'Copy & subtítulos', purpose: 'Prepara texto en pantalla, subtítulos, caption y hashtags por plataforma.' },
  { id: 'guard', name: 'Regulador Meta', purpose: 'Bloquea claims inventados, atributos personales, promesas y riesgos de política.' },
  { id: 'producer', name: 'Productor de render', purpose: 'Valida duración, formato, costo, cuota y manifiesto final de generación.' },
] as const;

export function findInventedOffers(source: string, output: string) {
  const sourceDigits = new Set(source.match(/\d+/g) || []);
  const offers = output.match(/(?:₲|Gs\.?|USD|US\$|\$)\s?[\d.,]+|\b\d{1,3}\s?%/gi) || [];
  return [...new Set(offers.filter(offer => (offer.match(/\d+/g) || []).some(digit => !sourceDigits.has(digit))))];
}
