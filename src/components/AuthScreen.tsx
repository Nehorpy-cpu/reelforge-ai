import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', companyName: '' });
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo continuar'); onAuthenticated();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  return <div className="min-h-screen bg-zinc-950 text-white grid lg:grid-cols-2">
    <section className="hidden lg:flex p-16 flex-col justify-between bg-gradient-to-br from-amber-400 via-orange-500 to-fuchsia-700 text-zinc-950">
      <div className="font-black text-xl flex items-center gap-2"><Sparkles /> ReelForge AI</div>
      <div><h1 className="text-6xl font-black leading-[0.95]">Tu equipo creativo completo, en un solo sistema.</h1><p className="mt-6 text-xl max-w-xl">DNA de marca, agentes, campañas, voces, video, subtítulos y control de costos.</p></div>
      <p className="text-sm font-bold">Diseñado para marcas, comercios y agencias.</p>
    </section>
    <section className="flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md space-y-4">
      <div><p className="text-amber-400 font-mono text-xs uppercase tracking-widest">ReelForge AI</p><h2 className="text-3xl font-black mt-2">{mode === 'login' ? 'Ingresar' : 'Crear tu estudio'}</h2></div>
      {mode === 'register' && <><input required minLength={2} placeholder="Tu nombre" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/><input required minLength={2} placeholder="Nombre de la empresa" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })}/></>}
      <input required type="email" placeholder="Email" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/>
      <input required minLength={8} type="password" placeholder="Contraseña (mínimo 8 caracteres)" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}/>
      {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 p-3 rounded-xl">{error}</p>}
      <button disabled={loading} className="w-full bg-amber-400 text-zinc-950 rounded-xl py-3 font-black flex justify-center gap-2">{loading && <Loader2 className="animate-spin w-5"/>}{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
      <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="w-full text-sm text-zinc-400 hover:text-white">{mode === 'login' ? '¿Primera vez? Crear cuenta' : 'Ya tengo cuenta'}</button>
    </form></section>
  </div>;
}
