import { useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";

type Pantalla = "inicio" | "conversacion" | "cierre";

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
  const [frase, setFrase] = useState("");
  const [error, setError] = useState("");
  const iniciada = useRef(false);

  const conv = useConversation({
    onConnect: () => {
      iniciada.current = true;
    },
    onMessage: (m) => {
      if (m.source === "ai") setFrase(m.message);
    },
    onDisconnect: () => {
      if (iniciada.current) setPantalla("cierre");
      iniciada.current = false;
    },
    onError: (msg) => {
      console.error(msg);
      setError("No pudimos conectar con Armoni. Intenta de nuevo.");
      setPantalla("inicio");
    },
  });

  const conectando = conv.status === "connecting";
  const conectada = conv.status === "connected";

  async function iniciar() {
    setError("");
    setFrase("");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Necesitamos acceso al micrófono para conversar con Armoni.");
      return;
    }
    setPantalla("conversacion");
    conv.startSession();
  }

  function terminar() {
    conv.endSession();
    setPantalla("cierre");
  }

  return (
    <div className="pantalla">
      <img className="foto" src="/armoni_fondo_oscuro.jpg" alt="Armoni, anfitriona virtual de la convención" />
      <div className={`velo ${pantalla === "conversacion" ? "velo-alto" : ""}`} aria-hidden="true" />

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
          {!conectada || conv.isSpeaking ? (
            <>
              <div className="estado-habla">
                <div className={`onda ${conectada ? "" : "onda-quieta"}`} aria-hidden="true">
                  <span /><span /><span /><span /><span />
                </div>
                <span>{conectando || !conectada ? "Conectando con Armoni…" : "Armoni está hablando"}</span>
              </div>
              {frase && <p className="frase">{frase}</p>}
            </>
          ) : (
            <>
              {frase && <p className="frase frase-tenue">{frase}</p>}
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
