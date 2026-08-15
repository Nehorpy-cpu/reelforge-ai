import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Crown,
  Sparkle,
  ImageSquare,
  PencilSimple,
  ShieldCheck,
  FilmSlate,
  Play,
  ChartBar,
  UsersThree,
  MagicWand,
  CalendarDots,
  Export,
  Pause,
  ArrowClockwise,
  CheckCircle,
  Clock,
  LockSimple,
  DownloadSimple,
  X,
  Plus,
  Microphone,
  Buildings,
} from "@phosphor-icons/react";
import "./AgentConstellation.css";

type Agent = {
  id: string;
  name: string;
  role: string;
  detail: string;
  color: string;
  status: "ready" | "running" | "pending";
  icon: React.ComponentType<any>;
  prompt: string;
};

const initialAgents: Agent[] = [
  {
    id: "ceo",
    name: "CEO",
    role: "Estrategia & Brief",
    detail: "Define el ángulo, audiencia y objetivo del reel.",
    color: "#ffd21c",
    status: "ready",
    icon: Crown,
    prompt:
      "Definí la estrategia de campaña usando el DNA aprobado, el catálogo y un objetivo verificable.",
  },
  {
    id: "creative",
    name: "Creativo",
    role: "Idea & Concepto",
    detail: "Genera el concepto creativo, storytelling y gancho.",
    color: "#ff4d9d",
    status: "ready",
    icon: Sparkle,
    prompt:
      "Transformá la estrategia en un hook, guion y escenas de alto impacto.",
  },
  {
    id: "visual",
    name: "Visual",
    role: "Dirección Visual",
    detail: "Moodboard, estilo, cámara y referencias visuales.",
    color: "#ff7b22",
    status: "running",
    icon: ImageSquare,
    prompt:
      "Creá un plan visual vertical con producto fiel, luz, cámara y continuidad.",
  },
  {
    id: "copy",
    name: "Copy",
    role: "Guion & Locución",
    detail: "Guion, texto en pantalla y locución optimizada.",
    color: "#27d7d2",
    status: "pending",
    icon: PencilSimple,
    prompt:
      "Prepará subtítulos, caption, CTA y hashtags legibles sin claims inventados.",
  },
  {
    id: "guard",
    name: "Regulador",
    role: "Cumplimiento & Legal",
    detail: "Revisa claims, políticas y lineamientos de marca.",
    color: "#ffd21c",
    status: "pending",
    icon: ShieldCheck,
    prompt:
      "Auditá políticas Meta, atributos personales, promociones y fidelidad al DNA.",
  },
  {
    id: "producer",
    name: "Productor",
    role: "Producción & Entrega",
    detail: "Coordina render, assets, costos y entrega final.",
    color: "#9d6df7",
    status: "pending",
    icon: FilmSlate,
    prompt:
      "Validá formato, duración, cuota, costo y manifiesto antes de renderizar.",
  },
];

const menu = [
  { id: "campaign", label: "Campaña", icon: Crown, color: "#ffc916" },
  { id: "agents", label: "Agentes", icon: Sparkle, color: "#ed297f" },
  { id: "generate", label: "Generar", icon: Play, color: "#ff6818" },
  { id: "results", label: "Resultados", icon: ChartBar, color: "#16c8cb" },
  { id: "team", label: "Colaboradores", icon: UsersThree, color: "#6657e8" },
];

