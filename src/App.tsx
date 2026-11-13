import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

// Agente público de ElevenLabs (sin autenticación): demo de Armoni.
const AGENTE = "agent_1401m7bajtcbec08vtmyzapn65xj";
// WebSocket entrega la sincronía de cada palabra con el audio (texto en vivo).
// En Android el micrófono por WebSocket falla en algunos equipos, así que ahí se
// usa WebRTC (texto completo al final de cada frase) con respaldo por WebSocket.
const ES_ANDROID = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
const CANAL_INICIAL: "webrtc" | "websocket" = ES_ANDROID ? "webrtc" : "websocket";
// Si mientras Armoni escucha el micrófono no capta nada en este tiempo, se avisa.
const ESPERA_SILENCIO_MS = 7000;
const ESPERA_WEBRTC_MS = 6000;
// Si llega el texto de Armoni pero no la sincronía, se muestra completo tras esta espera.
const ESPERA_SINCRONIA_MS = 1500;

type Alineacion = { chars: string[]; char_start_times_ms: number[]; char_durations_ms: number[] };

type Pantalla = "inicio" | "conversacion" | "cierre";
type Canal = "webrtc" | "websocket";
type EstadoVoz = "conectando" | "hablando" | "escuchando";

type EventosSesion = {
  onConectada: () => void;
  onModo: (hablando: boolean) => void;
  onMensaje: (fuente: "ai" | "user", texto: string) => void;
  onAlineacion: (a: Alineacion) => void;
  onVolumen: (v: number) => void;
  onFin: () => void;
  onFallo: (msg: string) => void;
};

// Vive dentro de un ConversationProvider con key propia: al cambiar de canal se
// desmonta el proveedor (cierra la conexión pendiente) y se monta uno nuevo.
function Sesion({ canal, ev }: { canal: Canal; ev: EventosSesion }) {
  const conv = useConversation({
    onConnect: () => ev.onConectada(),
    onModeChange: ({ mode }) => ev.onModo(mode === "speaking"),
    onMessage: (m) => ev.onMensaje(m.source === "ai" ? "ai" : "user", m.message),
    onAudioAlignmentPlayback: ({ alignment }) => ev.onAlineacion(alignment),
    onDisconnect: () => ev.onFin(),
    onError: (msg) => ev.onFallo(msg),
  });
  const iniciada = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      try {
        ev.onVolumen(conv.getInputVolume());
      } catch {
        // Sin sesión activa todavía.
      }
    }, 400);
    return () => clearInterval(t);
  });
  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    conv.startSession({ connectionType: canal });
  }, [conv, canal]);
  return null;
}

// Muestra del texto completo tantos caracteres (sin contar espacios) como ya se
// pronunciaron, cerrando la palabra en curso. Sin texto completo, limpia espacios.
function visible(habladoCrudo: string, completoCrudo?: string) {
  // Las etiquetas de expresión de la voz ([laughs], [warmly]…) no se muestran.
  const sinEtiquetas = (t: string) => t.replace(/\[[^\]]*\]\s*/g, "");
  const hablado = sinEtiquetas(habladoCrudo);
  const completo = completoCrudo === undefined ? undefined : sinEtiquetas(completoCrudo);
  if (!completo) return hablado.replace(/\s+/g, " ").trimStart();
  let n = hablado.replace(/\s/g, "").length;
  let i = 0;
  while (i < completo.length && n > 0) {
    if (!/\s/.test(completo[i])) n--;
    i++;
  }
  while (i < completo.length && !/\s/.test(completo[i])) i++;
  return completo.slice(0, i);
}

