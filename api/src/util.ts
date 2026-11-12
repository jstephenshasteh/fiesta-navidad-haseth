import crypto from 'node:crypto';
import { config } from './config.js';

/** Prefijo del contenido del QR para reconocer que es de esta app. */
export const QR_PREFIJO = 'FNH:';

export function nuevoToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

export function valorQr(token: string): string {
  return QR_PREFIJO + token;
}

export function tokenDesdeQr(valor: string): string | null {
  const v = valor.trim();
  if (v.startsWith(QR_PREFIJO)) return v.slice(QR_PREFIJO.length);
  return null;
}

/**
 * Deja solo dígitos y agrega el código de país a celulares locales de 8 dígitos.
 * Devuelve null si no parece un celular (p. ej. teléfonos fijos de 7 dígitos).
 */
export function normalizarWhatsapp(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = String(v).replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 8) return d.startsWith('6') ? config.whatsapp.codigoPais + d : null;
  if (d.length < 10) return null;
  return d;
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'para', 'por', 'con']);

/**
 * Limpia nombres de área o compañía: quita el código numérico del inicio
 * ("0102 - GERENCIA GENERAL" → "Gerencia General") y si viene todo en mayúsculas lo pasa a tipo título.
 */
export function limpiarTexto(v: string | null | undefined): string | null {
  let s = (v ?? '').toString().replace(/\s+/g, ' ').trim();
  s = s.replace(/^\d+\s*[-–.]\s*/, '').trim();
  if (!s) return null;
  if (s === s.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4}/.test(s)) {
    s = s.toLowerCase().split(' ').map((p, i) =>
      i > 0 && MINUSCULAS.has(p) ? p : p.replace(/(^|[-/(])(\p{L})/gu, (_m, a: string, l: string) => a + l.toUpperCase())).join(' ');
  }
  return s.slice(0, 100);
}

export function normalizarCorreo(v: string | null | undefined): string | null {
  const s = (v ?? '').toString().trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export function llenarPlantilla(texto: string, datos: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in datos ? datos[k] : m));
}

export function escaparXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}
