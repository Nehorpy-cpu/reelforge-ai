import test from 'node:test';
import assert from 'node:assert/strict';
import { runCampaignAgents, scanDeterministicPolicy, type AgentId } from '../src/server/agent-runtime.js';

const strategy = { title:'Campaña', objective:'conversion', audience:'adultos', offer:'Beneficio comprobado', angle:'calidad', kpi:'conversiones' };
const creative = { hook:'Descubrí la diferencia', voiceover:'Una propuesta clara', cta:'Conocé más', scenes:[{ start:0,end:5,visual:'Producto',copy:'Calidad' },{ start:5,end:10,visual:'Uso',copy:'Experiencia' },{ start:10,end:15,visual:'Cierre',copy:'Conocé más' }] };
const visual = { continuity:'Continuidad premium', scenes:creative.scenes.map(scene => ({ ...scene, camera:'85mm',lighting:'soft light',prompt:`Premium ${scene.visual}` })) };
const copy = { subtitles:creative.scenes.map(scene => ({ start:scene.start,end:scene.end,text:scene.copy })),onScreenText:'Descubrí',caption:'Una propuesta clara.',hashtags:['#Marca'] };

test('agent contracts retry malformed output and preserve a valid workflow', async () => {
  let ceoCalls = 0; const phases: string[] = [];
  const ask = async (agent: AgentId) => {
    if (agent === 'ceo') return ++ceoCalls === 1 ? { title:'' } : strategy;
    if (agent === 'creative') return creative;
    if (agent === 'visual') return visual;
    if (agent === 'copy') return copy;
    return { severity:'ok',findings:[],requiredChanges:[],publishable:true };
  };
  const result = await runCampaignAgents({ brief:'Brief de prueba verificable',brandDna:{companyName:'Marca'},products:[],platform:'instagram',duration:15,ask,event:event=>phases.push(`${event.agent}:${event.phase}`) });
  assert.equal(result.audit.publishable, true);
  assert.equal(ceoCalls, 2);
  assert.ok(phases.includes('ceo:retry'));
});

test('regulator triggers a correction loop and re-audits before approval', async () => {
  let guardCalls = 0, creativeCalls = 0;
  const ask = async (agent: AgentId) => {
    if (agent === 'ceo') return strategy;
    if (agent === 'creative') { creativeCalls++; return creative; }
    if (agent === 'visual') return visual;
    if (agent === 'copy') return copy;
    guardCalls++;
    return guardCalls === 1
      ? { severity:'warning',findings:['Claim riesgoso'],requiredChanges:['Eliminar claim'],publishable:false }
      : { severity:'ok',findings:[],requiredChanges:[],publishable:true };
  };
  const result = await runCampaignAgents({ brief:'Brief de prueba verificable',brandDna:{companyName:'Marca'},products:[],platform:'instagram',duration:15,ask });
  assert.equal(result.audit.publishable, true);
  assert.equal(result.revisions, 1);
  assert.equal(guardCalls, 2);
  assert.equal(creativeCalls, 2);
});

test('invalid timing is rejected after the bounded retry', async () => {
  await assert.rejects(() => runCampaignAgents({ brief:'Brief verificable',brandDna:{},products:[],platform:'instagram',duration:15,
    ask: async agent => agent === 'ceo' ? strategy : agent === 'creative' ? { ...creative, scenes:[{ start:0,end:20,visual:'x',copy:'x' }] } : visual
  }), /creative: Tiempo inválido/);
});

test('versioned deterministic policy pack blocks sensitive personal attributes and guarantees', () => {
  const risks = scanDeterministicPolicy('¿Sufres de diabetes? Esta fórmula garantiza resultados.');
  assert.deepEqual(risks.map(item => item.id), ['personal-attributes','guaranteed-outcome']);
  assert.ok(risks.every(item => item.policyVersion === 'meta-ads-2026-08-15'));
});