export function AgentConstellation({
  me,
  onOpenStudio,
  onOpenWorkspace,
  onOpenVoices,
  onOpenBrand,
}: {
  me: any;
  onOpenStudio: () => void;
  onOpenWorkspace: () => void;
  onOpenVoices: () => void;
  onOpenBrand: () => void;
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [selected, setSelected] = useState<Agent>(initialAgents[2]);
  const [activeMenu, setActiveMenu] = useState("agents");
  const [tab, setTab] = useState("Indicaciones");
  const [paused, setPaused] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [dragged, setDragged] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    fetch("/api/workspace/campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCampaigns)
      .catch(() => setCampaigns([]));
  }, []);
  const current = campaigns[0];
  const rawCampaignName = current?.title || "9PM Rebel de Afnan";
  const campaignName = rawCampaignName.length > 42 ? "ReelForge Social" : rawCampaignName;
  const SelectedIcon = selected.icon;
  const progress = useMemo(
    () => agents.filter((a) => a.status === "ready").length,
    [agents],
  );
  const selectMenu = (id: string) => {
    setActiveMenu(id);
    if (id === "generate") onOpenStudio();
    else if (id === "campaign" || id === "results" || id === "team")
      onOpenWorkspace();
  };
  const dropOn = (target: string) => {
    if (!dragged || dragged === target) return;
    const next = [...agents];
    const from = next.findIndex((a) => a.id === dragged),
      to = next.findIndex((a) => a.id === target);
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setAgents(next);
    setDragged(null);
    setNotice("Flujo reorganizado");
    setTimeout(() => setNotice(""), 1800);
  };
  const rerun = () => {
    setAgents((items) =>
      items.map((a) =>
        a.id === selected.id ? { ...a, status: "running" } : a,
      ),
    );
    setNotice(`${selected.name} reiniciado`);
    setTimeout(() => {
      setAgents((items) =>
        items.map((a) =>
          a.id === selected.id ? { ...a, status: "ready" } : a,
        ),
      );
      setNotice("Salida actualizada");
      setTimeout(() => setNotice(""), 1500);
    }, 900);
  };
  return (
    <main className="rf-shell">
      <header className="rf-topbar">
        <button className="rf-brand" onClick={onOpenBrand}>
          <span>REELFORGE</span> <b>AI</b>
          <i>9R</i>
          <small>
            creative
            <br />
            operating system
          </small>
        </button>
        <section className="rf-campaign-head">
          <div>
            <small>CAMPAÑA ACTIVA</small>
          <strong title={rawCampaignName}>{campaignName}</strong>
            <span>
              Reel social · Latinoamérica · {current?.duration_seconds || 15}s
            </span>
          </div>
          <em>Listo para generar</em>
          <button aria-label="Exportar brief">
            <Export size={18} /> Exportar brief
          </button>
        </section>
        <button className="rf-voice-shortcut" onClick={onOpenVoices}>
          <Microphone size={20} />
          <span>Voces</span>
        </button>
      </header>

      <nav className="rf-orbit-menu" aria-label="Navegación principal">
        {menu.map((item, index) => (
          <motion.button
            whileHover={{ x: 8, scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            key={item.id}
            style={
              {
                "--note": item.color,
                "--tilt": `${index % 2 ? 4 : -5}deg`,
              } as React.CSSProperties
            }
            className={activeMenu === item.id ? "active" : ""}
            onClick={() => selectMenu(item.id)}
          >
            <item.icon size={24} weight="fill" />
            <span>{item.label}</span>
          </motion.button>
        ))}
      </nav>

      <section className="rf-board">
        <div className="rf-board-field">
        <div className="rf-campaign-core">
            <small>CAMPAÑA</small>
            <strong>{campaignName}</strong>
            <Buildings size={24} />
            <span>Reel social {current?.duration_seconds || 15}s</span>
          </div>
          {agents.map((agent, index) => {
            const Icon = agent.icon;
            return (
              <motion.button
                layout
                drag
                dragSnapToOrigin
                dragElastic={0.14}
                key={agent.id}
                draggable
                onDragStart={() => setDragged(agent.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(agent.id)}
                onClick={() => setSelected(agent)}
                className={`rf-agent-note pos-${index + 1} ${selected.id === agent.id ? "selected" : ""}`}
                style={{ "--note": agent.color } as React.CSSProperties}
                whileHover={{ scale: 1.04, rotate: 0 }}
              >
                <div>
                  <Icon size={24} weight="fill" />
                  <span>
                    <strong>{agent.name}</strong>
                    <small>{agent.role}</small>
                  </span>
                </div>
                <p>{agent.detail}</p>
                <em className={agent.status}>
                  {agent.status === "ready" ? <CheckCircle /> : <Clock />}
                  {agent.status === "ready"
                    ? "Listo"
                    : agent.status === "running"
                      ? "En proceso"
                      : "Pendiente"}
                </em>
              </motion.button>
            );
          })}
          <div className="rf-main-actions">
            <button
              className="rf-magic"
              onClick={() => setNotice("Asistente creativo activado")}
            >
              <MagicWand size={24} />
            </button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="rf-generate"
              onClick={onOpenStudio}
            >
              <Sparkle weight="fill" size={26} /> GENERAR REEL
              <small>Producción con IA</small>
            </motion.button>
            <button onClick={() => setNotice("Producción programada")}>
              <CalendarDots size={24} />
            </button>
          </div>
        </div>
        <div className="rf-progress">
          <small>PROGRESO DE LA CAMPAÑA</small>
          <div>
            {agents.map((agent, index) => (
              <button
                key={agent.id}
                onClick={() => setSelected(agent)}
                style={{ "--note": agent.color } as React.CSSProperties}
              >
                <b>{index + 1}</b>
                <span>
                  {agent.name}
                  <em>
                    {agent.status === "ready"
                      ? "Completado"
                      : agent.status === "running"
                        ? "En proceso"
                        : "Pendiente"}
                  </em>
                </span>
              </button>
            ))}
            <button className="delivery">
              <b>
                <Play weight="fill" />
              </b>
              <span>
                Entrega<em>Pendiente</em>
              </span>
            </button>
          </div>
        </div>
      </section>

      <aside className="rf-inspector">
        <div
          className="rf-inspector-title"
          style={{ "--note": selected.color } as React.CSSProperties}
        >
          <SelectedIcon size={28} weight="fill" />
          <div>
            <small>AGENTE</small>
            <strong>{selected.name}</strong>
            <span>{selected.role}</span>
          </div>
          <em>
            {selected.status === "running"
              ? "En proceso"
              : selected.status === "ready"
                ? "Listo"
                : "Pendiente"}
          </em>
          <button
            aria-label="Cerrar inspector"
            onClick={() => setSelected(initialAgents[2])}
          >
            <X />
          </button>
        </div>
        <div className="rf-tabs">
          {["Indicaciones", "Herramientas", "Permisos", "Historial"].map(
            (item) => (
              <button
                className={tab === item ? "active" : ""}
                onClick={() => setTab(item)}
                key={item}
              >
                {item}
              </button>
            ),
          )}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="rf-tab-content"
          >
            {tab === "Indicaciones" && (
              <>
                <label>PROMPT DEL AGENTE</label>
                <textarea
                  value={selected.prompt}
                  onChange={(e) =>
                    setSelected({ ...selected, prompt: e.target.value })
                  }
                />
                <small className="rf-count">
                  {selected.prompt.length} / 1000
                </small>
                <label>HERRAMIENTAS ACTIVAS</label>
                <div className="rf-tool-grid">
                  <button>
                    <ImageSquare />
                    Generador de imágenes
                  </button>
                  <button>
                    <FilmSlate />
                    Banco de assets
                  </button>
                  <button>
                    <ChartBar />
                    Análisis de tendencias
                  </button>
                  <button>
                    <Sparkle />
                    Paletas de color
                  </button>
                </div>
                <label>PERMISOS</label>
                <div className="rf-permissions">
                  <span>
                    Leer brief de campaña <CheckCircle />
                  </span>
                  <span>
                    Usar banco de assets <CheckCircle />
                  </span>
                  <span>
                    Generar contenido <CheckCircle />
                  </span>
                  <span>
                    Exportar resultados <LockSimple />
                  </span>
                </div>
              </>
            )}
            {tab === "Herramientas" && (
              <div className="rf-empty">
                <MagicWand size={44} />
                <strong>Kit creativo conectado</strong>
                <span>
                  Imagen, video, audio y análisis disponibles para este agente.
                </span>
              </div>
            )}
            {tab === "Permisos" && (
              <div className="rf-empty">
                <ShieldCheck size={44} />
                <strong>Acceso controlado</strong>
                <span>
                  Los permisos respetan la organización y el rol del usuario.
                </span>
              </div>
            )}
            {tab === "Historial" && (
              <div className="rf-history">
                <span>
                  <CheckCircle />
                  DNA y catálogo recibidos
                </span>
                <span>
                  <CheckCircle />
                  Prompt validado
                </span>
                <span>
                  <Clock />
                  Esperando siguiente ejecución
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <label>CONTROLES</label>
        <div className="rf-controls">
          <button onClick={() => setPaused(!paused)}>
            <Pause weight="fill" />{" "}
            {paused ? "Reanudar agente" : "Pausar agente"}
          </button>
          <button onClick={rerun}>
            <ArrowClockwise /> Rerun agente
          </button>
        </div>
        <div className="rf-output">
          <div>
            <label>SALIDA MÁS RECIENTE</label>
            <small>Hoy · 12:05</small>
          </div>
          <img
            src="/design/reelforge-output-strip.png"
            alt="Vista previa del reel con perfume y notas olfativas"
          />
          <button>
            <FilmSlate /> plan_visual_reel_v1.pdf <span>PDF · 2.4 MB</span>
            <DownloadSimple />
          </button>
        </div>
      </aside>
      <AnimatePresence>
        {notice && (
          <motion.div
            className="rf-toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <CheckCircle weight="fill" />
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
