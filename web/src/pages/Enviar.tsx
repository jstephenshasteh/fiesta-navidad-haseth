import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, primerNombre, urlApi, urlConToken, type Evento, type Invitado } from '../api';
import { Aviso, Hoja, Pantalla, Segmentado } from '../components/Comunes';
import { Icono } from '../components/Icono';

type Canal = 'WHATSAPP' | 'CORREO' | 'AMBOS';
interface Resultado { invitadoId: number; nombre: string; canal: 'WHATSAPP' | 'CORREO'; estado: 'ENVIADO' | 'ERROR' | 'OMITIDO'; detalle?: string }

// Invitados por petición. Cada lote espera unos segundos entre el arte y el pase de WhatsApp.
const LOTE = 10;
const VARIABLES = ['{nombre}', '{area}'];

export default function Enviar() {
  const loc = useLocation();
  const idsRuta = (loc.state as { ids?: number[] } | null)?.ids;

  const [todos, setTodos] = useState<Invitado[]>([]);
  const [evento, setEvento] = useState<Evento | null>(null);
  const [canales, setCanales] = useState<{ whatsapp: boolean; whatsappModo?: string; correo: boolean } | null>(null);
  const [canal, setCanal] = useState<Canal>('WHATSAPP');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([api<Invitado[]>('/api/invitados'), api<Evento>('/api/evento'), api<{ whatsapp: boolean; whatsappModo?: string; correo: boolean }>('/api/envios/canales')])
      .then(([l, e, c]) => {
        setTodos(l);
        setEvento(e);
        setCanales(c);
        setAsunto(e.asuntoCorreo ?? '');
        setMensaje(e.mensaje ?? '');
        if (!c.whatsapp && c.correo) setCanal('CORREO');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  // Destinatarios: los elegidos en Invitados o, si no hay, los que no tienen envío.
  const destinatarios = useMemo(() => {
    if (idsRuta?.length) return todos.filter((i) => idsRuta.includes(i.id));
    return todos.filter((i) => !i.waEnviadoEn && !i.correoEnviadoEn);
  }, [todos, idsRuta]);

  const actual = destinatarios[Math.min(idx, Math.max(destinatarios.length - 1, 0))];
  const sinDestino = destinatarios.filter((i) =>
    canal === 'WHATSAPP' ? !i.whatsapp : canal === 'CORREO' ? !i.correo : !i.whatsapp && !i.correo).length;
  const canalNoListo = canales && ((canal !== 'CORREO' && !canales.whatsapp) || (canal !== 'WHATSAPP' && !canales.correo));
  const via = { WHATSAPP: 'por WhatsApp', CORREO: 'por correo', AMBOS: 'por WhatsApp y correo' }[canal];

  async function enviar() {
    setEnviando(true);
    setProgreso(0);
    setResultados([]);
    const ids = destinatarios.map((i) => i.id);
    const acumulado: Resultado[] = [];
    try {
      for (let i = 0; i < ids.length; i += LOTE) {
        const r = await api<{ resultados: Resultado[] }>('/api/envios', {
          body: { invitadoIds: ids.slice(i, i + LOTE), canal, asunto, mensaje },
        });
        acumulado.push(...r.resultados);
        setResultados([...acumulado]);
        setProgreso(Math.min(i + LOTE, ids.length));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const enviados = resultados?.filter((r) => r.estado === 'ENVIADO').length ?? 0;
  const fallidos = resultados?.filter((r) => r.estado !== 'ENVIADO') ?? [];

  return (
    <Pantalla>
      <header className="cabecera">
        <Link to="/invitados" className="volver"><Icono n="atras" size={20} /> Invitados</Link>
        <div className="fila-entre base">
          <h1>Enviar invitación</h1>
          <span className="tenue">{cargando ? 'Cargando…' : `${destinatarios.length} ${idsRuta?.length ? 'seleccionados' : 'pendientes de envío'}`}</span>
        </div>
      </header>

      <Aviso texto={error} />
      {canalNoListo && <Aviso texto="Este canal aún no está configurado en el servidor (ver .env de la API)." />}

      <section className="tarjeta vista-previa" aria-label="Vista previa">
        <div className="fila-entre">
          <button type="button" className="btn-redondo" aria-label="Anterior" disabled={destinatarios.length < 2} onClick={() => setIdx((i) => (i - 1 + destinatarios.length) % destinatarios.length)}><Icono n="atras" size={18} /></button>
          <span className="centro">
            <strong>{cargando ? 'Cargando invitados…' : actual?.nombre ?? 'Sin destinatarios'}</strong>
            <span className="tenue chico bloque">Vista previa {destinatarios.length ? Math.min(idx, destinatarios.length - 1) + 1 : 0} de {destinatarios.length} · se envían 2 imágenes</span>
          </span>
          <button type="button" className="btn-redondo" aria-label="Siguiente" disabled={destinatarios.length < 2} onClick={() => setIdx((i) => (i + 1) % destinatarios.length)}><Icono n="adelante" size={18} /></button>
        </div>
        <div className="dos-imagenes">
          <figure>
            <figcaption>Imagen 1 · Arte (igual para todos)</figcaption>
            {evento?.tieneArte ? <img src={urlApi('/api/evento/arte')} alt="Arte de la invitación" /> : <div className="sin-imagen">Sube el arte en Ajustes</div>}
          </figure>
          <figure>
            <figcaption>Imagen 2 · Pase QR de {primerNombre(actual?.nombre)}</figcaption>
            {actual ? <img src={urlConToken(`/api/invitados/${actual.id}/pase.png`)} alt={`Pase QR de ${actual.nombre}`} /> : <div className="sin-imagen" />}
          </figure>
        </div>
      </section>

      <Segmentado etiqueta="Canal de envío" valor={canal} onChange={setCanal} opciones={[
        { v: 'WHATSAPP', t: 'WhatsApp' }, { v: 'CORREO', t: 'Correo' }, { v: 'AMBOS', t: 'Ambos' },
      ]} />

      <section className="tarjeta relleno-chico mensaje">
        {canal !== 'WHATSAPP' && (
          <label className="fila-campo">
            <span className="tenue">Asunto</span>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </label>
        )}
        {canal === 'WHATSAPP' ? (
          canales?.whatsappModo === 'prueba' ? (
            <p className="ambar chico">Modo de prueba de WhatsApp: el mensaje de abajo va junto al arte. Solo llega a quien le haya escrito al número de la empresa en las últimas 24 horas.</p>
          ) : (
            <p className="tenue chico">En WhatsApp se usan las plantillas aprobadas en 360dialog (arte y pase, ambos con el nombre del invitado). El texto de abajo se usa en el correo.</p>
          )
        ) : null}
        <label htmlFor="msg" className="tenue">{canales?.whatsappModo === 'prueba' ? 'Mensaje (WhatsApp y correo)' : 'Mensaje del correo'}</label>
        <textarea id="msg" value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4} />
        <div className="fila-gap envolver">
          <span className="tenue chico">Variables:</span>
          {VARIABLES.map((v) => (
            <button key={v} type="button" className="chip" onClick={() => setMensaje((m) => `${m} ${v}`)}>{v}</button>
          ))}
        </div>
      </section>

      {sinDestino > 0 && <p className="ambar chico">{sinDestino} invitado(s) no tienen dato de contacto para este canal y se omitirán.</p>}

      <button type="button" className="btn-primario" disabled={cargando || !destinatarios.length || enviando || !!canalNoListo} onClick={enviar}>
        <Icono n="enviar" size={20} /> Enviar {destinatarios.length} invitaciones {via}
      </button>

      <Hoja abierta={resultados !== null} alCerrar={() => !enviando && setResultados(null)} titulo={enviando ? `Enviando… ${progreso} de ${destinatarios.length}` : `${enviados} envíos completados`}>
        {fallidos.length > 0 && !enviando && <p className="ambar">{fallidos.length} con error u omitidos:</p>}
        <div className="tarjeta scroll max-alto">
          {(enviando ? resultados ?? [] : [...fallidos, ...(resultados ?? []).filter((r) => r.estado === 'ENVIADO')]).map((r, i) => (
            <div key={i} className="fila">
              <span className="fila-texto">
                <strong>{r.nombre}</strong>
                <span className="tenue">{r.canal === 'WHATSAPP' ? 'WhatsApp' : 'Correo'}{r.detalle ? ` · ${r.detalle}` : ''}</span>
              </span>
              <span className={'pastilla ' + (r.estado === 'ENVIADO' ? 'ok' : r.estado === 'OMITIDO' ? 'pend' : 'error')}>
                {r.estado === 'ENVIADO' ? 'Enviado' : r.estado === 'OMITIDO' ? 'Omitido' : 'Error'}
              </span>
            </div>
          ))}
        </div>
        {!enviando && <Link to="/invitados" className="btn-primario ancho">Volver a invitados</Link>}
      </Hoja>
    </Pantalla>
  );
}
