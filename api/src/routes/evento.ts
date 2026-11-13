import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { apex } from '../apex.js';
import { requierePrincipal, requiereSesion } from '../auth.js';
import { obtenerArte, obtenerEvento, olvidarArte, type Evento } from '../services/datos.js';
import { pngPase } from '../services/pase.js';

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

eventoRouter.put('/evento', requierePrincipal, async (req, res) => {
  res.json(await apex<Evento>('PUT', '/evento', { cuerpo: cambios.parse(req.body) }));
});

/**
 * Imagen 1: arte general. Es pública para poder mostrarla con <img> y para usarla como
 * imagen de ejemplo al crear la plantilla de WhatsApp (también responde como /evento/arte.png).
 */
eventoRouter.get(['/evento/arte', '/evento/arte.png', '/evento/arte.jpg'], async (_req, res) => {
  const arte = await obtenerArte();
  if (!arte) return res.status(404).end();
  res.setHeader('Content-Type', arte.mime);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(arte.contenido);
});

/** Pase de ejemplo (datos ficticios, QR sin validez) para la plantilla de WhatsApp del pase. */
eventoRouter.get('/evento/ejemplo-pase.png', async (_req, res) => {
  const ev = await obtenerEvento();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(pngPase({ nombre: 'Juan Stephens', codigo: 'HAS-000', token: 'ejemplo', evento: ev }));
});

eventoRouter.put('/evento/arte', requierePrincipal, subir.single('arte'), async (req, res) => {
  const f = req.file;
  if (!f || !/^image\/(png|jpeg)$/.test(f.mimetype)) return res.status(400).json({ error: 'Suba una imagen PNG o JPG' });
  await apex('PUT', `/evento/arte?nombre=${encodeURIComponent(f.originalname)}`, { binario: { datos: f.buffer, tipo: f.mimetype } });
  olvidarArte();
  res.json({ ok: true });
});
