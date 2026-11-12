import { Router } from 'express';
import { z } from 'zod';
import { apex } from '../apex.js';
import { requiereSesion } from '../auth.js';
import { obtenerArte, obtenerEvento, obtenerInvitado } from '../services/datos.js';
import { pngPase } from '../services/pase.js';
import { enviarCorreo } from '../services/correo.js';
import { enviarArteWhatsapp, enviarPaseWhatsapp, modoWhatsapp } from '../services/whatsapp360.js';
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

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mensajeError = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Envía el arte + pase QR a cada invitado por el canal elegido.
 * WhatsApp va en dos pasadas: primero el arte a todos los del lote, una pausa, y luego los pases.
 * Así el arte siempre llega antes que el pase.
 */
enviosRouter.post('/envios', requiereSesion, async (req, res) => {
  const p = peticion.parse(req.body);
  const adminId = req.sesion!.adminId;
  const ev = await obtenerEvento();
  const arte = await obtenerArte(ev);
  const plantilla = p.mensaje ?? ev.mensaje ?? '';
  // El código interno (HAS-###) no se muestra al invitado: si el mensaje trae {codigo}, se quita.
  const sinCodigo = plantilla.replace(/\s*\(\s*\{codigo\}\s*\)/g, '').replace(/\{codigo\}/g, '');
  const asunto = p.asunto ?? ev.asuntoCorreo ?? ev.nombre;
  const porWhatsapp = p.canal !== 'CORREO';
  const porCorreo = p.canal !== 'WHATSAPP';
  const resultados: Resultado[] = [];

  // Datos de cada invitado
  const lote = [];
  for (const id of p.invitadoIds) {
    const inv = await obtenerInvitado(id);
    if (!inv) continue;
    lote.push({
      inv,
      pase: pngPase({ nombre: inv.nombre, codigo: inv.codigo, token: inv.token, evento: ev }),
      mensaje: llenarPlantilla(sinCodigo, { nombre: inv.nombre, area: inv.area ?? '', compania: inv.compania ?? '' }),
      idsWa: [] as string[],
      errorWa: null as string | null,
    });
  }

  if (porWhatsapp) {
    // Pasada 1: el arte
    let huboArte = false;
    for (const x of lote) {
      if (!x.inv.whatsapp) continue;
      try {
        const id = await enviarArteWhatsapp(x.inv.whatsapp, x.inv.nombre, x.mensaje, arte);
        if (id) { x.idsWa.push(id); huboArte = true; }
      } catch (e) {
        x.errorWa = mensajeError(e);
      }
    }
    if (huboArte) await esperar(config.whatsapp.pausaSegundos * 1000);

    // Pasada 2: el pase
    for (const x of lote) {
      const { inv } = x;
      if (!inv.whatsapp) {
        resultados.push({ invitadoId: inv.id, nombre: inv.nombre, canal: 'WHATSAPP', estado: 'OMITIDO', detalle: 'Sin número de WhatsApp' });
        continue;
      }
      if (!x.errorWa) {
        try {
          x.idsWa.push(await enviarPaseWhatsapp(inv.whatsapp, inv.nombre, x.pase));
        } catch (e) {
          x.errorWa = (x.idsWa.length ? 'El arte se envió, pero el pase falló: ' : '') + mensajeError(e);
        }
      }
      if (x.errorWa) {
        await registrar(inv.id, 'WHATSAPP', 'ERROR', x.errorWa, x.idsWa.join(',') || null, adminId);
        resultados.push({ invitadoId: inv.id, nombre: inv.nombre, canal: 'WHATSAPP', estado: 'ERROR', detalle: x.errorWa });
      } else {
        await registrar(inv.id, 'WHATSAPP', 'ENVIADO', null, x.idsWa.join(','), adminId);
        resultados.push({ invitadoId: inv.id, nombre: inv.nombre, canal: 'WHATSAPP', estado: 'ENVIADO' });
      }
    }
  }

  if (porCorreo) {
    for (const { inv, pase, mensaje } of lote) {
      if (!inv.correo) {
        resultados.push({ invitadoId: inv.id, nombre: inv.nombre, canal: 'CORREO', estado: 'OMITIDO', detalle: 'Sin correo' });
        continue;
      }
      try {
        const id = await enviarCorreo({ para: inv.correo, asunto, mensaje, arte, pase, codigo: inv.codigo });
        await registrar(inv.id, 'CORREO', 'ENVIADO', null, id, adminId);
        resultados.push({ invitadoId: inv.id, nombre: inv.nombre, canal: 'CORREO', estado: 'ENVIADO' });
      } catch (e) {
        const detalle = mensajeError(e);
        await registrar(inv.id, 'CORREO', 'ERROR', detalle, null, adminId);
        resultados.push({ invitadoId: inv.id, nombre: inv.nombre, canal: 'CORREO', estado: 'ERROR', detalle });
      }
    }
  }

  res.json({ resultados });
});
