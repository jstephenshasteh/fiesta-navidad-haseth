import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eventoActivoId, exec } from '../db.js';
import { requierePrincipal, requiereSesion } from '../auth.js';
import { obtenerArte, obtenerEvento } from '../services/datos.js';

export const eventoRouter = Router();
const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

eventoRouter.get('/evento', requiereSesion, async (_req, res) => {
  res.json(await obtenerEvento());
});

const cambios = z.object({
  nombre: z.string().max(150),
  fechaTexto: z.string().max(80),
  dia: z.string().max(5),
  mesCorto: z.string().max(10),
  hora: z.string().max(30),
  lugar: z.string().max(200),
  salon: z.string().max(100),
  vestimenta: z.string().max(80),
  temaPase: z.enum(['rojo', 'verde']),
  asuntoCorreo: z.string().max(200),
  mensaje: z.string().max(2000),
}).partial();

const columnas: Record<string, string> = {
  nombre: 'NOMBRE', fechaTexto: 'FECHA_TEXTO', dia: 'DIA', mesCorto: 'MES_CORTO', hora: 'HORA', lugar: 'LUGAR',
  salon: 'SALON', vestimenta: 'VESTIMENTA', temaPase: 'TEMA_PASE', asuntoCorreo: 'ASUNTO_CORREO', mensaje: 'MENSAJE',
};

eventoRouter.put('/evento', requiereSesion, requierePrincipal, async (req, res) => {
  const d = cambios.parse(req.body);
  const keys = Object.keys(d) as (keyof typeof d)[];
  if (keys.length) {
    const set = keys.map((k) => `${columnas[k]} = :${k}`).join(', ');
    await exec(`UPDATE FN_EVENTO SET ${set} WHERE ID = :id`, { ...d, id: await eventoActivoId() });
  }
  res.json(await obtenerEvento());
});

/** Imagen 1: arte general (pública para poder mostrarla con <img>). */
eventoRouter.get('/evento/arte', async (_req, res) => {
  const arte = await obtenerArte();
  if (!arte) return res.status(404).end();
  res.setHeader('Content-Type', arte.mime);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(arte.contenido);
});

eventoRouter.put('/evento/arte', requiereSesion, requierePrincipal, subir.single('arte'), async (req, res) => {
  const f = req.file;
  if (!f || !/^image\/(png|jpeg)$/.test(f.mimetype)) return res.status(400).json({ error: 'Suba una imagen PNG o JPG' });
  await exec(`UPDATE FN_EVENTO SET ARTE = :arte, ARTE_MIME = :mime, ARTE_NOMBRE = :nombre WHERE ID = :id`, {
    arte: f.buffer, mime: f.mimetype, nombre: f.originalname, id: await eventoActivoId(),
  });
  res.json({ ok: true });
});
