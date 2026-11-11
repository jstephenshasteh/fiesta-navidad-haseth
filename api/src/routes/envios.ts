import { Router } from 'express';
import { z } from 'zod';
import { apex } from '../apex.js';
import { requiereSesion } from '../auth.js';
import { obtenerArte, obtenerEvento, obtenerInvitado } from '../services/datos.js';
import { pngPase } from '../services/pase.js';
import { enviarCorreo } from '../services/correo.js';
import { enviarWhatsapp, modoWhatsapp } from '../services/whatsapp360.js';
import { llenarPlantilla } from '../util.js';
import { config } from '../config.js';

export const enviosRouter = Router();

/** Qué canales están configurados en el servidor. */
enviosRouter.get('/envios/canales', requiereSesion, (_req, res) => {
  const modo = modoWhatsapp();
  res.json({
    whatsapp: modo !== 'sin-configurar',
    whatsappModo: modo, // 'plantillas' | 'prueba' | 'sin-configurar'
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

/** Guarda el resultado en APEX (FN_ENVIO). Si falla el registro, no se pierde el envío ya hecho. */
async function registrar(invitadoId: number, canal: string, estado: string, detalle: string | null, proveedorId: string | null, adminId: number) {
  try {
    await apex('POST', '/envios', {
      cuerpo: { invitadoId, canal, estado, detalle: detalle?.slice(0, 1000) ?? null, proveedorId: proveedorId?.slice(0, 200) ?? null, adminId },
    });
  } catch (e) {
    console.error(`No se pudo registrar el envío del invitado ${invitadoId} en APEX:`, e instanceof Error ? e.message : e);
  }
}

/** Envía el arte + pase QR a cada invitado por el canal elegido. */
enviosRouter.post('/envios', requiereSesion, async (req, res) => {
  const p = peticion.parse(req.body);
  const ev = await obtenerEvento();
  const arte = await obtenerArte(ev);
  const plantilla = p.mensaje ?? ev.mensaje ?? '';
  const asunto = p.asunto ?? ev.asuntoCorreo ?? ev.nombre;
  const canales: ('WHATSAPP' | 'CORREO')[] = p.canal === 'AMBOS' ? ['WHATSAPP', 'CORREO'] : [p.canal];
  const resultados: Resultado[] = [];

  for (const id of p.invitadoIds) {
    const inv = await obtenerInvitado(id);
    if (!inv) continue;
    const pase = pngPase({ nombre: inv.nombre, codigo: inv.codigo, token: inv.token, evento: ev });
    // El código interno (HAS-###) no se muestra al invitado: si el mensaje trae {codigo}, se quita.
    const sinCodigo = plantilla.replace(/\s*\(\s*\{codigo\}\s*\)/g, '').replace(/\{codigo\}/g, '');
    const mensaje = llenarPlantilla(sinCodigo, { nombre: inv.nombre, area: inv.area ?? '' });

    for (const canal of canales) {
      const destino = canal === 'WHATSAPP' ? inv.whatsapp : inv.correo;
      if (!destino) {
        resultados.push({ invitadoId: id, nombre: inv.nombre, canal, estado: 'OMITIDO', detalle: canal === 'WHATSAPP' ? 'Sin número de WhatsApp' : 'Sin correo' });
        continue;
      }
      try {
        const proveedorId = canal === 'WHATSAPP'
          ? await enviarWhatsapp({ para: destino, nombre: inv.nombre, codigo: inv.codigo, mensaje, arte, pase })
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
