import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { apex } from '../apex.js';
import { requierePrincipal, requiereSesion } from '../auth.js';
import { obtenerArte, obtenerEvento, olvidarArte, type Evento } from '../services/datos.js';

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

eventoRouter.put('/evento', requiereSesion, requierePrincipal, async (req, res) => {
  res.json(await apex<Evento>('PUT', '/evento', { cuerpo: cambios.parse(req.body) }));
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
  await apex('PUT', `/evento/arte?nombre=${encodeURIComponent(f.originalname)}`, { binario: { datos: f.buffer, tipo: f.mimetype } });
  olvidarArte();
  res.json({ ok: true });
});
