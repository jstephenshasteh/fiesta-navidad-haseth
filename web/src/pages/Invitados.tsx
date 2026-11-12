import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import { api, descargar, hora, iniciales, normalizar, urlApi, type Invitado } from '../api';
import { Aviso, Avatar, Buscador, Cargando, Hoja, Pantalla, Segmentado } from '../components/Comunes';
import { Icono } from '../components/Icono';

type Filtro = 'todos' | 'pendientes' | 'enviadas' | 'llegaron';
type Campo = 'nombre' | 'correo' | 'whatsapp' | 'compania' | 'area';
interface FilaExcel { nombre: string; correo: string | null; whatsapp: string | null; compania: string | null; area: string | null }
interface Ficha { id: number | null; nombre: string; compania: string; area: string; whatsapp: string; correo: string }
const FICHA_VACIA: Ficha = { id: null, nombre: '', compania: '', area: '', whatsapp: '', correo: '' };
/** Resumen de cada hoja leída del Excel. */
interface HojaLeida { hoja: string; filas: number; columnas: string[]; compania: string | null; error?: string }
const NOMBRE_FILTRO: Record<'pendientes' | 'enviadas' | 'llegaron', string> = { pendientes: 'pendientes', enviadas: 'enviadas', llegaron: 'llegadas' };

/** Reconoce las columnas del Excel por su encabezado. */
const SINONIMOS: Record<Campo, string[]> = {
  nombre: ['nombre', 'nombre completo', 'invitado', 'colaborador', 'nombres'],
  correo: ['correo', 'correo electronico', 'email', 'e-mail', 'mail'],
  whatsapp: ['whatsapp', 'celular', 'telefono', 'movil', 'numero', 'telefono celular'],
  compania: ['compania', 'empresa', 'sociedad', 'razon social'],
  area: ['area', 'departamento', 'depto', 'gerencia'],
};
const ETIQUETA: Record<Campo, string> = { nombre: 'Nombre', correo: 'Correo', whatsapp: 'WhatsApp', compania: 'Compañía', area: 'Área' };

/** Quita el código del inicio ("0102 - GERENCIA") y pasa a tipo título si viene en mayúsculas (igual que el servidor). */
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'para', 'por', 'con']);
function limpiarTexto(v: string | null): string | null {
  let t = (v ?? '').replace(/\s+/g, ' ').trim().replace(/^\d+\s*[-–.]\s*/, '').trim();
  if (!t) return null;
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4}/.test(t)) {
    t = t.toLowerCase().split(' ').map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.replace(/(^|[-/(])(\p{L})/gu, (_m, a: string, l: string) => a + l.toUpperCase()))).join(' ');
  }
  return t;
}

/** "Compañía · Área" con lo que haya. */
const lugar = (i: { compania: string | null; area: string | null }) => [i.compania, i.area].filter(Boolean).join(' · ');

/** Valores distintos, ordenados alfabéticamente. */
const distintos = (v: (string | null)[]) => [...new Set(v.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'es'));

/** 50761234567 → +507 6123-4567 (otros países se muestran con + y los dígitos). */
function formatoTelefono(n: string | null): string | null {
  if (!n) return null;
  const m = n.match(/^507(\d{4})(\d{4})$/);
  return m ? `+507 ${m[1]}-${m[2]}` : `+${n}`;
}

function enviada(i: Invitado) {
  return Boolean(i.waEnviadoEn || i.correoEnviadoEn);
}

