/**
 * Crea un administrador mediante la API de APEX (usa las variables de api/.env).
 * Uso:  npm run crear-admin -w api -- "Juan Stephens" 1234 --principal
 */
import bcrypt from 'bcryptjs';
import { apex } from '../apex.js';

const [nombre, pin, ...flags] = process.argv.slice(2);
if (!nombre || !pin || !/^\d{4,6}$/.test(pin)) {
  console.error('Uso: npm run crear-admin -w api -- "Nombre Apellido" 1234 [--principal]');
  process.exit(1);
}

await apex('POST', '/admins', {
  cuerpo: { nombre, pinHash: await bcrypt.hash(pin, 10), esPrincipal: flags.includes('--principal'), color: '#146B47' },
});
console.log(`Administrador "${nombre}" creado.`);
