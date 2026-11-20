// Configuración de cada demo. La ruta de la URL elige el cliente: "/" Mazda, "/alqueria" Alquería.

export type Cliente = {
  agente: string;
  nombre: string; // nombre de la anfitriona en pantalla
  marcaTitulo: string;
  marcaSub: string;
  logo?: string;
  foto: string;
  // "fondo": foto a pantalla completa recortada. "recorte": figura sin fondo sobre un degradado.
  tipoFoto: "fondo" | "recorte";
  tituloPestana: string;
  colores: Record<string, string>;
};

const mazda: Cliente = {
  agente: "agent_1401m7bajtcbec08vtmyzapn65xj",
  nombre: "Armoni",
  marcaTitulo: "SOMOS ARMONÍA",
  marcaSub: "Convención México 2027",
  foto: "/armoni_fondo_oscuro.jpg",
  tipoFoto: "fondo",
  tituloPestana: "Armoni · Somos Armonía",
  colores: {},
};

const alqueria: Cliente = {
  agente: "agent_9301m7wk6wdze209m6k8gfhhkqq8",
  nombre: "Activa",
  marcaTitulo: "ACTIVA",
  marcaSub: "Anfitriona virtual de la convención",
  logo: "/alqueria_logo.png",
  foto: "/activa.webp",
  tipoFoto: "recorte",
  tituloPestana: "Activa · Alquería",
  colores: {
    "--negro": "#2a0004",
    "--fondo-rgb": "42,0,4",
    "--vino": "#ffffff",
    "--boton-texto": "#c8001e",
    "--rosa": "#ffb3b3",
    "--suave": "#f1d6d6",
    "--tenue": "#e2bcbc",
  },
};

export function clienteActual(): Cliente {
  const ruta = typeof location !== "undefined" ? location.pathname.toLowerCase() : "/";
  return ruta.startsWith("/alqueria") ? alqueria : mazda;
}
