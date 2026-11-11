import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config.js';
import { closeDb, initDb } from './db.js';
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

await initDb();
const server = app.listen(config.port, () => console.log(`API lista en http://localhost:${config.port}`));

for (const s of ['SIGINT', 'SIGTERM'] as const) {
  process.on(s, () => {
    server.close();
    closeDb().finally(() => process.exit(0));
  });
}
