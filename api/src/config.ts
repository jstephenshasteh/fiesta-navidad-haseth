import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import tls from 'node:tls';

/**
 * Certificados de confianza para HTTPS.
 * Por defecto Node solo confía en su propia lista; aquí se agregan también los certificados
 * del sistema operativo (en Windows, los mismos que usa Chrome). Así funciona con servidores
 * APEX internos firmados por la autoridad de certificados de la empresa.
 *   APEX_CERTIFICADOS_SISTEMA=false  → no usar los del sistema
 *   APEX_CA_CERT=ruta\\ca.pem         → agregar además un certificado raíz exportado (formato PEM/Base-64)
 */
function configurarCertificados() {
  const usarSistema = process.env.APEX_CERTIFICADOS_SISTEMA !== 'false';
  const archivo = process.env.APEX_CA_CERT?.trim();
  if (!usarSistema && !archivo) return;
  if (typeof tls.setDefaultCACertificates !== 'function') {
    console.warn('Esta versión de Node no permite agregar certificados (actualice a Node 22.19 o superior).');
    return;
  }
  const certs = [...tls.getCACertificates('default')];
  if (usarSistema) certs.push(...tls.getCACertificates('system'));
  if (archivo) {
    try {
      certs.push(fs.readFileSync(archivo, 'utf8'));
    } catch {
      console.warn(`No se pudo leer APEX_CA_CERT (${archivo})`);
    }
  }
  tls.setDefaultCACertificates([...new Set(certs)]);
}
configurarCertificados();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  // Clave interna para recordar que un administrador ya ingresó su PIN. Se genera sola al arrancar
  // (no hay que configurarla). Si el servidor se reinicia, solo hay que volver a poner el PIN.
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  apex: {
    // URL base de ORDS con el alias del esquema, p. ej. https://apex.oracle.com/pls/apex/haseth
    // (si viene con /fiesta/v1 al final, se quita: la app lo agrega sola)
    baseUrl: (process.env.APEX_BASE_URL ?? '').trim().replace(/\/+$/, '').replace(/\/fiesta\/v1$/i, ''),
    clientId: process.env.APEX_CLIENT_ID ?? '',
    clientSecret: process.env.APEX_CLIENT_SECRET ?? '',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
  whatsapp: {
    apiKey: process.env.D360_API_KEY ?? '',
    baseUrl: (process.env.D360_BASE_URL ?? 'https://waba-v2.360dialog.io').replace(/\/$/, ''),
    templateInvitacion: process.env.WA_TEMPLATE_INVITACION ?? '',
    templatePase: process.env.WA_TEMPLATE_PASE ?? '',
    templateLang: process.env.WA_TEMPLATE_LANG ?? 'es',
    codigoPais: process.env.WA_CODIGO_PAIS ?? '507',
    // Segundos de espera entre el arte y el pase, para que lleguen en ese orden
    pausaSegundos: Number(process.env.WA_PAUSA_SEGUNDOS ?? 5),
  },
  fontsDir: process.env.FONTS_DIR ?? '',
};
