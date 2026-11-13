import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConversationProvider } from "@elevenlabs/react";
import App from "./App";
import "./estilos.css";

// Agente público de ElevenLabs (sin autenticación): demo de Armoni.
const AGENTE = "agent_1401m7bajtcbec08vtmyzapn65xj";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConversationProvider agentId={AGENTE} connectionType="websocket">
      <App />
    </ConversationProvider>
  </StrictMode>,
);
