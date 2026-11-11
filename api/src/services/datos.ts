/** Tipos y consultas comunes contra las APIs de APEX. */
import { apex, apexOpcional } from '../apex.js';

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
  temaPase: string | null;
  asuntoCorreo: string | null;
  mensaje: string | null;
  arteNombre: string | null;
  arteMime: string | null;
  arteLargo: number;
  tieneArte: number;
}

export interface Arte {
  contenido: Buffer;
  mime: string;
  nombre: string;
  clave: string;
}

export interface Invitado {
  id: number;
  codigo: string;
  token: string;
  nombre: string;
  correo: string | null;
  whatsapp: string | null;
  area: string | null;
}

export interface FilaInvitado {
  id: number;
  codigo: string;
  nombre: string;
  correo: string | null;
  whatsapp: string | null;
  area: string | null;
  llegadaEn: string | null;
  llegadaVia: string | null;
  llegadaAdmin: string | null;
  waEnviadoEn: string | null;
  correoEnviadoEn: string | null;
}

export function obtenerEvento(): Promise<Evento> {
  return apex<Evento>('GET', '/evento');
}

/** Imagen 1 (arte). Se guarda en memoria y solo se vuelve a descargar si cambia. */
let cacheArte: Arte | null = null;
export async function obtenerArte(ev?: Evento): Promise<Arte | null> {
  const e = ev ?? (await obtenerEvento());
  if (!e.tieneArte) return null;
  const clave = `${e.arteNombre}:${e.arteLargo}`;
  if (cacheArte?.clave === clave) return cacheArte;
  const contenido = await apexOpcional<Buffer>('GET', '/evento/arte', { respuesta: 'binario' });
  if (!contenido) return null;
  cacheArte = { contenido, mime: e.arteMime ?? 'image/png', nombre: e.arteNombre ?? 'invitacion.png', clave };
  return cacheArte;
}

export function olvidarArte() {
  cacheArte = null;
}

export function obtenerInvitado(id: number): Promise<Invitado | null> {
  return apexOpcional<Invitado>('GET', `/invitados/${id}`);
}

export function listarInvitados(): Promise<FilaInvitado[]> {
  return apex<FilaInvitado[]>('GET', '/invitados');
}
