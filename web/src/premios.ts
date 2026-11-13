/** Tipos y llamadas del sorteo de premios. */
import { api } from './api';

export interface Ganador {
  id: number;
  nombre: string;
  compania: string | null;
  area: string | null;
  codigo: string | null;
  sorteadoEn: string | null;
}

export interface Puesto {
  id: number;
  posicion: number;
  premio: string | null;
  ganador: Ganador | null;
  ausentes: string[];
}

export interface Ronda {
  id: number;
  nombre: string;
  creadoEn: string;
  puestos: Puesto[];
}

export interface EstadoPremios {
  rondas: Ronda[];
  /** Llegaron y todavía no han ganado ni fueron marcados ausentes. */
  elegibles: number;
  llegaron: number;
  ganadores: number;
}

export interface ResultadoSorteo {
  puestoId: number;
  posicion: number;
  premio: string | null;
  elegibles: number;
  ganador: Omit<Ganador, 'sorteadoEn'>;
}

export const cargarPremios = () => api<EstadoPremios>('/api/premios');
export const cargarParticipantes = () => api<string[]>('/api/premios/participantes');
export const sortearPuesto = (id: number) => api<ResultadoSorteo>(`/api/premios/puestos/${id}/sortear`, { method: 'POST' });
export const marcarAusente = (id: number) => api(`/api/premios/puestos/${id}/ausente`, { method: 'POST' });

/** "Compañía · Área" con lo que haya. */
export const lugarDe = (g: { compania: string | null; area: string | null }) => [g.compania, g.area].filter(Boolean).join(' · ');

/** Siguiente puesto sin ganador (el de número más bajo). */
export const siguienteLibre = (r: Ronda | undefined) => r?.puestos.find((p) => !p.ganador) ?? null;
