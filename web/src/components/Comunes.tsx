import { useEffect, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { esGestion, miRol } from '../api';
import { Icono, type NombreIcono } from './Icono';

/** Pestañas; las marcadas "gestion" no las ve el perfil Host. */
const TABS: { a: string; n: NombreIcono; t: string; gestion?: boolean }[] = [
  { a: '/escanear', n: 'escanear', t: 'Escanear' },
  { a: '/invitados', n: 'invitados', t: 'Invitados', gestion: true },
  { a: '/enviar', n: 'enviar', t: 'Enviar', gestion: true },
  { a: '/premios', n: 'regalo', t: 'Premios', gestion: true },
  { a: '/ajustes', n: 'ajustes', t: 'Ajustes' },
];

/** Pantalla con barra de pestañas inferior. */
export function Pantalla({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  const tabs = TABS.filter((t) => !t.gestion || esGestion(miRol()));
  return (
    <div className="pantalla">
      <main className="contenido">{children}</main>
      {extra}
      <nav className="tabbar" aria-label="Secciones" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => (
          <NavLink key={tab.a} to={tab.a} className={({ isActive }) => 'tab' + (isActive ? ' activa' : '')}>
            <Icono n={tab.n} size={26} />
            {tab.t}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Hoja que sube desde abajo. */
export function Hoja({ abierta, alCerrar, titulo, children, alta }: {
  abierta: boolean;
  alCerrar: () => void;
  titulo?: string;
  children: ReactNode;
  alta?: boolean;
}) {
  useEffect(() => {
    if (!abierta) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [abierta, alCerrar]);
  if (!abierta) return null;
  return (
    <div className="velo" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className={'hoja' + (alta ? ' alta' : '')} role="dialog" aria-modal="true" aria-label={titulo}>
        <span className="agarradera" aria-hidden="true" />
        {titulo && (
          <div className="hoja-cabecera">
            <h2>{titulo}</h2>
            <button type="button" className="btn-texto" onClick={alCerrar}>Cerrar</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Segmentado<T extends string>({ opciones, valor, onChange, etiqueta }: {
  opciones: { v: T; t: string }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div className="segmentado" role="radiogroup" aria-label={etiqueta} style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
      {opciones.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} className={valor === o.v ? 'sel' : ''} onClick={() => onChange(o.v)}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

export function Buscador({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="buscador">
      <Icono n="buscar" />
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={valor} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </div>
  );
}

export function Avatar({ texto, color, tam = 46 }: { texto: string; color?: string; tam?: number }) {
  return (
    <span className="avatar" style={{ width: tam, height: tam, fontSize: tam * 0.34, background: color ?? undefined, color: color ? '#fff' : undefined }}>
      {texto}
    </span>
  );
}

/** Indicador de carga (para conexiones lentas). */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

export function Aviso({ texto, tipo = 'error' }: { texto: string | null; tipo?: 'error' | 'ok' }) {
  if (!texto) return null;
  return <div className={'aviso ' + tipo} role={tipo === 'error' ? 'alert' : 'status'}>{texto}</div>;
}
