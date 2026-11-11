import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { escaparXml } from '../util.js';

let transporte: nodemailer.Transporter | null = null;

function tx(): nodemailer.Transporter {
  if (!config.smtp.host) throw new Error('El correo no está configurado (SMTP_HOST)');
  transporte ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    // Si el servidor no responde, fallar rápido en vez de esperar 2 minutos por invitado.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return transporte;
}

/** Traduce los errores de SMTP a un mensaje con la causa probable. */
function explicarError(e: unknown): Error {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const msg = err?.message ?? String(e);
  if (err?.code === 'EAUTH' || err?.responseCode === 535) {
    return new Error(`El servidor de correo rechazó el usuario o la contraseña (SMTP_USER / SMTP_PASS). ${msg}`);
  }
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ENETUNREACH'].includes(err?.code ?? '') || /timeout/i.test(msg)) {
    return new Error(`No se pudo conectar al servidor de correo ${config.smtp.host}:${config.smtp.port}. ` +
      'Revise SMTP_HOST, SMTP_PORT y SMTP_SECURE. En Railway, el envío por SMTP solo funciona en el plan Pro. ' + msg);
  }
  if (err?.responseCode === 550 || err?.responseCode === 553 || /sender|from/i.test(msg)) {
    return new Error(`El servidor no permite enviar con el remitente "${config.smtp.from}" (SMTP_FROM). ${msg}`);
  }
  return e instanceof Error ? e : new Error(msg);
}

export interface CorreoInvitacion {
  para: string;
  asunto: string;
  mensaje: string;
  arte: { contenido: Buffer; mime: string; nombre: string } | null;
  pase: Buffer;
  codigo: string;
}

/** Envía el correo con las 2 imágenes: visibles en el cuerpo y también adjuntas. */
export async function enviarCorreo(c: CorreoInvitacion): Promise<string> {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <p style="font-size:16px;line-height:1.5;color:#1a1d1b">${escaparXml(c.mensaje).replace(/\n/g, '<br>')}</p>
    ${c.arte ? '<img src="cid:arte" alt="Invitación Fiesta navideña 2026" style="width:100%;border-radius:8px;display:block;margin:16px 0">' : ''}
    <img src="cid:pase" alt="Pase de entrada" style="width:100%;border-radius:8px;display:block;margin:16px 0">
  </div></body></html>`;
  const attachments: nodemailer.SendMailOptions['attachments'] = [
    { filename: 'pase-fiesta-navidena-2026.png', content: c.pase, contentType: 'image/png', cid: 'pase' },
  ];
  if (c.arte) attachments.unshift({ filename: c.arte.nombre, content: c.arte.contenido, contentType: c.arte.mime, cid: 'arte' });
  try {
    const info = await tx().sendMail({ from: config.smtp.from || config.smtp.user, to: c.para, subject: c.asunto, text: c.mensaje, html, attachments });
    return info.messageId;
  } catch (e) {
    throw explicarError(e);
  }
}
