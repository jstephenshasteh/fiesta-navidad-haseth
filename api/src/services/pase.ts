import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import { config } from '../config.js';
import { escaparXml, valorQr } from '../util.js';

export interface DatosPase {
  nombre: string;
  codigo: string;
  token: string;
  evento: {
    dia: string | null;
    mesCorto: string | null;
    hora: string | null;
    lugar: string | null;
    salon: string | null;
    vestimenta: string | null;
    temaPase: string | null;
  };
}

const TEMAS: Record<string, { bg: string; accent: string; frame: string }> = {
  rojo: { bg: '#A3141C', accent: '#E3BD62', frame: '#E3BD62' },
  verde: { bg: '#0E3B2E', accent: '#D4AF5A', frame: '#D4AF5A' },
};

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "Montserrat, 'Segoe UI', Arial, sans-serif";

/** Dibuja el QR como un <path> a partir de la matriz de módulos. */
function qrPath(texto: string, x: number, y: number, tam: number): string {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const m = tam / n;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) d += `M${(x + c * m).toFixed(2)} ${(y + r * m).toFixed(2)}h${m.toFixed(2)}v${m.toFixed(2)}h-${m.toFixed(2)}z`;
    }
  }
  return `<path d="${d}" fill="#111111"/>`;
}

/** SVG del pase (1080×1440). */
export function svgPase(p: DatosPase): string {
  const t = TEMAS[p.evento.temaPase ?? 'rojo'] ?? TEMAS.rojo;
  const W = 1080;
  const H = 1440;
  const nombre = escaparXml(p.nombre);
  const tamNombre = p.nombre.length > 28 ? 52 : p.nombre.length > 20 ? 60 : 68;
  const qrTam = 400;
  const qrX = (W - qrTam) / 2;
  const qrY = 560;
  const e = p.evento;
  const lugar = escaparXml(e.lugar ?? '');
  const salon = escaparXml(e.salon ?? '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="16" fill="none" stroke="${t.frame}" stroke-opacity="0.6" stroke-width="3"/>
  <text x="${W / 2}" y="150" text-anchor="middle" font-family="${SANS}" font-size="26" font-weight="700" letter-spacing="6" fill="#FFFFFF">GRUPO DE HASETH</text>
  <text x="${W / 2}" y="250" text-anchor="middle" font-family="${SERIF}" font-size="80" font-weight="700" fill="#FFFFFF">Fiesta <tspan fill="${t.accent}" font-style="italic">navideña</tspan> 2026</text>
  <text x="${W / 2}" y="370" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="700" letter-spacing="6" fill="${t.accent}">PASE DE ENTRADA</text>
  <text x="${W / 2}" y="455" text-anchor="middle" font-family="${SERIF}" font-size="${tamNombre}" font-weight="600" fill="#FFFFFF">${nombre}</text>
  <rect x="${qrX - 30}" y="${qrY - 30}" width="${qrTam + 60}" height="${qrTam + 60}" rx="28" fill="#FFFFFF"/>
  ${qrPath(valorQr(p.token), qrX, qrY, qrTam)}
  <text x="${W / 2}" y="${qrY + qrTam + 90}" text-anchor="middle" font-family="${SANS}" font-size="32" font-weight="700" letter-spacing="5" fill="#FFFFFF">${escaparXml(p.codigo)}</text>
  <text x="${W / 2}" y="${qrY + qrTam + 135}" text-anchor="middle" font-family="${SANS}" font-size="26" fill="#F3DADB">Presenta este código en la entrada</text>
  <line x1="100" y1="1205" x2="${W - 100}" y2="1205" stroke="${t.frame}" stroke-opacity="0.6" stroke-width="2"/>
  <text x="200" y="1278" text-anchor="middle" font-family="${SERIF}" font-size="60" font-weight="700" fill="#FFFFFF">${escaparXml(e.dia ?? '')}</text>
  <text x="200" y="1318" text-anchor="middle" font-family="${SANS}" font-size="26" font-weight="600" letter-spacing="3" fill="#FFFFFF">${escaparXml(e.mesCorto ?? '')}</text>
  <line x1="300" y1="1240" x2="300" y2="1330" stroke="${t.frame}" stroke-opacity="0.6" stroke-width="2"/>
  <text x="${W / 2}" y="1275" text-anchor="middle" font-family="${SANS}" font-size="27" font-weight="600" fill="#FFFFFF">${lugar}</text>
  <text x="${W / 2}" y="1312" text-anchor="middle" font-family="${SANS}" font-size="27" font-weight="600" fill="#FFFFFF">${salon}</text>
  <line x1="780" y1="1240" x2="780" y2="1330" stroke="${t.frame}" stroke-opacity="0.6" stroke-width="2"/>
  <text x="880" y="1268" text-anchor="middle" font-family="${SANS}" font-size="22" font-weight="600" fill="#F3DADB">Hora</text>
  <text x="880" y="1310" text-anchor="middle" font-family="${SANS}" font-size="32" font-weight="700" fill="#FFFFFF">${escaparXml(e.hora ?? '')}</text>
  <text x="${W / 2}" y="1385" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="600" letter-spacing="3" fill="#FFFFFF">VESTIMENTA: ${escaparXml((e.vestimenta ?? '').toUpperCase())}</text>
</svg>`;
}

function fuentes(): string[] {
  const dir = path.resolve(config.fontsDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => path.join(dir, f));
}

/** PNG del pase listo para enviar. */
export function pngPase(p: DatosPase): Buffer {
  const r = new Resvg(svgPase(p), {
    font: { loadSystemFonts: true, fontFiles: fuentes(), defaultFontFamily: 'Arial' },
    fitTo: { mode: 'original' },
  });
  return Buffer.from(r.render().asPng());
}
