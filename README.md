# ReelForge AI

SaaS multiempresa para construir reels publicitarios con DNA de marca, catálogo, agentes especializados, voces, control de políticas, cuotas mensuales y trazabilidad de costos.

## Incluye

- Registro, login, sesiones HttpOnly, organizaciones y roles.
- SQLite persistente con aislamiento por empresa.
- Brand DNA versionado y aprobable.
- Catálogo de productos y fuentes sociales/manuales.
- Swarm CEO → Creative → Visual → Copy → Guard → Producer.
- Detección determinística de precios y descuentos inventados.
- Cuatro voces comerciales de referencia para el modelo de audio Gemini de AI Studio.
- Planes, reservas de crédito, consumo/release y costos por proveedor.
- Cola de render local, manifiestos JSON, subtítulos SRT y videos Gemini opcionales.
- Checkout y confirmación firmada con Bancard vPOS 2.0.
- Workspace con resumen, catálogo, campañas y biblioteca.
- Autorización por roles, cuotas durables por operación de IA y propiedad de artefactos del proveedor.
- Streaming de video sin almacenar archivos completos en memoria.

## Desarrollo

Requiere Node.js 24+.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Abrir `http://localhost:3000`, crear una cuenta y empresa. Sin claves externas funciona el modo local completo: genera campaña determinística auditada y artefactos de prueba. Con `GEMINI_API_KEY` activa análisis/generación real.

Para iniciar automáticamente los proyectos Node encontrados en un workspace, asignando puertos consecutivos y guardando logs separados:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local-workspace.ps1 -WorkspaceRoot "D:\Apps Videos Reel" -BasePort 3000
```

## Verificación

```bash
npm run lint
npm test
npm run build
npm audit --omit=dev
```

## Producción

```bash
docker build -t reelforge-ai .
docker run -p 3000:3000 -v reelforge-data:/app/data --env-file .env.local reelforge-ai
```

Respaldar el volumen `/app/data`. Para escala horizontal, migrar el esquema de `src/server/db.ts` a PostgreSQL y reemplazar el worker en proceso por una cola durable compartida.

## Variables

- `GEMINI_API_KEY`: agentes y medios Gemini.
- `DATA_DIR`: base SQLite y artefactos.
- `APP_URL`: URL pública.
- `PORT`, `TRUST_PROXY` y `COOKIE_SECURE`: servidor, proxy y cookies seguras.
- `BANCARD_PUBLIC_KEY` y `BANCARD_PRIVATE_KEY`: credenciales del comercio Bancard.
- `BANCARD_BASE_URL` y `BANCARD_CHECKOUT_SCRIPT`: ambiente/SDK entregados en la certificación vPOS.
- `BANCARD_AMOUNT_*`: precios mensuales en guaraníes.

Los audios de Malena, Alejo, Gaby y Horacio se usan como referencias de dirección acústica; la narración se genera con el modelo TTS de Gemini/AI Studio.

## Modelos de IA

Los identificadores están centralizados en `src/ai-models.ts`. La configuración vigente usa Gemini 3.5 Flash-Lite para texto y agentes, Gemini 3.1 Flash TTS para locución, Nano Banana 2 Lite para imagen y Gemini Omni Flash para video conversacional. Antes de actualizar un modelo preview se deben ejecutar lint, pruebas, build y una generación sandbox.

## Seguridad y escala

- Las operaciones de IA requieren sesión, rol autorizado, suscripción activa y cuota persistente por organización.
- Los archivos e interacciones Gemini se vinculan a la organización antes de consultar, editar o transmitir.
- Bancard acepta únicamente transiciones pendientes a terminales; las repeticiones no reactivan planes históricos.
- Los workers reclaman jobs de forma atómica y el ledger se liquida una sola vez en el periodo original.
- Para varias instancias, migrar SQLite a PostgreSQL y `setImmediate` a una cola durable. Las reglas de autorización/cuota ya están separadas para conservarlas en esa migración.
