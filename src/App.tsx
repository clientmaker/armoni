import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

// Agente público de ElevenLabs (sin autenticación): demo de Armoni.
const AGENTE = "agent_1401m7bajtcbec08vtmyzapn65xj";
// WebRTC da menor latencia y mejor cancelación de eco; si la red no lo permite
// en este tiempo, se reintenta por WebSocket.
const ESPERA_WEBRTC_MS = 6000;

type Pantalla = "inicio" | "conversacion" | "cierre";
type Canal = "webrtc" | "websocket";
type EstadoVoz = "conectando" | "hablando" | "escuchando";

type EventosSesion = {
  onConectada: () => void;
  onModo: (hablando: boolean) => void;
  onMensaje: (fuente: "ai" | "user", texto: string) => void;
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
    onDisconnect: () => ev.onFin(),
    onError: (msg) => ev.onFallo(msg),
  });
  const iniciada = useRef(false);
  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    conv.startSession({ connectionType: canal });
  }, [conv, canal]);
  return null;
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
  const [canal, setCanal] = useState<Canal>("webrtc");
  const [estado, setEstado] = useState<EstadoVoz>("conectando");
  const [frase, setFrase] = useState("");
  const [tuFrase, setTuFrase] = useState("");
  const [ultimo, setUltimo] = useState<"ai" | "user">("ai");
  const [error, setError] = useState("");

  const intentoActual = useRef(0);
  const conectada = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiarEspera = () => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
  };

  function abrir(c: Canal) {
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
      setEstado(hablando ? "hablando" : "escuchando");
    },
    onMensaje: (fuente, texto) => {
      if (id !== intentoActual.current) return;
      if (fuente === "ai") setFrase(texto);
      else setTuFrase(texto);
      setUltimo(fuente);
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
    setFrase("");
    setTuFrase("");
    setUltimo("ai");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Necesitamos acceso al micrófono para conversar con Armoni.");
      return;
    }
    setPantalla("conversacion");
    abrir("webrtc");
  }

  function terminar() {
    limpiarEspera();
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
          {hablandoOConectando ? (
            <>
              <div className="estado-habla">
                <div className={`onda ${estado === "conectando" ? "onda-quieta" : ""}`} aria-hidden="true">
                  <span /><span /><span /><span /><span />
                </div>
                <span>{estado === "conectando" ? "Conectando con Armoni…" : "Armoni está hablando"}</span>
              </div>
              {tuFrase && <p className="tu-frase"><span className="tu-etiqueta">Tú</span>{tuFrase}</p>}
              {frase && ultimo === "ai" && <p className="frase">{frase}</p>}
            </>
          ) : (
            <>
              {frase && <p className="frase frase-tenue">{frase}</p>}
              {tuFrase && ultimo === "user" && <p className="tu-frase"><span className="tu-etiqueta">Tú</span>{tuFrase}</p>}
              <div className="estado-escucha">
                <div className="mic-pulso">
                  <div className="pulso" aria-hidden="true" />
                  <div className="pulso dos" aria-hidden="true" />
                  <div className="mic-circulo"><Mic size={26} /></div>
                </div>
                <div className="escucha-textos">
                  <span className="escucha-titulo">Te escucho</span>
                  <span className="escucha-sub">Habla con naturalidad</span>
                </div>
              </div>
            </>
          )}
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
