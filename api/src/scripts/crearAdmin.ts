/**
 * Crea un administrador.
 * Uso:  npm run crear-admin -w api -- "Juan Stephens" 1234 --principal
 */
import bcrypt from 'bcryptjs';
import { closeDb, exec, initDb } from '../db.js';

const [nombre, pin, ...flags] = process.argv.slice(2);
if (!nombre || !pin || !/^\d{4,6}$/.test(pin)) {
  console.error('Uso: npm run crear-admin -w api -- "Nombre Apellido" 1234 [--principal]');
  process.exit(1);
}

await initDb();
await exec(`INSERT INTO FN_ADMIN (NOMBRE, PIN_HASH, ES_PRINCIPAL) VALUES (:n, :h, :p)`, {
  n: nombre,
  h: await bcrypt.hash(pin, 10),
  p: flags.includes('--principal') ? 'S' : 'N',
});
console.log(`Administrador "${nombre}" creado.`);
await closeDb();