const Mic = ({ size = 20 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

const Marca = () => (
  <div className="marca">
    <div className="marca-titulo">SOMOS ARMONÍA</div>
    <div className="marca-sub">Convención México 2027</div>
  </div>
);

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>("inicio");
  const [intento, setIntento] = useState(0);
  const [canal, setCanal] = useState<Canal>(CANAL_INICIAL);
  const [estado, setEstado] = useState<EstadoVoz>("conectando");
  // En los mensajes de Armoni, `texto` es lo ya pronunciado (según la sincronía del audio)
  // y `completo` el texto final de la respuesta, que da la ortografía y los espacios.
  const [mensajes, setMensajes] = useState<{ id: number; fuente: "ai" | "user"; texto: string; completo?: string }[]>([]);
  const modoPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Texto en vivo: id del mensaje de Armoni que se está escribiendo palabra a palabra.
  const vivo = useRef<number | null>(null);
  const contador = useRef(0);
  const cola = useRef<string[]>([]);
  const reveladas = useRef(0);
  const ultimoTextoAI = useRef("");
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([]);
  const textoSinSincronia = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState("");
  const [sinMicro, setSinMicro] = useState(false);
  const silencioDesde = useRef<number | null>(null);
  const estadoRef = useRef<EstadoVoz>("conectando");
  estadoRef.current = estado;

  const intentoActual = useRef(0);
  const conectada = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiarEspera = () => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
  };

  function limpiarVivo() {
    relojes.current.forEach(clearTimeout);
    relojes.current = [];
    if (textoSinSincronia.current) clearTimeout(textoSinSincronia.current);
    textoSinSincronia.current = null;
    vivo.current = null;
    cola.current = [];
    reveladas.current = 0;
  }

  function agregar(fuente: "ai" | "user", texto: string): number {
    const nuevoId = ++contador.current;
    setMensajes((ms) => [...ms.slice(-1), { id: nuevoId, fuente, texto }]);
    return nuevoId;
  }

  function abrir(c: Canal) {
    limpiarVivo();
    limpiarEspera();
    conectada.current = false;
    intentoActual.current += 1;
    const id = intentoActual.current;
    setCanal(c);
    setIntento(id);
    setEstado("conectando");
    if (c === "webrtc") {
      espera.current = setTimeout(() => {
        if (intentoActual.current === id && !conectada.current) abrir("websocket");
      }, ESPERA_WEBRTC_MS);
    }
  }

  // Los eventos de un intento ya reemplazado se ignoran.
  const eventos = (id: number, c: Canal): EventosSesion => ({
    onConectada: () => {
      if (id !== intentoActual.current) return;
      conectada.current = true;
      limpiarEspera();
      setEstado("escuchando");
    },
    onModo: (hablando) => {
      if (id !== intentoActual.current) return;
      // Las pausas cortas entre frases de Armoni no cambian el estado (evita parpadeos).
      if (modoPendiente.current) clearTimeout(modoPendiente.current);
      if (hablando) setEstado("hablando");
      else modoPendiente.current = setTimeout(() => setEstado("escuchando"), 450);
    },
    onMensaje: (fuente, texto) => {
      if (id !== intentoActual.current) return;
      if (fuente === "user") {
        limpiarVivo();
        ultimoTextoAI.current = "";
        agregar("user", texto);
        return;
      }
      ultimoTextoAI.current = texto;
      if (vivo.current !== null) {
        const v = vivo.current;
        setMensajes((ms) => ms.map((m) => (m.id === v ? { ...m, completo: texto } : m)));
        return;
      }
      // Por WebRTC no hay sincronía: el texto se muestra de una vez.
      if (c === "webrtc") {
        vivo.current = agregar("ai", texto);
        return;
      }
      if (textoSinSincronia.current) clearTimeout(textoSinSincronia.current);
      textoSinSincronia.current = setTimeout(() => {
        textoSinSincronia.current = null;
        if (vivo.current === null && intentoActual.current === id) {
          vivo.current = agregar("ai", texto);
        }
      }, ESPERA_SINCRONIA_MS);
    },
    onVolumen: (v) => {
      if (id !== intentoActual.current) return;
      if (estadoRef.current !== "escuchando" || v > 0.01) {
        silencioDesde.current = null;
        if (v > 0.01) setSinMicro(false);
        return;
      }
      silencioDesde.current ??= Date.now();
      if (Date.now() - silencioDesde.current > ESPERA_SILENCIO_MS) setSinMicro(true);
    },
    onAlineacion: (a) => {
      if (id !== intentoActual.current) return;
      if (textoSinSincronia.current) {
        clearTimeout(textoSinSincronia.current);
        textoSinSincronia.current = null;
      }
      // Agrupa los caracteres en palabras con su momento de inicio en el audio.
      const palabras: { texto: string; ms: number }[] = [];
      a.chars.forEach((ch, i) => {
        const empieza = i === 0 || (/\s/.test(a.chars[i - 1]) && !/\s/.test(ch));
        if (empieza || !palabras.length) palabras.push({ texto: ch, ms: a.char_start_times_ms[i] ?? 0 });
        else palabras[palabras.length - 1].texto += ch;
      });
      if (vivo.current === null) {
        vivo.current = agregar("ai", "");
        if (ultimoTextoAI.current) {
          const t = ultimoTextoAI.current;
          const v = vivo.current;
          setMensajes((ms) => ms.map((m) => (m.id === v ? { ...m, completo: t } : m)));
        }
      }
      const msgId = vivo.current;
      // Cola en orden de llegada: cada reloj revela "hasta su palabra", así el texto
      // queda en orden aunque dos fragmentos de audio se solapen.
      const base = cola.current.length;
      cola.current.push(...palabras.map((p) => p.texto));
      palabras.forEach((p, k) => {
        relojes.current.push(
          setTimeout(() => {
            if (vivo.current !== msgId) return;
            reveladas.current = Math.max(reveladas.current, base + k + 1);
            const texto = cola.current.slice(0, reveladas.current).join("");
            setMensajes((ms) => ms.map((m) => (m.id === msgId ? { ...m, texto } : m)));
          }, p.ms),
        );
      });
    },
    onFin: () => {
      if (id !== intentoActual.current || !conectada.current) return;
      conectada.current = false;
      setPantalla("cierre");
    },
    onFallo: (msg) => {
      if (id !== intentoActual.current) return;
      console.error(msg);
      if (!conectada.current && c === "webrtc") {
        abrir("websocket");
        return;
      }
      limpiarEspera();
      intentoActual.current += 1;
      setError("No pudimos conectar con Armoni. Intenta de nuevo.");
      setPantalla("inicio");
    },
  });

  useEffect(() => limpiarEspera, []);

  async function iniciar() {
    setError("");
    setMensajes([]);
    limpiarVivo();
    setSinMicro(false);
    silencioDesde.current = null;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Necesitamos acceso al micrófono para conversar con Armoni.");
      return;
    }
    setPantalla("conversacion");
    abrir(CANAL_INICIAL);
  }

  function terminar() {
    limpiarEspera();
    limpiarVivo();
    intentoActual.current += 1;
    conectada.current = false;
    setPantalla("cierre");
  }

  const hablandoOConectando = estado !== "escuchando";

  return (
    <div className="pantalla">
      <img className="foto" src="/armoni_fondo_oscuro.jpg" alt="Armoni, anfitriona virtual de la convención" />
      <div className={`velo ${pantalla === "conversacion" ? "velo-alto" : ""}`} aria-hidden="true" />

      {pantalla === "conversacion" && (
        <ConversationProvider key={intento} agentId={AGENTE}>
          <Sesion canal={canal} ev={eventos(intento, canal)} />
        </ConversationProvider>
      )}

      <header className="cabecera">
        <Marca />
        {pantalla === "conversacion" && (
          <button className="cerrar" aria-label="Terminar conversación" onClick={terminar}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        )}
      </header>

      {pantalla === "inicio" && (
        <main className="pie">
          <div className="antetitulo">BEFORE YOU GO</div>
          <h1 className="titulo">Antes de que viajes, conozcámonos.</h1>
          <p className="texto">Armoni te hará unas preguntas para preparar la convención a tu medida. Son unos dos minutos.</p>
          <button className="boton-principal" onClick={iniciar}>
            <Mic /> Hablar con Armoni
          </button>
          <p className={error ? "nota nota-error" : "nota"}>{error || "Te pediremos permiso para usar el micrófono."}</p>
        </main>
      )}

      {pantalla === "conversacion" && (
        <main className="pie pie-conversacion">
          <div className="dialogo" aria-live="polite">
            {mensajes.map((m) => ({ ...m, texto: visible(m.texto, m.completo) })).filter((m) => m.texto).map((m, i, lista) =>
              m.fuente === "user" ? (
                <p key={m.id} className="tu-frase"><span className="tu-etiqueta">Tú</span>{m.texto}</p>
              ) : (
                <p key={m.id} className={i === lista.length - 1 ? "frase" : "frase frase-previa"}>{m.texto}</p>
              ),
            )}
          </div>
          <div className="estado-fila">
            {hablandoOConectando ? (
              <div className="estado-habla">
                <div className={`onda ${estado === "conectando" ? "onda-quieta" : ""}`} aria-hidden="true">
                  <span /><span /><span /><span /><span />
                </div>
                <span>{estado === "conectando" ? "Conectando con Armoni…" : "Armoni está hablando"}</span>
              </div>
            ) : (
              <div className="estado-escucha">
                <div className="mic-pulso">
                  <div className="pulso" aria-hidden="true" />
                  <div className="pulso dos" aria-hidden="true" />
                  <div className="mic-circulo"><Mic size={22} /></div>
                </div>
                <div className="escucha-textos">
                  <span className="escucha-titulo">Te escucho</span>
                  <span className={sinMicro ? "escucha-sub escucha-aviso" : "escucha-sub"}>
                    {sinMicro ? "No te escuchamos. Revisa el permiso del micrófono o abre el enlace en Chrome." : "Habla con naturalidad"}
                  </span>
                </div>
              </div>
            )}
          </div>
          <button className="boton-secundario" onClick={terminar}>Terminar conversación</button>
        </main>
      )}

      {pantalla === "cierre" && (
        <main className="pie">
          <div className="filete" />
          <h1 className="titulo">Gracias por conversar con Armoni.</h1>
          <p className="texto">Con lo que nos contaste prepararemos tu experiencia en la convención. Nos vemos muy pronto.</p>
          <button className="boton-secundario" onClick={() => setPantalla("inicio")}>Volver a conversar</button>
        </main>
      )}
    </div>
  );
}
