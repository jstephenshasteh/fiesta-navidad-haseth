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

export function formatoCodigo(prefijo: string, n: number): string {
  return `${prefijo}-${String(n).padStart(3, '0')}`;
}

/** Deja solo dígitos y agrega el código de país a números locales de 8 dígitos. */
export function normalizarWhatsapp(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = String(v).replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 8) return config.whatsapp.codigoPais + d;
  return d;
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
