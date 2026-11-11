import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config.js';
import bcrypt from 'bcryptjs';
import { closeDb, exec, initDb, queryOne, withConn } from './db.js';
import { authRouter } from './routes/auth.js';
import { eventoRouter } from './routes/evento.js';
import { invitadosRouter } from './routes/invitados.js';
import { checkinRouter } from './routes/checkin.js';
import { enviosRouter } from './routes/envios.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
if (config.corsOrigin.length) app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/salud', (_req, res) => res.json({ ok: true }));
/** Comprueba la conexión a Oracle (útil al desplegar). */
app.get('/api/salud/db', async (_req, res) => {
  try {
    await withConn((c) => c.execute('SELECT 1 FROM DUAL'));
    res.json({ oracle: 'ok' });
  } catch (e) {
    res.status(503).json({ oracle: 'error', detalle: e instanceof Error ? e.message : String(e) });
  }
});
app.use('/api', authRouter, eventoRouter, invitadosRouter, checkinRouter, enviosRouter);
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
  console.log(`API lista en el puerto ${config.port}`);
  void initDb().then(adminInicial);
});

/** Si no hay administradores, crea el primero con ADMIN_INICIAL_NOMBRE y ADMIN_INICIAL_PIN. */
async function adminInicial() {
  const nombre = process.env.ADMIN_INICIAL_NOMBRE?.trim();
  const pin = process.env.ADMIN_INICIAL_PIN?.trim();
  if (!nombre || !pin) return;
  if (!/^\d{4,6}$/.test(pin)) return console.error('ADMIN_INICIAL_PIN debe tener 4 a 6 dígitos');
  try {
    const r = await queryOne<{ n: number }>(`SELECT COUNT(*) "n" FROM FN_ADMIN`);
    if (r?.n !== 0) return;
    await exec(`INSERT INTO FN_ADMIN (NOMBRE, PIN_HASH, ES_PRINCIPAL, COLOR) VALUES (:n, :h, 'S', '#0E3B2E')`, {
      n: nombre,
      h: await bcrypt.hash(pin, 10),
    });
    console.log(`Administrador principal "${nombre}" creado. Ya puede quitar ADMIN_INICIAL_PIN de las variables.`);
  } catch (e) {
    console.error('No se pudo crear el administrador inicial:', e instanceof Error ? e.message : e);
  }
}

for (const s of ['SIGINT', 'SIGTERM'] as const) {
  process.on(s, () => {
    server.close();
    closeDb().finally(() => process.exit(0));
  });
}
