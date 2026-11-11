/**
 * Cliente de las APIs REST de Oracle APEX (ORDS), módulo fiesta/v1.
 * Se autentica con OAuth2 "client credentials" y reutiliza el token hasta que vence.
 */
import { config } from './config.js';

const MODULO = '/fiesta/v1';

export class ErrorApex extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let token: { valor: string; vence: number } | null = null;
let pidiendo: Promise<string> | null = null;

async function obtenerToken(forzar = false): Promise<string> {
  const { baseUrl, clientId, clientSecret } = config.apex;
  if (!baseUrl) throw new ErrorApex('Falta APEX_BASE_URL', 500);
  if (!clientId || !clientSecret) return ''; // módulo sin protección (solo para pruebas)
  if (!forzar && token && token.vence > Date.now() + 30_000) return token.valor;
  pidiendo ??= (async () => {
    const r = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!r.ok) throw new ErrorApex(`APEX no entregó el token OAuth (${r.status}). Revise APEX_CLIENT_ID y APEX_CLIENT_SECRET.`, 502);
    const j = (await r.json()) as { access_token: string; expires_in?: number };
    token = { valor: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return token.valor;
  })().finally(() => (pidiendo = null));
  return pidiendo;
}

async function mensajeError(r: Response): Promise<string> {
  const texto = await r.text();
  try {
    const j = JSON.parse(texto) as { error?: string; message?: string; title?: string };
    return j.error ?? j.message ?? j.title ?? texto;
  } catch {
    return texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || `Error ${r.status}`;
  }
}

/** Traduce los errores de red de fetch ("fetch failed") a un mensaje con la causa real. */
function explicarFallo(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (err?.name === 'TimeoutError') return 'APEX no respondió en 30 segundos.';
  const codigo = err?.cause?.code ?? '';
  const detalle = codigo || err?.cause?.message || err?.message || String(e);
  let pista = '';
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|ERR_TLS/i.test(detalle)) {
    pista = ' → Node no confía en el certificado HTTPS del servidor APEX (certificado interno). Vea "Certificado interno" en el README.';
  } else if (codigo === 'ENOTFOUND' || codigo === 'EAI_AGAIN') {
    pista = ' → No se encuentra el servidor. Revise APEX_BASE_URL y que esté conectado a la red/VPN de la empresa.';
  } else if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'EHOSTUNREACH'].includes(codigo)) {
    pista = ' → El servidor no acepta la conexión desde este equipo (puerto, firewall o VPN).';
  }
  return `No se pudo conectar con APEX (${detalle}) en ${config.apex.baseUrl}${pista}`;
}

interface Opciones {
  cuerpo?: unknown;
  binario?: { datos: Buffer; tipo: string };
  respuesta?: 'json' | 'binario';
}

async function llamar(metodo: string, ruta: string, op: Opciones, reintento = false): Promise<Response> {
  const t = await obtenerToken(reintento);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (t) headers.Authorization = `Bearer ${t}`;
  let body: BodyInit | undefined;
  if (op.binario) {
    headers['Content-Type'] = op.binario.tipo;
    body = new Uint8Array(op.binario.datos);
  } else if (op.cuerpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(op.cuerpo);
  }
  let r: Response;
  try {
    r = await fetch(`${config.apex.baseUrl}${MODULO}${ruta}`, { method: metodo, headers, body, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new ErrorApex(explicarFallo(e), 502);
  }
  // Token vencido o revocado: se pide otro y se reintenta una vez.
  if (r.status === 401 && t && !reintento) return llamar(metodo, ruta, op, true);
  return r;
}

/** Llama a la API de APEX y devuelve el JSON (o los bytes si respuesta = 'binario'). */
export async function apex<T>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', ruta: string, op: Opciones = {}): Promise<T> {
  const r = await llamar(metodo, ruta, op);
  if (!r.ok) {
    const msg = await mensajeError(r);
    // Errores de datos (400/404/409) se pasan tal cual a la app; el resto se reporta como 502.
    throw new ErrorApex(msg, [400, 404, 409].includes(r.status) ? r.status : 502);
  }
  if (op.respuesta === 'binario') return Buffer.from(await r.arrayBuffer()) as T;
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

/** Igual que apex(), pero devuelve null si APEX responde 404. */
export async function apexOpcional<T>(metodo: 'GET', ruta: string, op: Opciones = {}): Promise<T | null> {
  try {
    return await apex<T>(metodo, ruta, op);
  } catch (e) {
    if (e instanceof ErrorApex && e.status === 404) return null;
    throw e;
  }
}
