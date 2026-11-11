import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { apex } from '../apex.js';
import { requiereSesion } from '../auth.js';
import { listarInvitados, obtenerEvento, obtenerInvitado } from '../services/datos.js';
import { pngPase } from '../services/pase.js';
import { normalizarCorreo, normalizarWhatsapp, nuevoToken } from '../util.js';

export const invitadosRouter = Router();

invitadosRouter.get('/invitados', requiereSesion, async (_req, res) => {
  res.json(await listarInvitados());
});

invitadosRouter.get('/invitados/resumen', requiereSesion, async (_req, res) => {
  res.json(await apex('GET', '/invitados/resumen'));
});

const filaImport = z.object({
  nombre: z.string().trim().min(2).max(150),
  correo: z.string().nullish(),
  whatsapp: z.union([z.string(), z.number()]).nullish(),
  area: z.string().trim().max(100).nullish(),
});

/**
 * Importa (o actualiza por nombre) la lista que la app leyó del Excel.
 * Aquí se limpian correos y teléfonos y se genera el token secreto del QR de cada invitado;
 * APEX lo usa solo si el invitado es nuevo.
 */
invitadosRouter.post('/invitados/importar', requiereSesion, async (req, res) => {
  const { invitados } = z.object({ invitados: z.array(filaImport).min(1).max(5000) }).parse(req.body);
  const limpios = invitados.map((f) => ({
    nombre: f.nombre.replace(/\s+/g, ' '),
    correo: normalizarCorreo(f.correo ?? null),
    whatsapp: normalizarWhatsapp(f.whatsapp == null ? null : String(f.whatsapp)),
    area: f.area || null,
    token: nuevoToken(),
  }));
  // Lotes de 500 para no enviar cuerpos enormes a ORDS.
  let creados = 0;
  let actualizados = 0;
  for (let i = 0; i < limpios.length; i += 500) {
    const r = await apex<{ creados: number; actualizados: number }>('POST', '/invitados/importar', {
      cuerpo: { invitados: limpios.slice(i, i + 500) },
    });
    creados += r.creados;
    actualizados += r.actualizados;
  }
  res.json({ creados, actualizados });
});

/** Datos de un invitado escritos a mano en la app. */
const datosInvitado = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(150),
  correo: z.string().trim().max(150).nullish(),
  whatsapp: z.string().trim().max(30).nullish(),
  area: z.string().trim().max(100).nullish(),
});

/** Limpia correo y WhatsApp; si vienen escritos pero no son válidos, avisa en vez de borrarlos. */
function limpiarContacto(d: { correo?: string | null; whatsapp?: string | null }) {
  const correo = d.correo ? normalizarCorreo(d.correo) : null;
  if (d.correo && !correo) throw Object.assign(new Error('El correo no es válido'), { status: 400 });
  const whatsapp = d.whatsapp ? normalizarWhatsapp(d.whatsapp) : null;
  if (d.whatsapp && (!whatsapp || whatsapp.length < 8)) throw Object.assign(new Error('El número de WhatsApp no es válido'), { status: 400 });
  return { correo, whatsapp };
}

/** Agrega un invitado sin Excel. */
invitadosRouter.post('/invitados', requiereSesion, async (req, res) => {
  const d = datosInvitado.parse(req.body);
  const { correo, whatsapp } = limpiarContacto(d);
  const r = await apex<{ id: number; codigo: string }>('POST', '/invitados', {
    cuerpo: { nombre: d.nombre.replace(/\s+/g, ' '), correo, whatsapp, area: d.area || null, token: nuevoToken() },
  });
  res.status(201).json(r);
});

/** Edita nombre, área, WhatsApp o correo de un invitado. */
invitadosRouter.put('/invitados/:id', requiereSesion, async (req, res) => {
  const d = datosInvitado.parse(req.body);
  const { correo, whatsapp } = limpiarContacto(d);
  await apex('PUT', `/invitados/${Number(req.params.id)}`, {
    cuerpo: { nombre: d.nombre.replace(/\s+/g, ' '), correo, whatsapp, area: d.area || null },
  });
  res.json({ ok: true });
});

invitadosRouter.delete('/invitados/:id', requiereSesion, async (req, res) => {
  await apex('DELETE', `/invitados/${Number(req.params.id)}`);
  res.json({ ok: true });
});

/** Imagen 2: pase QR personalizado. */
invitadosRouter.get('/invitados/:id/pase.png', requiereSesion, async (req, res) => {
  const [inv, ev] = await Promise.all([obtenerInvitado(Number(req.params.id)), obtenerEvento()]);
  if (!inv) return res.status(404).end();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.send(pngPase({ nombre: inv.nombre, codigo: inv.codigo, token: inv.token, evento: ev }));
});

/** Plantilla de Excel para cargar invitados. */
invitadosRouter.get('/invitados/plantilla.xlsx', async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Invitados');
  ws.columns = [
    { header: 'Nombre', key: 'nombre', width: 32 },
    { header: 'Correo', key: 'correo', width: 32 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'Área', key: 'area', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ nombre: 'Nombre Apellido', correo: 'correo@ejemplo.com', whatsapp: '61234567', area: 'Finanzas' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_invitados.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

/** Exporta invitados con su estado de envío y llegada. */
invitadosRouter.get('/invitados/exportar.xlsx', requiereSesion, async (_req, res) => {
  const filas = await listarInvitados();
  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('es-PA', { timeZone: process.env.TZ || 'America/Panama' }) : '';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Llegadas');
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 10 },
    { header: 'Nombre', key: 'nombre', width: 32 },
    { header: 'Área', key: 'area', width: 20 },
    { header: 'Correo', key: 'correo', width: 30 },
    { header: 'WhatsApp', key: 'whatsapp', width: 16 },
    { header: 'Enviado WhatsApp', key: 'waEnviadoEn', width: 22 },
    { header: 'Enviado correo', key: 'correoEnviadoEn', width: 22 },
    { header: 'Llegada', key: 'llegadaEn', width: 22 },
    { header: 'Registrado por', key: 'llegadaAdmin', width: 20 },
    { header: 'Vía', key: 'llegadaVia', width: 8 },
  ];
  ws.getRow(1).font = { bold: true };
  filas.forEach((f) =>
    ws.addRow({ ...f, waEnviadoEn: fecha(f.waEnviadoEn), correoEnviadoEn: fecha(f.correoEnviadoEn), llegadaEn: fecha(f.llegadaEn) }),
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="llegadas_fiesta_2026.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});
