import { Router } from 'express';
import { z } from 'zod';
import { exec } from '../db.js';
import { requiereSesion } from '../auth.js';
import { obtenerArte, obtenerEvento, obtenerInvitado } from '../services/datos.js';
import { pngPase } from '../services/pase.js';
import { enviarCorreo } from '../services/correo.js';
import { enviarWhatsapp } from '../services/whatsapp360.js';
import { llenarPlantilla } from '../util.js';
import { config } from '../config.js';

export const enviosRouter = Router();

/** Qué canales están configurados en el servidor. */
enviosRouter.get('/envios/canales', requiereSesion, (_req, res) => {
  res.json({
    whatsapp: Boolean(config.whatsapp.apiKey && config.whatsapp.templatePase),
    correo: Boolean(config.smtp.host),
  });
});

const peticion = z.object({
  invitadoIds: z.array(z.number().int()).min(1).max(500),
  canal: z.enum(['WHATSAPP', 'CORREO', 'AMBOS']),
  asunto: z.string().max(200).optional(),
  mensaje: z.string().max(2000).optional(),
});

interface Resultado {
  invitadoId: number;
  nombre: string;
  canal: 'WHATSAPP' | 'CORREO';
  estado: 'ENVIADO' | 'ERROR' | 'OMITIDO';
  detalle?: string;
}

async function registrar(invitadoId: number, canal: string, estado: string, detalle: string | null, proveedorId: string | null, adminId: number) {
  await exec(
    `INSERT INTO FN_ENVIO (INVITADO_ID, CANAL, ESTADO, DETALLE, PROVEEDOR_ID, ADMIN_ID) VALUES (:i, :c, :e, :d, :p, :a)`,
    { i: invitadoId, c: canal, e: estado, d: detalle?.slice(0, 1000) ?? null, p: proveedorId?.slice(0, 200) ?? null, a: adminId },
  );
}

/** Envía el arte + pase QR a cada invitado por el canal elegido. */
enviosRouter.post('/envios', requiereSesion, async (req, res) => {
  const p = peticion.parse(req.body);
  const ev = await obtenerEvento();
  const arte = await obtenerArte();
  const plantilla = p.mensaje ?? ev.mensaje ?? '';
  const asunto = p.asunto ?? ev.asuntoCorreo ?? ev.nombre;
  const canales: ('WHATSAPP' | 'CORREO')[] = p.canal === 'AMBOS' ? ['WHATSAPP', 'CORREO'] : [p.canal];
  const resultados: Resultado[] = [];

  for (const id of p.invitadoIds) {
    const inv = await obtenerInvitado(id);
    if (!inv) continue;
    const pase = pngPase({ nombre: inv.nombre, codigo: inv.codigo, token: inv.token, evento: ev });
    const mensaje = llenarPlantilla(plantilla, { nombre: inv.nombre, codigo: inv.codigo, area: inv.area ?? '' });

    for (const canal of canales) {
      const destino = canal === 'WHATSAPP' ? inv.whatsapp : inv.correo;
      if (!destino) {
        resultados.push({ invitadoId: id, nombre: inv.nombre, canal, estado: 'OMITIDO', detalle: canal === 'WHATSAPP' ? 'Sin número de WhatsApp' : 'Sin correo' });
        continue;
      }
      try {
        const proveedorId = canal === 'WHATSAPP'
          ? await enviarWhatsapp({ para: destino, nombre: inv.nombre, codigo: inv.codigo, arte, pase })
          : await enviarCorreo({ para: destino, asunto, mensaje, arte, pase, codigo: inv.codigo });
        await registrar(id, canal, 'ENVIADO', null, proveedorId, req.sesion!.adminId);
        resultados.push({ invitadoId: id, nombre: inv.nombre, canal, estado: 'ENVIADO' });
      } catch (err) {
        const detalle = err instanceof Error ? err.message : String(err);
        await registrar(id, canal, 'ERROR', detalle, null, req.sesion!.adminId);
        resultados.push({ invitadoId: id, nombre: inv.nombre, canal, estado: 'ERROR', detalle });
      }
    }
  }
  res.json({ resultados });
});
