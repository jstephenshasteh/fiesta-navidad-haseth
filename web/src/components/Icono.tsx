const RUTAS = {
  escanear: 'M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h10',
  invitados: 'M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2',
  enviar: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  ajustes: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM17 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  buscar: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  alerta: 'M12 6v8M12 18v.01',
  subir: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  bajar: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  atras: 'M15 4l-8 8 8 8',
  adelante: 'M9 4l8 8-8 8',
  linterna: 'M13 2L5 14h6l-1 8 8-12h-6z',
  camara: 'M4 8h3l2-3h6l2 3h3v11H4zM9.5 13.5a2.5 2.5 0 0 0 4.6 1.3M14.5 12.5a2.5 2.5 0 0 0-4.6-1.3',
  candado: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4',
  mas: 'M12 5v14M5 12h14',
  regalo: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-1.5-3-5-3.5-5-1.2C7 7 9 7 12 7zM12 7c1.5-3 5-3.5 5-1.2C17 7 15 7 12 7z',
  proyector: 'M3 5h18v11H3zM8 21l4-5 4 5M12 2v3',
  completa: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3',
} as const;

export type NombreIcono = keyof typeof RUTAS;

export function Icono({ n, size = 22, grosor = 2 }: { n: NombreIcono; size?: number; grosor?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round">
      <path d={RUTAS[n]} />
    </svg>
  );
}
