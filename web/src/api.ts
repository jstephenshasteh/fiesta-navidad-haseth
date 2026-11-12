/** Cliente de la API y manejo de sesión. */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const CLAVE = 'fnh_sesion';

export interface Admin {
  id: number;
  nombre: string;
  esPrincipal: boolean;
  color: string;
}

interface Sesion {
  token: string;
  admin: Admin;
}

export function leerSesion(): Sesion | null {
  try {
    const s = localStorage.getItem(CLAVE);
    return s ? (JSON.parse(s) as Sesion) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(s: Sesion | null) {
  try {
    if (s) localStorage.setItem(CLAVE, JSON.stringify(s));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* almacenamiento no disponible */
  }
}

export class ErrorApi extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(ruta: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = leerSesion()?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const r = await fetch(BASE + ruta, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  if (r.status === 401 && token) {
    guardarSesion(null);
    window.location.assign('/');
  }
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try {
      msg = ((await r.json()) as { error?: string }).error ?? msg;
    } catch {
      /* sin cuerpo */
    }
    throw new ErrorApi(msg, r.status);
  }
  const tipo = r.headers.get('content-type') ?? '';
  return (tipo.includes('application/json') ? r.json() : r.blob()) as Promise<T>;
}

/** URL con el token en la consulta (para <img> o enlaces). */
export function urlConToken(ruta: string): string {
  const t = leerSesion()?.token ?? '';
  return `${BASE}${ruta}${ruta.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`;
}

export function urlApi(ruta: string): string {
  return BASE + ruta;
}

export async function descargar(ruta: string, nombre: string) {
  const blob = await api<Blob>(ruta);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ---------- Tipos compartidos ----------

export interface Invitado {
  id: number;
  codigo: string;
  nombre: string;
  correo: string | null;
  whatsapp: string | null;
  compania: string | null;
  area: string | null;
  llegadaEn: string | null;
  llegadaVia: string | null;
  llegadaAdmin: string | null;
  waEnviadoEn: string | null;
  correoEnviadoEn: string | null;
}

export interface Resumen {
  total: number;
  llegaron: number;
  faltan: number;
  enviadas: number;
  pendientes: number;
}

export interface Evento {
  id: number;
  nombre: string;
  fechaTexto: string | null;
  dia: string | null;
  mesCorto: string | null;
  hora: string | null;
  lugar: string | null;
  salon: string | null;
  vestimenta: string | null;
  prefijoCodigo: string;
  temaPase: 'rojo' | 'verde' | null;
  asuntoCorreo: string | null;
  mensaje: string | null;
  arteNombre: string | null;
  tieneArte: number;
}

// ---------- Utilidades ----------

export function hora(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' });
}

export function iniciales(nombre: string): string {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function normalizar(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function primerNombre(n: string | undefined): string {
  return (n ?? '').split(' ')[0];
}