export default function Invitados() {
  const nav = useNavigate();
  const [lista, setLista] = useState<Invitado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [fCompania, setFCompania] = useState('');
  const [fArea, setFArea] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [importando, setImportando] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [hojas, setHojas] = useState<HojaLeida[]>([]);
  const [filas, setFilas] = useState<FilaExcel[]>([]);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [errorFicha, setErrorFicha] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await api<Invitado[]>('/api/invitados'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // Opciones de los filtros: las áreas dependen de la compañía elegida.
  const companias = useMemo(() => distintos(lista.map((i) => i.compania)), [lista]);
  const areas = useMemo(() => distintos(lista.filter((i) => !fCompania || i.compania === fCompania).map((i) => i.area)), [lista, fCompania]);
  const hayFiltroGrupo = Boolean(fCompania || fArea);

  function elegirCompania(c: string) {
    setFCompania(c);
    if (fArea && !lista.some((i) => (!c || i.compania === c) && i.area === fArea)) setFArea('');
  }

  // Invitados de la compañía/área elegida; los conteos y la lista parten de aquí.
  const base = useMemo(() => lista.filter((i) =>
    (!fCompania || i.compania === fCompania) && (!fArea || i.area === fArea)), [lista, fCompania, fArea]);

  const conteo = useMemo(() => ({
    todos: base.length,
    pendientes: base.filter((i) => !enviada(i)).length,
    enviadas: base.filter(enviada).length,
    llegaron: base.filter((i) => i.llegadaEn).length,
  }), [base]);

  const visibles = useMemo(() => {
    const n = normalizar(q.trim());
    return base.filter((i) => {
      if (filtro === 'pendientes' && enviada(i)) return false;
      if (filtro === 'enviadas' && !enviada(i)) return false;
      if (filtro === 'llegaron' && !i.llegadaEn) return false;
      return !n || normalizar(i.nombre).includes(n) || normalizar(i.area).includes(n) || normalizar(i.compania).includes(n) || normalizar(i.codigo).includes(n);
    });
  }, [base, filtro, q]);

  /** Exporta respetando estado, compañía y área. */
  function exportar() {
    const p = new URLSearchParams();
    if (filtro !== 'todos') p.set('filtro', filtro);
    if (fCompania) p.set('compania', fCompania);
    if (fArea) p.set('area', fArea);
    const partes = [filtro === 'todos' ? 'llegadas' : `invitados_${filtro}`, fCompania, fArea].filter(Boolean)
      .map((t) => t.normalize('NFD').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase());
    const qs = p.toString();
    void descargar(`/api/invitados/exportar.xlsx${qs ? `?${qs}` : ''}`, `${partes.join('_')}_fiesta_2026.xlsx`);
  }
  const grupo = [fCompania, fArea].filter(Boolean).join(' · ');

  function alternar(id: number) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  /** Lee todas las hojas. Si el libro tiene varias y no hay columna Compañía, el nombre de la hoja es la compañía. */
  async function leerExcel(f: File) {
    setErrorExcel(null);
    setArchivo(f.name);
    try {
      const nombres = await readSheetNames(f);
      const varias = nombres.length > 1;
      const datos: FilaExcel[] = [];
      const resumen: HojaLeida[] = [];
      for (const hoja of nombres) {
        const rows = await readXlsxFile(f, { sheet: hoja });
        // El encabezado es la primera fila (de las 10 primeras) que tenga una columna de nombre.
        const iEnc = rows.slice(0, 10).findIndex((row) => row.some((c) => SINONIMOS.nombre.includes(normalizar(String(c ?? '')).trim())));
        if (iEnc < 0) {
          if (rows.some((row) => row.some((c) => c != null))) resumen.push({ hoja, filas: 0, columnas: [], compania: null, error: 'sin columna "Nombre"' });
          continue;
        }
        const encabezados = rows[iEnc].map((c) => normalizar(String(c ?? '')).trim());
        const indices: Partial<Record<Campo, number>> = {};
        const columnas: string[] = [];
        (Object.keys(SINONIMOS) as Campo[]).forEach((campo) => {
          const i = encabezados.findIndex((h) => SINONIMOS[campo].includes(h));
          if (i >= 0) { indices[campo] = i; columnas.push(`${String(rows[iEnc][i]).trim()} → ${ETIQUETA[campo]}`); }
        });
        const companiaHoja = indices.compania === undefined && varias ? hoja.trim() : null;
        const v = (row: unknown[], c: Campo) => (indices[c] === undefined || row[indices[c]!] == null ? null : String(row[indices[c]!]).trim() || null);
        const deHoja = rows.slice(iEnc + 1)
          .map((row) => ({
            nombre: (v(row, 'nombre') ?? '').replace(/\s+/g, ' '),
            correo: v(row, 'correo'),
            whatsapp: v(row, 'whatsapp'),
            compania: limpiarTexto(v(row, 'compania') ?? companiaHoja),
            area: limpiarTexto(v(row, 'area')),
          }))
          .filter((r) => r.nombre.length >= 2);
        datos.push(...deHoja);
        resumen.push({ hoja, filas: deHoja.length, columnas, compania: companiaHoja });
      }
      if (!datos.length) throw new Error('No se encontró ninguna hoja con columna "Nombre". Usa la plantilla.');
      setHojas(resumen);
      setFilas(datos);
    } catch (e) {
      setFilas([]);
      setHojas([]);
      setErrorExcel((e as Error).message);
    }
  }

  async function importar() {
    setSubiendo(true);
    try {
      const r = await api<{ creados: number; actualizados: number }>('/api/invitados/importar', { body: { invitados: filas } });
      setImportando(false);
      setFilas([]);
      setArchivo(null);
      setOk(`Importación lista: ${r.creados} nuevos, ${r.actualizados} actualizados.`);
      await cargar();
    } catch (e) {
      setErrorExcel((e as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  const sinContacto = filas.filter((f) => !f.correo && !f.whatsapp).length;

  function abrirFicha(i?: Invitado) {
    setErrorFicha(null);
    setFicha(i
      ? { id: i.id, nombre: i.nombre, compania: i.compania ?? '', area: i.area ?? '', whatsapp: formatoTelefono(i.whatsapp) ?? '', correo: i.correo ?? '' }
      : { ...FICHA_VACIA, compania: fCompania, area: fArea });
  }

  async function guardarFicha() {
    if (!ficha) return;
    setGuardando(true);
    setErrorFicha(null);
    const datos = { nombre: ficha.nombre.trim(), compania: ficha.compania.trim() || null, area: ficha.area.trim() || null, whatsapp: ficha.whatsapp.trim() || null, correo: ficha.correo.trim() || null };
    try {
      if (ficha.id) {
        await api(`/api/invitados/${ficha.id}`, { method: 'PUT', body: datos });
        setOk(`Se guardaron los cambios de ${datos.nombre}.`);
      } else {
        const r = await api<{ codigo: string }>('/api/invitados', { body: datos });
        setOk(`${datos.nombre} se agregó a la lista (${r.codigo}).`);
      }
      setFicha(null);
      await cargar();
    } catch (e) {
      setErrorFicha((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function quitarInvitado() {
    if (!ficha?.id || !confirm(`¿Quitar a ${ficha.nombre} de la lista de invitados?`)) return;
    setGuardando(true);
    try {
      await api(`/api/invitados/${ficha.id}`, { method: 'DELETE' });
      setSel((s) => { const n = new Set(s); n.delete(ficha.id!); return n; });
      setOk(`${ficha.nombre} se quitó de la lista.`);
      setFicha(null);
      await cargar();
    } catch (e) {
      setErrorFicha((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Pantalla extra={sel.size > 0 && (
      <div className="barra-seleccion">
        <span>{sel.size} seleccionados</span>
        <button type="button" className="btn-dorado" onClick={() => nav('/enviar', { state: { ids: [...sel] } })}>
          <Icono n="enviar" size={18} /> Enviar invitación
        </button>
      </div>
    )}>
      <header className="cabecera fila-entre">
        <h1>Invitados</h1>
        <div className="fila-gap">
          <button type="button" className="btn-pildora blanco" onClick={() => abrirFicha()}><Icono n="mas" size={18} /> Agregar</button>
          <button type="button" className="btn-pildora" onClick={() => setImportando(true)}><Icono n="subir" size={18} /> Importar Excel</button>
        </div>
      </header>

      <Aviso texto={error} />
      <Aviso texto={ok} tipo="ok" />

      <div className="fila-gap envolver">
        <a className="enlace" href={urlApi('/api/invitados/plantilla.xlsx')}><Icono n="bajar" size={18} /> Descargar plantilla Excel</a>
        <button type="button" className="btn-texto" onClick={exportar}>
          {filtro === 'todos' && !hayFiltroGrupo
            ? 'Exportar lista y llegadas'
            : `Exportar ${filtro === 'todos' ? 'invitados' : NOMBRE_FILTRO[filtro]}${grupo ? ` de ${grupo}` : ''} a Excel (${conteo[filtro]})`}
        </button>
      </div>

      {(companias.length > 0 || areas.length > 0) && (
        <div className="filtros-grupo">
          <label className="filtro-select">
            <span>Compañía</span>
            <select value={fCompania} onChange={(e) => elegirCompania(e.target.value)}>
              <option value="">Todas ({lista.length})</option>
              {companias.map((c) => <option key={c} value={c}>{c} ({lista.filter((i) => i.compania === c).length})</option>)}
            </select>
          </label>
          <label className="filtro-select">
            <span>Área</span>
            <select value={fArea} onChange={(e) => setFArea(e.target.value)}>
              <option value="">Todas</option>
              {areas.map((a) => <option key={a} value={a}>{a} ({lista.filter((i) => i.area === a && (!fCompania || i.compania === fCompania)).length})</option>)}
            </select>
          </label>
          {hayFiltroGrupo && <button type="button" className="btn-texto" onClick={() => { setFCompania(''); setFArea(''); }}>Quitar filtros</button>}
        </div>
      )}

      <Segmentado etiqueta="Filtrar" valor={filtro} onChange={setFiltro} opciones={[
        { v: 'todos', t: `Todos ${cargando ? '…' : conteo.todos}` },
        { v: 'pendientes', t: `Pendientes ${cargando ? '…' : conteo.pendientes}` },
        { v: 'enviadas', t: `Enviadas ${cargando ? '…' : conteo.enviadas}` },
        { v: 'llegaron', t: `Llegaron ${cargando ? '…' : conteo.llegaron}` },
      ]} />

      <Buscador valor={q} onChange={setQ} placeholder="Buscar invitado" />

      {visibles.length > 0 && (
        <div className="fila-gap envolver">
          <button type="button" className="btn-texto" onClick={() => setSel(new Set(visibles.map((i) => i.id)))}>Seleccionar todos ({visibles.length})</button>
          {sel.size > 0 && <button type="button" className="btn-texto" onClick={() => setSel(new Set())}>Quitar selección ({sel.size})</button>}
        </div>
      )}

      {filtro === 'pendientes' && !cargando && (
        conteo.pendientes > 0 ? (
          <div className="aviso-pendientes">
            <span>
              <strong>{conteo.pendientes} {conteo.pendientes === 1 ? 'invitado' : 'invitados'}{grupo ? ` de ${grupo}` : ''} {conteo.pendientes === 1 ? 'aún no ha' : 'aún no han'} recibido la invitación</strong>
              <span className="tenue chico bloque">No se les ha enviado nada todavía, o el envío falló. Los que tienen error también aparecen aquí.</span>
            </span>
            <button type="button" className="btn-pildora" disabled={visibles.length === 0}
              onClick={() => nav('/enviar', { state: { ids: visibles.map((i) => i.id) } })}>
              <Icono n="enviar" size={18} /> Enviar a {visibles.length === conteo.pendientes ? 'todos' : `estos ${visibles.length}`}
            </button>
          </div>
        ) : (
          <div className="aviso ok">Todos los invitados{grupo ? ` de ${grupo}` : ''} ya recibieron la invitación.</div>
        )
      )}

      <section className="tarjeta scroll lista-flex" aria-label="Lista de invitados">
        {cargando && lista.length === 0 && <Cargando texto="Cargando invitados…" />}
        {!cargando && visibles.length === 0 && <p className="tenue centro relleno">{lista.length ? (hayFiltroGrupo ? `No hay invitados que coincidan en ${grupo}.` : 'Sin resultados.') : 'Aún no hay invitados. Agrégalos uno por uno o importa tu Excel.'}</p>}
        {visibles.map((i) => {
          const tel = formatoTelefono(i.whatsapp);
          const canales = [i.waEnviadoEn ? 'WhatsApp' : '', i.correoEnviadoEn ? 'correo' : ''].filter(Boolean).join(' y ');
          return (
            <div key={i.id} className={'fila' + (sel.has(i.id) ? ' marcada' : '')}>
              <label className="casilla">
                <input type="checkbox" checked={sel.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Seleccionar ${i.nombre}`} />
              </label>
              <button type="button" className="fila-boton" onClick={() => abrirFicha(i)} aria-label={`Editar ${i.nombre}`}>
              <Avatar texto={iniciales(i.nombre)} />
              <span className="fila-texto">
                <strong>{i.nombre}</strong>
                <span className="tenue">{[lugar(i), i.codigo].filter(Boolean).join(' · ')}</span>
                <span className="tenue contacto">
                  <span>WhatsApp: {tel ?? <em>sin número</em>}</span>
                  <span>Correo: {i.correo ?? <em>sin correo</em>}</span>
                </span>
              </span>
              <span className="derecha">
                <span className={'pastilla ' + (canales ? 'ok' : 'pend')}>{canales ? `Enviada · ${canales}` : 'Sin enviar'}</span>
                <span className={i.llegadaEn ? 'verde negrita chico' : 'tenue chico'}>{i.llegadaEn ? `Llegó ${hora(i.llegadaEn)}` : 'No ha llegado'}</span>
              </span>
              </button>
            </div>
          );
        })}
      </section>

      <Hoja abierta={!!ficha} alCerrar={() => !guardando && setFicha(null)} titulo={ficha?.id ? 'Editar invitado' : 'Agregar invitado'}>
        {ficha && (
          <form className="form-invitado" onSubmit={(e) => { e.preventDefault(); void guardarFicha(); }}>
            <label className="campo">Nombre completo
              <input value={ficha.nombre} onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })} autoComplete="off" required minLength={2} />
            </label>
            <label className="campo">Compañía
              <input value={ficha.compania} onChange={(e) => setFicha({ ...ficha, compania: e.target.value })} list="lista-companias" autoComplete="off" placeholder="Haseth, Botica, Laboratorio…" />
              <datalist id="lista-companias">{companias.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="campo">Área o departamento
              <input value={ficha.area} onChange={(e) => setFicha({ ...ficha, area: e.target.value })} list="lista-areas" autoComplete="off" />
              <datalist id="lista-areas">
                {distintos(lista.filter((i) => !ficha.compania || i.compania === ficha.compania).map((i) => i.area)).map((a) => <option key={a} value={a} />)}
              </datalist>
            </label>
            <label className="campo">WhatsApp
              <input type="tel" inputMode="tel" value={ficha.whatsapp} onChange={(e) => setFicha({ ...ficha, whatsapp: e.target.value })} placeholder="6123-4567" autoComplete="off" />
              <small>8 dígitos de Panamá, o con código de país si es de otro país.</small>
            </label>
            <label className="campo">Correo
              <input type="email" inputMode="email" value={ficha.correo} onChange={(e) => setFicha({ ...ficha, correo: e.target.value })} placeholder="nombre@ejemplo.com" autoComplete="off" />
            </label>
            <Aviso texto={errorFicha} />
            <button type="submit" className="btn-primario ancho" disabled={guardando || ficha.nombre.trim().length < 2}>
              {guardando ? 'Guardando…' : ficha.id ? 'Guardar cambios' : 'Agregar invitado'}
            </button>
            {ficha.id && (
              <button type="button" className="btn-texto rojo" disabled={guardando} onClick={quitarInvitado}>Quitar de la lista</button>
            )}
          </form>
        )}
      </Hoja>

      <Hoja abierta={importando} alCerrar={() => setImportando(false)} titulo="Importar desde Excel">
        <label className="zona-archivo">
          <span className="icono-xls">XLS</span>
          <span className="fila-texto">
            <strong>{archivo ?? 'Elegir archivo'}</strong>
            <span className="tenue">Toca para elegir un archivo .xlsx con columnas Nombre, Correo, WhatsApp, Compañía y Área. Si el libro tiene una hoja por compañía, el nombre de cada hoja se usa como compañía.</span>
          </span>
          <input type="file" accept=".xlsx" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; if (f) void leerExcel(f); }} />
        </label>
        <Aviso texto={errorExcel} />
        {hojas.length > 0 && (
          <>
            <span className="rotulo">{hojas.length === 1 ? 'Hoja leída' : `${hojas.length} hojas leídas`}</span>
            <div className="tarjeta">
              {hojas.map((h) => (
                <div key={h.hoja} className="fila-ajuste hoja-leida">
                  <span className="fila-texto">
                    <strong>{h.hoja}</strong>
                    <span className="tenue chico">
                      {h.error ?? [h.compania ? `Compañía: ${h.compania}` : '', ...h.columnas].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={h.error ? 'rojo negrita' : 'verde negrita'}>{h.error ? 'Omitida' : `${h.filas} invitados`}</span>
                </div>
              ))}
            </div>
            <div className="fila-gap">
              <span className="caja ok">{filas.length} filas válidas</span>
              {sinContacto > 0 && <span className="caja pend">{sinContacto} sin WhatsApp ni correo</span>}
            </div>
            <p className="tenue chico">Si un nombre ya existe, se actualizan su correo, WhatsApp, compañía y área. Los nuevos reciben su código y QR automáticamente.</p>
            <button type="button" className="btn-primario ancho" disabled={!filas.length || subiendo} onClick={importar}>
              {subiendo ? 'Importando…' : `Importar ${filas.length} invitados`}
            </button>
          </>
        )}
      </Hoja>
    </Pantalla>
  );
}
