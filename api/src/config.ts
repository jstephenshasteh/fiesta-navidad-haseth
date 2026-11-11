import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  jwtSecret: req('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret'),
  oracle: {
    user: process.env.ORACLE_USER ?? '',
    password: process.env.ORACLE_PASSWORD ?? '',
    connectString: process.env.ORACLE_CONNECT_STRING ?? '',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
  whatsapp: {
    apiKey: process.env.D360_API_KEY ?? '',
    baseUrl: (process.env.D360_BASE_URL ?? 'https://waba-v2.360dialog.io').replace(/\/$/, ''),
    templateInvitacion: process.env.WA_TEMPLATE_INVITACION ?? '',
    templatePase: process.env.WA_TEMPLATE_PASE ?? '',
    templateLang: process.env.WA_TEMPLATE_LANG ?? 'es',
    codigoPais: process.env.WA_CODIGO_PAIS ?? '507',
  },
  fontsDir: process.env.FONTS_DIR ?? './fonts',
};
