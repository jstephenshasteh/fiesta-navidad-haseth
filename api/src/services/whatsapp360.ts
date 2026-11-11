import { config } from '../config.js';

/**
 * Envío por WhatsApp con 360dialog (Cloud API).
 * Los mensajes que inicia la empresa deben ser PLANTILLAS aprobadas por Meta.
 * Se usan dos plantillas con encabezado de tipo IMAGEN:
 *   1) WA_TEMPLATE_INVITACION: imagen = arte, cuerpo {{1}} = nombre
 *   2) WA_TEMPLATE_PASE:       imagen = pase QR, cuerpo {{1}} = nombre
 */

function headers(extra: Record<string, string> = {}): Record<string, string> {
  if (!config.whatsapp.apiKey) throw new Error('WhatsApp no está configurado (D360_API_KEY)');
  return { 'D360-API-KEY': config.whatsapp.apiKey, ...extra };
}

async function leerError(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    return j?.error?.message ?? j?.meta?.developer_message ?? t;
  } catch {
    return t;
  }
}

/** Sube una imagen y devuelve el media id. */
export async function subirMedia(contenido: Buffer, mime: string, nombre: string): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([new Uint8Array(contenido)], { type: mime }), nombre);
  const r = await fetch(`${config.whatsapp.baseUrl}/media`, { method: 'POST', headers: headers(), body: form });
  if (!r.ok) throw new Error(`360dialog (subir imagen): ${await leerError(r)}`);
  const j = (await r.json()) as { id: string };
  return j.id;
}

async function enviarPlantilla(para: string, plantilla: string, imagenId: string, parametros: string[]): Promise<string> {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: para,
    type: 'template',
    template: {
      name: plantilla,
      language: { code: config.whatsapp.templateLang },
      components: [
        { type: 'header', parameters: [{ type: 'image', image: { id: imagenId } }] },
        { type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) },
      ],
    },
  };
  const r = await fetch(`${config.whatsapp.baseUrl}/messages`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`360dialog (${plantilla}): ${await leerError(r)}`);
  const j = (await r.json()) as { messages?: { id: string }[] };
  return j.messages?.[0]?.id ?? '';
}

/**
 * Mensaje normal con imagen (sin plantilla). WhatsApp solo lo entrega si el invitado
 * le escribió al número de la empresa en las últimas 24 horas. Sirve para hacer pruebas
 * mientras Meta aprueba las plantillas.
 */
async function enviarImagen(para: string, imagenId: string, texto: string): Promise<string> {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: para,
    type: 'image',
    image: { id: imagenId, caption: texto.slice(0, 1024) },
  };
  const r = await fetch(`${config.whatsapp.baseUrl}/messages`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`360dialog (imagen): ${await leerError(r)}`);
  const j = (await r.json()) as { messages?: { id: string }[] };
  return j.messages?.[0]?.id ?? '';
}

/** Modo de envío según la configuración: con plantillas (producción) o de prueba (24 h). */
export function modoWhatsapp(): 'plantillas' | 'prueba' | 'sin-configurar' {
  if (!config.whatsapp.apiKey) return 'sin-configurar';
  return config.whatsapp.templatePase ? 'plantillas' : 'prueba';
}

/** El arte se sube una sola vez y se reutiliza (Meta guarda el media ~30 días). */
let arteCache: { clave: string; id: string; at: number } | null = null;

async function idArte(arte: { contenido: Buffer; mime: string; nombre: string; clave: string }): Promise<string> {
  if (!arteCache || arteCache.clave !== arte.clave || Date.now() - arteCache.at > 20 * 86400_000) {
    arteCache = { clave: arte.clave, id: await subirMedia(arte.contenido, arte.mime, arte.nombre), at: Date.now() };
  }
  return arteCache.id;
}

export async function enviarWhatsapp(opts: {
  para: string;
  nombre: string;
  codigo: string;
  mensaje: string;
  arte: { contenido: Buffer; mime: string; nombre: string; clave: string } | null;
  pase: Buffer;
}): Promise<string> {
  const { templateInvitacion, templatePase } = config.whatsapp;
  const ids: string[] = [];
  const paseId = await subirMedia(opts.pase, 'image/png', 'pase-fiesta-navidena-2026.png');

  if (modoWhatsapp() === 'prueba') {
    if (opts.arte) ids.push(await enviarImagen(opts.para, await idArte(opts.arte), opts.mensaje));
    ids.push(await enviarImagen(opts.para, paseId, 'Este es tu pase de entrada personal. Presenta el código QR en la entrada.'));
    return ids.join(',');
  }

  if (opts.arte && templateInvitacion) {
    ids.push(await enviarPlantilla(opts.para, templateInvitacion, await idArte(opts.arte), [opts.nombre]));
  }
  ids.push(await enviarPlantilla(opts.para, templatePase, paseId, [opts.nombre]));
  return ids.join(',');
}
