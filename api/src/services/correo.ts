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
  });
  return transporte;
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
  const info = await tx().sendMail({ from: config.smtp.from, to: c.para, subject: c.asunto, text: c.mensaje, html, attachments });
  return info.messageId;
}
