import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import { config } from './config.js';
import { apex } from './apex.js';
import { authRouter } from './routes/auth.js';
import { eventoRouter } from './routes/evento.js';
import { invitadosRouter } from './routes/invitados.js';
import { checkinRouter } from './routes/checkin.js';
import { enviosRouter } from './routes/envios.js';
import { premiosRouter } from './routes/premios.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
if (config.corsOrigin.length) app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/salud', (_req, res) => res.json({ ok: true }));
/** Comprueba la conexión con las APIs de APEX (útil al desplegar). */
app.get('/api/salud/apex', async (_req, res) => {
  try {
    const ev = await apex<{ nombre: string }>('GET', '/evento');
    res.json({ apex: 'ok', evento: ev.nombre });
  } catch (e) {
    res.status(503).json({ apex: 'error', detalle: e instanceof Error ? e.message : String(e) });
  }
});
app.use('/api', authRouter, eventoRouter, invitadosRouter, checkinRouter, enviosRouter, premiosRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// En producción la API también sirve la app web compilada (web/dist).
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('/{*ruta}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Datos inválidos', detalle: err.issues });
  const status = (err as { status?: number }).status ?? 500;
  console.error(err);
  res.status(status).json({ error: err instanceof Error ? err.message : 'Error interno' });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`App lista en el puerto ${config.port}`);
  void comprobarApex().then(async (ok) => {
    if (ok) await adminInicial();
  });
});

async function comprobarApex(): Promise<boolean> {
  try {
    await apex('GET', '/evento');
    console.log('Conexión con APEX OK');
    return true;
  } catch (e) {
    console.error('No se pudo conectar con APEX:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Si no hay administradores, crea el primero con ADMIN_INICIAL_NOMBRE y ADMIN_INICIAL_PIN. */
async function adminInicial() {
  const nombre = process.env.ADMIN_INICIAL_NOMBRE?.trim();
  const pin = process.env.ADMIN_INICIAL_PIN?.trim();
  if (!nombre || !pin) return;
  if (!/^\d{4,6}$/.test(pin)) return console.error('ADMIN_INICIAL_PIN debe tener 4 a 6 dígitos');
  try {
    const admins = await apex<unknown[]>('GET', '/admins');
    if (admins.length) return;
    await apex('POST', '/admins', {
      cuerpo: { nombre, pinHash: await bcrypt.hash(pin, 10), esPrincipal: true, rol: 'PRINCIPAL', color: '#0E3B2E' },
    });
    console.log(`Administrador principal "${nombre}" creado. Ya puede quitar ADMIN_INICIAL_PIN de las variables.`);
  } catch (e) {
    console.error('No se pudo crear el administrador inicial:', e instanceof Error ? e.message : e);
  }
}

for (const s of ['SIGINT', 'SIGTERM'] as const) {
  process.on(s, () => {
    server.close(() => process.exit(0));
  });
}
