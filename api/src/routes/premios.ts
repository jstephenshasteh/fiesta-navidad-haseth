import { Router } from 'express';
import { z } from 'zod';
import { apex } from '../apex.js';
import { requiereGestion } from '../auth.js';

/**
 * Sorteo de premios.
 * Reglas (las aplica APEX): solo participan los que llegaron, y quien ya ganó
 * (o fue marcado ausente) no vuelve a participar en ninguna ronda.
 */
export const premiosRouter = Router();

interface RondaApex { id: number; nombre: string; creadoEn: string }
interface PuestoApex {
  id: number;
  rondaId: number;
  posicion: number;
  premio: string | null;
  ganadorId: number | null;
  ganadorNombre: string | null;
  ganadorCompania: string | null;
  ganadorArea: string | null;
  ganadorCodigo: string | null;
  sorteadoEn: string | null;
}
interface ListadoApex {
  rondas: RondaApex[];
  puestos: PuestoApex[];
  ausentes: { puestoId: number; nombre: string }[];
  elegibles: number;
  llegaron: number;
  ganadores: number;
}

/** Rondas con sus puestos, el ganador de cada uno y los ausentes. */
premiosRouter.get('/premios', requiereGestion, async (_req, res) => {
  const d = await apex<ListadoApex>('GET', '/premios');
  const rondas = d.rondas.map((r) => ({
    ...r,
    puestos: d.puestos.filter((p) => p.rondaId === r.id).map((p) => ({
      id: p.id,
      posicion: p.posicion,
      premio: p.premio,
      ganador: p.ganadorId
        ? { id: p.ganadorId, nombre: p.ganadorNombre!, compania: p.ganadorCompania, area: p.ganadorArea, codigo: p.ganadorCodigo, sorteadoEn: p.sorteadoEn }
        : null,
      ausentes: d.ausentes.filter((a) => a.puestoId === p.id).map((a) => a.nombre),
    })),
  }));
  res.json({ rondas, elegibles: d.elegibles, llegaron: d.llegaron, ganadores: d.ganadores });
});

/** Nombres que aún pueden ganar (para la animación del proyector). */
premiosRouter.get('/premios/participantes', requiereGestion, async (_req, res) => {
  res.json(await apex<string[]>('GET', '/premios/participantes'));
});

const datosRonda = z.object({
  nombre: z.string().trim().max(120).optional(),
  puestos: z.array(z.object({ premio: z.string().trim().max(200).nullish() })).min(1, 'La ronda necesita al menos 1 puesto').max(100),
});

premiosRouter.post('/premios/rondas', requiereGestion, async (req, res) => {
  const d = datosRonda.parse(req.body);
  res.status(201).json(await apex<{ id: number }>('POST', '/premios/rondas', { cuerpo: d }));
});

premiosRouter.put('/premios/rondas/:id', requiereGestion, async (req, res) => {
  const d = datosRonda.partial().parse(req.body);
  await apex('PUT', `/premios/rondas/${Number(req.params.id)}`, { cuerpo: d });
  res.json({ ok: true });
});

premiosRouter.delete('/premios/rondas/:id', requiereGestion, async (req, res) => {
  await apex('DELETE', `/premios/rondas/${Number(req.params.id)}`);
  res.json({ ok: true });
});

/** Sortea el ganador de un puesto. */
premiosRouter.post('/premios/puestos/:id/sortear', requiereGestion, async (req, res) => {
  res.json(await apex('POST', `/premios/puestos/${Number(req.params.id)}/sortear`, { cuerpo: { adminId: req.sesion!.adminId } }));
});

/** El ganador no está: queda ausente y el puesto se libera (re-sorteo opcional). */
premiosRouter.post('/premios/puestos/:id/ausente', requiereGestion, async (req, res) => {
  await apex('POST', `/premios/puestos/${Number(req.params.id)}/ausente`);
  res.json({ ok: true });
});
