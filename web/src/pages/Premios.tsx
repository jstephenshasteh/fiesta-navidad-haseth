import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Aviso, Cargando, Hoja, Pantalla } from '../components/Comunes';
import { Icono } from '../components/Icono';
import { cargarPremios, lugarDe, marcarAusente, sortearPuesto, type EstadoPremios, type Puesto, type Ronda } from '../premios';

interface Formulario { id: number | null; nombre: string; premios: string[]; minimo: number }

const MAXIMO = 100;

export default function Premios() {
  const nav = useNavigate();
  const [datos, setDatos] = useState<EstadoPremios | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [mismo, setMismo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [ausente, setAusente] = useState<Puesto | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await cargarPremios());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  function nuevaRonda() {
    setMismo('');
    setForm({ id: null, nombre: `Ronda ${(datos?.rondas.length ?? 0) + 1}`, premios: Array(10).fill(''), minimo: 1 });
  }

  function editarRonda(r: Ronda) {
    setMismo('');
    const ocupados = r.puestos.filter((p) => p.ganador).map((p) => p.posicion);
    setForm({ id: r.id, nombre: r.nombre, premios: r.puestos.map((p) => p.premio ?? ''), minimo: Math.max(1, ...ocupados) });
  }

  function cambiarCantidad(n: number) {
    if (!form) return;
    const c = Math.min(MAXIMO, Math.max(form.minimo, Math.round(n) || form.minimo));
    const premios = form.premios.slice(0, c);
    while (premios.length < c) premios.push(mismo.trim());
    setForm({ ...form, premios });
  }

  async function guardarRonda() {
    if (!form) return;
    setGuardando(true);
    const cuerpo = { nombre: form.nombre.trim(), puestos: form.premios.map((p) => ({ premio: p.trim() || null })) };
    try {
      if (form.id) await api(`/api/premios/rondas/${form.id}`, { method: 'PUT', body: cuerpo });
      else await api('/api/premios/rondas', { body: cuerpo });
      setOk(form.id ? 'Ronda actualizada.' : `${cuerpo.nombre || 'La ronda'} está lista para sortear.`);
      setForm(null);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrarRonda() {
    if (!form?.id) return;
    const r = datos?.rondas.find((x) => x.id === form.id);
    const conGanador = r?.puestos.filter((p) => p.ganador).length ?? 0;
    const aviso = conGanador
      ? `¿Borrar "${form.nombre}"? Sus ${conGanador} ganadores se borran y vuelven a participar.`
      : `¿Borrar "${form.nombre}"?`;
    if (!confirm(aviso)) return;
    setGuardando(true);
    try {
      await api(`/api/premios/rondas/${form.id}`, { method: 'DELETE' });
      setForm(null);
      setOk('Ronda borrada.');
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function sortear(p: Puesto) {
    setOcupado(p.id);
    try {
      const r = await sortearPuesto(p.id);
      setOk(`Puesto #${r.posicion}: ${r.ganador.nombre}`);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarAusente(resortear: boolean) {
    if (!ausente) return;
    const p = ausente;
    setAusente(null);
    setOcupado(p.id);
    try {
      await marcarAusente(p.id);
      if (resortear) {
        const r = await sortearPuesto(p.id);
        setOk(`${p.ganador?.nombre} quedó ausente. Nuevo ganador del puesto #${r.posicion}: ${r.ganador.nombre}`);
      } else {
        setOk(`${p.ganador?.nombre} quedó ausente. El puesto #${p.posicion} quedó libre.`);
      }
      await cargar();
    } catch (e) {
      setError((e as Error).message);
      await cargar();
    } finally {
      setOcupado(null);
    }
  }

  const rondas = [...(datos?.rondas ?? [])].reverse();

  return (
    <Pantalla>
      <header className="cabecera fila-entre">
        <h1>Premios</h1>
        <button type="button" className="btn-pildora" onClick={nuevaRonda}><Icono n="mas" size={18} /> Nueva ronda</button>
      </header>

      <Aviso texto={error} />
      <Aviso texto={ok} tipo="ok" />

      <div className="resumen-premios">
        <div className="caja-dato"><strong>{datos ? datos.llegaron : '…'}</strong><span>Llegaron</span></div>
        <div className="caja-dato destacada"><strong>{datos ? datos.elegibles : '…'}</strong><span>Pueden ganar</span></div>
        <div className="caja-dato"><strong>{datos ? datos.ganadores : '…'}</strong><span>Ya ganaron</span></div>
      </div>
      <p className="tenue chico">Solo participan los invitados que llegaron. Quien gana en una ronda (o se marca ausente) ya no vuelve a participar.</p>

      {!datos && !error && <Cargando texto="Cargando premios…" />}
      {datos && rondas.length === 0 && (
        <div className="tarjeta relleno centro">
          <p className="tenue">Aún no hay rondas. Crea la primera con sus premios y luego ábrela en el proyector para sortear.</p>
          <button type="button" className="btn-primario" onClick={nuevaRonda}>Crear la primera ronda</button>
        </div>
      )}

      {rondas.map((r) => {
        const hechos = r.puestos.filter((p) => p.ganador).length;
        return (
          <section key={r.id} className="tarjeta ronda" aria-label={r.nombre}>
            <div className="ronda-cabecera">
              <span className="fila-texto">
                <strong className="grande">{r.nombre}</strong>
                <span className="tenue chico">{hechos} de {r.puestos.length} sorteados</span>
              </span>
              <div className="fila-gap envolver">
                <button type="button" className="btn-texto" onClick={() => editarRonda(r)}>Editar</button>
                <button type="button" className="btn-pildora" onClick={() => nav(`/proyector/${r.id}`)}>
                  <Icono n="proyector" size={18} /> {hechos === r.puestos.length ? 'Ver en proyector' : 'Sortear en proyector'}
                </button>
              </div>
            </div>
            {r.puestos.map((p) => (
              <div key={p.id} className={'fila puesto' + (p.ganador ? ' con-ganador' : '')}>
                <span className="numero-puesto">#{p.posicion}</span>
                <span className="fila-texto">
                  <span className="tenue chico">{p.premio || 'Premio sin nombre'}</span>
                  {p.ganador
                    ? <strong>{p.ganador.nombre}<span className="tenue chico normal">{lugarDe(p.ganador) ? ` · ${lugarDe(p.ganador)}` : ''}</span></strong>
                    : <span className="tenue">Por sortear</span>}
                  {p.ausentes.length > 0 && <span className="ambar chico">Ausente: {p.ausentes.join(', ')}</span>}
                </span>
                {ocupado === p.id ? <span className="spinner" aria-label="Procesando" /> : p.ganador ? (
                  <button type="button" className="btn-texto" onClick={() => setAusente(p)}>No está</button>
                ) : (
                  <button type="button" className="btn-texto" disabled={!datos?.elegibles || ocupado !== null} onClick={() => sortear(p)}>Sortear aquí</button>
                )}
              </div>
            ))}
          </section>
        );
      })}

      <Hoja abierta={!!form} alCerrar={() => !guardando && setForm(null)} titulo={form?.id ? 'Editar ronda' : 'Nueva ronda'} alta>
        {form && (
          <form className="form-invitado" onSubmit={(e) => { e.preventDefault(); void guardarRonda(); }}>
            <label className="campo">Nombre de la ronda
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} maxLength={120} />
            </label>
            <div className="campo">
              Cantidad de ganadores
              <div className="contador">
                <button type="button" aria-label="Uno menos" disabled={form.premios.length <= form.minimo} onClick={() => cambiarCantidad(form.premios.length - 1)}>−</button>
                <input type="number" inputMode="numeric" min={form.minimo} max={MAXIMO} value={form.premios.length}
                  onChange={(e) => cambiarCantidad(Number(e.target.value))} aria-label="Cantidad de ganadores" />
                <button type="button" aria-label="Uno más" disabled={form.premios.length >= MAXIMO} onClick={() => cambiarCantidad(form.premios.length + 1)}>+</button>
              </div>
              {form.minimo > 1 && <small>No se puede bajar de {form.minimo}: esos puestos ya tienen ganador.</small>}
            </div>
            <div className="campo">
              Mismo premio para todos (opcional)
              <div className="fila-gap">
                <input className="crece" value={mismo} onChange={(e) => setMismo(e.target.value)} placeholder="p. ej. Bono de $50" />
                <button type="button" className="btn-pildora gris" disabled={!mismo.trim()}
                  onClick={() => setForm({ ...form, premios: form.premios.map(() => mismo.trim()) })}>Aplicar</button>
              </div>
            </div>
            <span className="rotulo">Premio de cada puesto</span>
            <div className="lista-premios">
              {form.premios.map((p, k) => (
                <label key={k} className="premio-puesto">
                  <span className="numero-puesto">#{k + 1}</span>
                  <input value={p} placeholder={`Premio del puesto ${k + 1}`} maxLength={200}
                    onChange={(e) => setForm({ ...form, premios: form.premios.map((x, j) => (j === k ? e.target.value : x)) })} />
                </label>
              ))}
            </div>
            <button type="submit" className="btn-primario ancho" disabled={guardando}>
              {guardando ? 'Guardando…' : form.id ? 'Guardar cambios' : `Crear ronda de ${form.premios.length}`}
            </button>
            {form.id && <button type="button" className="btn-texto rojo" disabled={guardando} onClick={borrarRonda}>Borrar ronda</button>}
          </form>
        )}
      </Hoja>

      <Hoja abierta={!!ausente} alCerrar={() => setAusente(null)} titulo="¿El ganador no está?">
        {ausente?.ganador && (
          <>
            <p className="grande">
              <strong>{ausente.ganador.nombre}</strong> quedará como ausente en el puesto #{ausente.posicion}
              {ausente.premio ? ` (${ausente.premio})` : ''} y ya no participará en ninguna ronda.
            </p>
            <button type="button" className="btn-primario ancho" disabled={!datos?.elegibles} onClick={() => confirmarAusente(true)}>Marcar ausente y volver a sortear</button>
            <button type="button" className="btn-pildora gris ancho" onClick={() => confirmarAusente(false)}>Solo marcar ausente (dejar el puesto libre)</button>
          </>
        )}
      </Hoja>
    </Pantalla>
  );
}
