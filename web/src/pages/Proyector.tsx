import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icono } from '../components/Icono';
import {
  cargarParticipantes, cargarPremios, lugarDe, marcarAusente, siguienteLibre, sortearPuesto,
  type EstadoPremios, type Puesto, type ResultadoSorteo,
} from '../premios';

type Fase = 'listo' | 'girando' | 'ganador';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const COLORES = ['#D4AF5A', '#F3E2B3', '#C0392B', '#FFFFFF', '#2E8B57'];

/** Pantalla para el proyector: sorteo puesto por puesto con animación. */
export default function Proyector() {
  const nav = useNavigate();
  const { id } = useParams();
  const rondaId = Number(id);
  const [datos, setDatos] = useState<EstadoPremios | null>(null);
  const [nombres, setNombres] = useState<string[]>([]);
  const [elegido, setElegido] = useState<number | null>(null);
  const [fase, setFase] = useState<Fase>('listo');
  const [pantallaNombre, setPantallaNombre] = useState('');
  const [resultado, setResultado] = useState<ResultadoSorteo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<Puesto | null>(null);
  const girando = useRef(false);
  const nombresRef = useRef<string[]>([]);
  useEffect(() => { nombresRef.current = nombres; }, [nombres]);
  const reducido = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);

  const cargar = useCallback(async () => {
    try {
      const [d, n] = await Promise.all([cargarPremios(), cargarParticipantes()]);
      setDatos(d);
      setNombres(n);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const ronda = datos?.rondas.find((r) => r.id === rondaId);
  const actual = ronda?.puestos.find((p) => p.id === elegido) ?? siguienteLibre(ronda);
  const completa = !!ronda && ronda.puestos.every((p) => p.ganador);

  const sortear = useCallback(async (puesto: Puesto) => {
    if (girando.current) return;
    girando.current = true;
    setError(null);
    setResultado(null);
    setElegido(puesto.id);
    setFase('girando');
    const lista = nombresRef.current.length ? nombresRef.current : ['…'];
    let activo = true;
    // Los nombres pasan rápido mientras APEX elige al ganador (mínimo ~3 s de suspenso).
    const ruleta = (async () => {
      while (activo) {
        setPantallaNombre(lista[Math.floor(Math.random() * lista.length)]);
        await espera(70);
      }
    })();
    try {
      const [r] = await Promise.all([sortearPuesto(puesto.id), espera(reducido ? 600 : 3000)]);
      activo = false;
      await ruleta;
      // Frenado: cada nombre dura un poco más hasta llegar al ganador.
      if (!reducido) {
        for (const ms of [110, 150, 200, 260, 340, 440, 560]) {
          setPantallaNombre(lista[Math.floor(Math.random() * lista.length)]);
          await espera(ms);
        }
      }
      setPantallaNombre(r.ganador.nombre);
      setResultado(r);
      setFase('ganador');
      setNombres((n) => n.filter((x) => x !== r.ganador.nombre));
      setDatos(await cargarPremios());
    } catch (e) {
      activo = false;
      await ruleta;
      setFase('listo');
      setError((e as Error).message);
      void cargar();
    } finally {
      girando.current = false;
    }
  }, [reducido, cargar]);

  /** Botón principal: sortear el puesto actual o pasar al siguiente. */
  const accionPrincipal = useCallback(() => {
    if (girando.current || !ronda) return;
    if (fase === 'ganador') {
      setFase('listo');
      setResultado(null);
      setElegido(siguienteLibre(ronda)?.id ?? null);
      return;
    }
    if (actual && !actual.ganador) void sortear(actual);
  }, [fase, ronda, actual, sortear]);

  // Espacio o Enter sortean (útil con un control de presentaciones).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (menu || (e.target as HTMLElement)?.tagName === 'BUTTON') return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        accionPrincipal();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [accionPrincipal, menu]);

  async function ausente(resortear: boolean) {
    if (!menu) return;
    const p = menu;
    setMenu(null);
    try {
      await marcarAusente(p.id);
      nombresRef.current = nombresRef.current.filter((x) => x !== p.ganador?.nombre);
      setNombres(nombresRef.current);
      const d = await cargarPremios();
      setDatos(d);
      setResultado(null);
      setFase('listo');
      setElegido(p.id);
      if (resortear) {
        const libre = d.rondas.find((r) => r.id === rondaId)?.puestos.find((x) => x.id === p.id);
        if (libre) void sortear(libre);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function pantallaCompleta() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  const confeti = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    dur: 2.6 + Math.random() * 1.8,
    color: COLORES[i % COLORES.length],
    giro: Math.random() * 360,
  })), [resultado?.puestoId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!datos && !error) return <div className="proyector"><p className="proyector-centro">Cargando…</p></div>;
  if (datos && !ronda) {
    return (
      <div className="proyector">
        <div className="proyector-centro">
          <p>Esta ronda no existe o fue borrada.</p>
          <button type="button" className="btn-dorado" onClick={() => nav('/premios')}>Volver a Premios</button>
        </div>
      </div>
    );
  }

  const muestraPuesto = fase === 'ganador' && resultado ? ronda?.puestos.find((p) => p.id === resultado.puestoId) ?? actual : actual;

  return (
    <div className="proyector">
      <header className="proyector-barra">
        <div>
          <span className="proyector-evento">Fiesta navideña 2026 · Grupo De Haseth</span>
          <h1>{ronda?.nombre}</h1>
        </div>
        <div className="proyector-controles">
          <span className="proyector-dato"><strong>{datos?.elegibles ?? '…'}</strong> participan</span>
          <button type="button" onClick={pantallaCompleta} aria-label="Pantalla completa"><Icono n="completa" size={20} /></button>
          <button type="button" onClick={() => nav('/premios')} aria-label="Salir del proyector"><Icono n="x" size={20} /></button>
        </div>
      </header>

      <main className={'escenario fase-' + fase}>
        {fase === 'ganador' && !reducido && (
          <div className="confeti" aria-hidden="true">
            {confeti.map((c, i) => (
              <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, transform: `rotate(${c.giro}deg)` }} />
            ))}
          </div>
        )}
        {completa && fase !== 'ganador' ? (
          <div className="escenario-final">
            <span className="escenario-puesto">¡Ronda completa!</span>
            <p className="escenario-premio">Felicidades a todos los ganadores</p>
          </div>
        ) : muestraPuesto ? (
          <>
            <span className="escenario-puesto">Puesto #{muestraPuesto.posicion}</span>
            <span className="escenario-premio">{muestraPuesto.premio || 'Premio sorpresa'}</span>
            <div className="escenario-nombre" aria-live="polite">
              {fase === 'listo' ? <span className="escenario-pregunta">¿Quién será?</span> : pantallaNombre}
            </div>
            <span className="escenario-lugar">{fase === 'ganador' && resultado ? lugarDe(resultado.ganador) : ' '}</span>
          </>
        ) : null}

        {error && <p className="proyector-error" role="alert">{error}</p>}

        <div className="escenario-acciones">
          {fase === 'ganador' ? (
            siguienteLibre(ronda) ? (
              <button type="button" className="btn-escenario" onClick={accionPrincipal}>Siguiente: puesto #{siguienteLibre(ronda)!.posicion}</button>
            ) : (
              <button type="button" className="btn-escenario" onClick={accionPrincipal}>Ver todos los ganadores</button>
            )
          ) : !completa && actual ? (
            <button type="button" className="btn-escenario" disabled={fase === 'girando' || !datos?.elegibles} onClick={accionPrincipal}>
              {fase === 'girando' ? 'Sorteando…' : datos?.elegibles ? `Sortear puesto #${actual.posicion}` : 'No quedan participantes'}
            </button>
          ) : null}
        </div>
      </main>

      <section className="tablero" aria-label="Puestos de la ronda">
        {ronda?.puestos.map((p) => {
          const esActual = p.id === muestraPuesto?.id && !completa;
          const revelado = p.ganador && !(fase === 'girando' && p.id === elegido);
          return (
            <button key={p.id} type="button" disabled={fase === 'girando'}
              className={'casilla-puesto' + (revelado ? ' llena' : '') + (esActual ? ' actual' : '')}
              onClick={() => { if (p.ganador) setMenu(p); else { setElegido(p.id); setFase('listo'); setResultado(null); } }}
              aria-label={p.ganador ? `Puesto ${p.posicion}: ${p.ganador.nombre}. Opciones` : `Elegir puesto ${p.posicion}`}>
              <span className="casilla-num">#{p.posicion}</span>
              <span className="casilla-texto">
                <span className="casilla-premio">{p.premio || 'Premio sorpresa'}</span>
                <strong>{revelado ? p.ganador!.nombre : '—'}</strong>
              </span>
            </button>
          );
        })}
      </section>

      {menu?.ganador && (
        <div className="proyector-velo" onClick={(e) => e.target === e.currentTarget && setMenu(null)}>
          <div className="proyector-dialogo" role="dialog" aria-modal="true" aria-label="Ganador ausente">
            <h2>¿{menu.ganador.nombre} no está?</h2>
            <p>Quedará como ausente en el puesto #{menu.posicion} y ya no participará en ninguna ronda.</p>
            <button type="button" className="btn-escenario" disabled={!datos?.elegibles} onClick={() => ausente(true)}>Marcar ausente y volver a sortear</button>
            <button type="button" className="btn-escenario secundario" onClick={() => ausente(false)}>Solo marcar ausente</button>
            <button type="button" className="btn-escenario texto" onClick={() => setMenu(null)}>Cancelar, sí está</button>
          </div>
        </div>
      )}
    </div>
  );
}
