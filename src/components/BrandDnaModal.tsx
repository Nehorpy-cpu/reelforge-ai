import React, { useEffect, useState } from 'react';
import { Building2, Check, CreditCard, Loader2, Sparkles, X } from 'lucide-react';
import { BrandDna, PlanId, SUBSCRIPTION_PLANS } from '../saas.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  value: BrandDna | null;
  onSave: (dna: BrandDna) => void;
  planId: PlanId;
  onPlanChange: (planId: PlanId) => void;
  usedVideos: number;
}

export function BrandDnaModal({ isOpen, onClose, value, onSave, planId, onPlanChange, usedVideos }: Props) {
  const [companyName, setCompanyName] = useState('');
  const [websiteText, setWebsiteText] = useState('');
  const [socialText, setSocialText] = useState('');
  const [productsText, setProductsText] = useState('');
  const [locale, setLocale] = useState('es-PY');
  const [result, setResult] = useState<BrandDna | null>(value);
  const [loading, setLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingMessage, setBillingMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setResult(value);
      if (value) {
        setCompanyName(value.companyName);
        setLocale(value.locale);
      }
    }
  }, [isOpen, value]);

  if (!isOpen) return null;
  const plan = SUBSCRIPTION_PLANS.find(item => item.id === planId)!;
  const usagePercent = Math.min(100, usedVideos / plan.monthlyVideos * 100);

  const extract = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/brand-dna/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          locale,
          websiteText,
          socialProfiles: socialText ? [{ network: 'customer_export', content: socialText }] : [],
          products: productsText ? productsText.split('\n').filter(Boolean).map(line => ({ description: line })) : []
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo extraer el DNA');
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startBancardCheckout = async () => {
    setBillingLoading(true);
    setBillingMessage('');
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo iniciar Bancard.');
      const mountCheckout = () => {
        const bancard = (window as any).Bancard;
        if (!bancard?.Checkout?.createForm) throw new Error('El checkout de Bancard no pudo cargarse.');
        bancard.Checkout.createForm('bancard-checkout', data.processId);
      };
      const existing = document.querySelector(`script[src="${data.checkoutScript}"]`) as HTMLScriptElement | null;
      if (existing) mountCheckout();
      else {
        const script = document.createElement('script');
        script.src = data.checkoutScript; script.async = true; script.onload = mountCheckout;
        script.onerror = () => setBillingMessage('No se pudo cargar el formulario seguro de Bancard.');
        document.head.appendChild(script);
      }
      setBillingMessage(`Pago ${data.shopProcessId} iniciado. El plan se activa cuando Bancard lo confirme.`);
    } catch (e: any) {
      setBillingMessage(e.message);
    } finally {
      setBillingLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overflow-y-auto p-4 md:p-8">
      <div className="max-w-5xl mx-auto bg-zinc-950 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center"><Building2 className="w-5 h-5 text-amber-400" /></div>
            <div><h2 className="font-black text-lg">DNA de marca</h2><p className="text-xs text-zinc-400">La fuente de verdad para guiones, ambientes, voz y subtítulos.</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 p-5">
          <section className="lg:col-span-2 space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="sm:col-span-2 text-xs text-zinc-400">Empresa<input value={companyName} onChange={e => setCompanyName(e.target.value)} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-sm text-white" placeholder="Nombre de la empresa" /></label>
              <label className="text-xs text-zinc-400">Mercado<select value={locale} onChange={e => setLocale(e.target.value)} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"><option value="es-PY">Paraguay</option><option value="es-AR">Argentina</option><option value="es-MX">México</option><option value="pt-BR">Brasil</option><option value="en-US">Estados Unidos</option></select></label>
            </div>
            <label className="block text-xs text-zinc-400">Texto de la web o catálogo<textarea value={websiteText} onChange={e => setWebsiteText(e.target.value)} rows={4} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-white" placeholder="Pegá aquí el contenido principal, propuesta de valor y condiciones comerciales…" /></label>
            <label className="block text-xs text-zinc-400">Exportación o ejemplos de publicaciones<textarea value={socialText} onChange={e => setSocialText(e.target.value)} rows={4} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-white" placeholder="Biografía, captions y publicaciones que mejor representen la marca…" /></label>
            <label className="block text-xs text-zinc-400">Productos — uno por línea<textarea value={productsText} onChange={e => setProductsText(e.target.value)} rows={4} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-white" placeholder="Producto | categoría | beneficio | precio | URL" /></label>
            {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</p>}
            <button onClick={extract} disabled={loading || !companyName || (!websiteText && !socialText && !productsText)} className="w-full rounded-xl bg-amber-400 text-zinc-950 font-black py-3 disabled:opacity-40 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analizar y construir DNA
            </button>
          </section>

          <aside className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">Plan y consumo</p>
              <select value={planId} onChange={e => onPlanChange(e.target.value as PlanId)} className="mt-2 w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-sm">
                {SUBSCRIPTION_PLANS.map(item => <option key={item.id} value={item.id}>{item.name} · ₲ {item.pricePyg.toLocaleString('es-PY')}/mes</option>)}
              </select>
              <div className="mt-3 flex justify-between text-xs"><span>{usedVideos} usados</span><span>{plan.monthlyVideos} incluidos</span></div>
              <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${usagePercent}%` }} /></div>
              <p className="text-[11px] text-zinc-500 mt-2">Hasta {plan.maxVideoSeconds}s · {plan.brands} marca{plan.brands > 1 ? 's' : ''}</p>
              <button onClick={startBancardCheckout} disabled={billingLoading} className="mt-3 w-full py-2.5 rounded-lg bg-sky-500 text-zinc-950 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {billingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Pagar con Bancard
              </button>
              {billingMessage && <p className="mt-2 text-[11px] text-sky-200">{billingMessage}</p>}
              <div id="bancard-checkout" className="mt-3" />
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-64">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">DNA activo</p>
              {result ? <div className="mt-3 space-y-3 text-xs">
                <div><strong className="text-white">{result.companyName}</strong><p className="text-zinc-400">{result.industry}</p></div>
                <div><span className="text-zinc-500">Propuesta</span><p>{result.valueProposition}</p></div>
                <div className="flex flex-wrap gap-1">{result.tone.map(item => <span key={item} className="px-2 py-1 rounded bg-amber-400/10 text-amber-300">{item}</span>)}</div>
                <p className="text-zinc-400">{result.productSignals.length} productos detectados</p>
                <button onClick={() => { onSave(result); onClose(); }} className="w-full py-2.5 rounded-lg bg-emerald-500 text-zinc-950 font-bold flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Aprobar y usar</button>
              </div> : <p className="mt-3 text-xs text-zinc-500">Completá las fuentes para generar un perfil verificable.</p>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
