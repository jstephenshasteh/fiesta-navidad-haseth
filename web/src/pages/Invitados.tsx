import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import readXlsxFile from 'read-excel-file';
import { api, descargar, hora, iniciales, normalizar, urlApi, type Invitado } from '../api';
import { Aviso, Avatar, Buscador, Cargando, Hoja, Pantalla, Segmentado } from '../components/Comunes';
import { Icono } from '../components/Icono';

type Filtro = 'todos' | 'pendientes' | 'enviadas' | 'llegaron';
type Campo = 'nombre' | 'correo' | 'whatsapp' | 'area';
interface FilaExcel { nombre: string; correo: string | null; whatsapp: string | null; area: string | null }

/** Reconoce las columnas del Excel por su encabezado. */
const SINONIMOS: Record<Campo, string[]> = {
  nombre: ['nombre', 'nombre completo', 'invitado', 'colaborador', 'nombres'],
  correo: ['correo', 'correo electronico', 'email', 'e-mail', 'mail'],
  whatsapp: ['whatsapp', 'celular', 'telefono', 'movil', 'numero', 'telefono celular'],
  area: ['area', 'departamento', 'depto', 'gerencia', 'empresa'],
};
const ETIQUETA: Record<Campo, string> = { nombre: 'Nombre', correo: 'Correo', whatsapp: 'WhatsApp', area: 'Área' };

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
  const [q, setQ] = useState('');
  const [seleccionando, setSeleccionando] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [importando, setImportando] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [mapa, setMapa] = useState<{ col: string; campo: Campo }[]>([]);
  const [filas, setFilas] = useState<FilaExcel[]>([]);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

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

  const conteo = useMemo(() => ({
    todos: lista.length,
    pendientes: lista.filter((i) => !enviada(i)).length,
    enviadas: lista.filter(enviada).length,
    llegaron: lista.filter((i) => i.llegadaEn).length,
  }), [lista]);

  const visibles = useMemo(() => {
    const n = normalizar(q.trim());
    return lista.filter((i) => {
      if (filtro === 'pendientes' && enviada(i)) return false;
      if (filtro === 'enviadas' && !enviada(i)) return false;
      if (filtro === 'llegaron' && !i.llegadaEn) return false;
      return !n || normalizar(i.nombre).includes(n) || normalizar(i.area).includes(n) || normalizar(i.codigo).includes(n);
    });
  }, [lista, filtro, q]);

  function alternar(id: number) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function leerExcel(f: File) {
    setErrorExcel(null);
    setArchivo(f.name);
    try {
      const rows = await readXlsxFile(f);
      if (rows.length < 2) throw new Error('El archivo no tiene filas de invitados.');
      const encabezados = rows[0].map((c) => normalizar(String(c ?? '')).trim());
      const indices: Partial<Record<Campo, number>> = {};
      const m: { col: string; campo: Campo }[] = [];
      (Object.keys(SINONIMOS) as Campo[]).forEach((campo) => {
        const i = encabezados.findIndex((h) => SINONIMOS[campo].includes(h));
        if (i >= 0) { indices[campo] = i; m.push({ col: String(rows[0][i]), campo }); }
      });
      if (indices.nombre === undefined) throw new Error('No se encontró la columna "Nombre". Usa la plantilla.');
      const v = (row: unknown[], c: Campo) => (indices[c] === undefined ? null : row[indices[c]!] == null ? null : String(row[indices[c]!]).trim() || null);
      const datos = rows.slice(1)
        .map((row) => ({ nombre: v(row, 'nombre') ?? '', correo: v(row, 'correo'), whatsapp: v(row, 'whatsapp'), area: v(row, 'area') }))
        .filter((r) => r.nombre.length >= 2);
      setMapa(m);
      setFilas(datos);
    } catch (e) {
      setFilas([]);
      setMapa([]);
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

  return (
    <Pantalla extra={seleccionando && sel.size > 0 && (
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
          <button type="button" className="btn-pildora blanco" onClick={() => { setSeleccionando((s) => !s); setSel(new Set()); }}>
            {seleccionando ? 'Listo' : 'Seleccionar'}
          </button>
          <button type="button" className="btn-pildora" onClick={() => setImportando(true)}><Icono n="subir" size={18} /> Importar Excel</button>
        </div>
      </header>

      <Aviso texto={error} />
      <Aviso texto={ok} tipo="ok" />

      <div className="fila-gap envolver">
        <a className="enlace" href={urlApi('/api/invitados/plantilla.xlsx')}><Icono n="bajar" size={18} /> Descargar plantilla Excel</a>
        <button type="button" className="btn-texto" onClick={() => descargar('/api/invitados/exportar.xlsx', 'llegadas_fiesta_2026.xlsx')}>Exportar lista y llegadas</button>
      </div>

      <Segmentado etiqueta="Filtrar" valor={filtro} onChange={setFiltro} opciones={[
        { v: 'todos', t: `Todos ${cargando ? '…' : conteo.todos}` },
        { v: 'pendientes', t: `Pendientes ${cargando ? '…' : conteo.pendientes}` },
        { v: 'enviadas', t: `Enviadas ${cargando ? '…' : conteo.enviadas}` },
        { v: 'llegaron', t: `Llegaron ${cargando ? '…' : conteo.llegaron}` },
      ]} />

      <Buscador valor={q} onChange={setQ} placeholder="Buscar invitado" />

      {seleccionando && (
        <div className="fila-gap">
          <button type="button" className="btn-texto" onClick={() => setSel(new Set(visibles.map((i) => i.id)))}>Seleccionar los {visibles.length} visibles</button>
          <button type="button" className="btn-texto" onClick={() => setSel(new Set())}>Quitar selección</button>
        </div>
      )}

      <section className="tarjeta scroll lista-flex" aria-label="Lista de invitados">
        {cargando && lista.length === 0 && <Cargando texto="Cargando invitados…" />}
        {!cargando && visibles.length === 0 && <p className="tenue centro relleno">{lista.length ? 'Sin resultados.' : 'Aún no hay invitados. Importa tu Excel para empezar.'}</p>}
        {visibles.map((i) => {
          const tel = formatoTelefono(i.whatsapp);
          const canales = [i.waEnviadoEn ? 'WhatsApp' : '', i.correoEnviadoEn ? 'correo' : ''].filter(Boolean).join(' y ');
          return (
            <div key={i.id} className={'fila' + (sel.has(i.id) ? ' marcada' : '')}>
              {seleccionando && (
                <label className="casilla">
                  <input type="checkbox" checked={sel.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Seleccionar ${i.nombre}`} />
                </label>
              )}
              <Avatar texto={iniciales(i.nombre)} />
              <span className="fila-texto">
                <strong>{i.nombre}</strong>
                <span className="tenue">{i.area ? `${i.area} · ` : ''}{i.codigo}</span>
                <span className="tenue contacto">
                  <span>WhatsApp: {tel ?? <em>sin número</em>}</span>
                  <span>Correo: {i.correo ?? <em>sin correo</em>}</span>
                </span>
              </span>
              <span className="derecha">
                <span className={'pastilla ' + (canales ? 'ok' : 'pend')}>{canales ? `Enviada · ${canales}` : 'Sin enviar'}</span>
                <span className={i.llegadaEn ? 'verde negrita chico' : 'tenue chico'}>{i.llegadaEn ? `Llegó ${hora(i.llegadaEn)}` : 'No ha llegado'}</span>
              </span>
            </div>
          );
        })}
      </section>

      <Hoja abierta={importando} alCerrar={() => setImportando(false)} titulo="Importar desde Excel">
        <label className="zona-archivo">
          <span className="icono-xls">XLS</span>
          <span className="fila-texto">
            <strong>{archivo ?? 'Elegir archivo'}</strong>
            <span className="tenue">Toca para elegir un archivo .xlsx con columnas Nombre, Correo, WhatsApp y Área</span>
          </span>
          <input type="file" accept=".xlsx" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; if (f) void leerExcel(f); }} />
        </label>
        <Aviso texto={errorExcel} />
        {mapa.length > 0 && (
          <>
            <span className="rotulo">Columnas detectadas</span>
            <div className="tarjeta">
              {mapa.map((m) => (
                <div key={m.campo} className="fila-ajuste">
                  <span>{m.col}</span>
                  <span className="verde negrita"><Icono n="adelante" size={14} /> {ETIQUETA[m.campo]}</span>
                </div>
              ))}
            </div>
            <div className="fila-gap">
              <span className="caja ok">{filas.length} filas válidas</span>
              {sinContacto > 0 && <span className="caja pend">{sinContacto} sin WhatsApp ni correo</span>}
            </div>
            <p className="tenue chico">Si un nombre ya existe, se actualizan su correo, WhatsApp y área. Los nuevos reciben su código y QR automáticamente.</p>
            <button type="button" className="btn-primario ancho" disabled={!filas.length || subiendo} onClick={importar}>
              {subiendo ? 'Importando…' : `Importar ${filas.length} invitados`}
            </button>
          </>
        )}
      </Hoja>
    </Pantalla>
  );
}
