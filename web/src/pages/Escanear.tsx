import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QrScanner from 'qr-scanner';
import { api, hora, iniciales, leerSesion, normalizar, primerNombre, type Invitado, type Resumen } from '../api';
import { Aviso, Avatar, Buscador, Cargando, Hoja, Pantalla } from '../components/Comunes';
import { Icono } from '../components/Icono';

/** "Compañía · Área" (lo que haya). */
const lugar = (x: { compania?: string | null; area: string | null }) => [x.compania, x.area].filter(Boolean).join(' · ');

interface Llegada { id: number; codigo: string; nombre: string; compania?: string | null; area: string | null; llegadaEn: string; llegadaVia: string; llegadaAdmin: string | null }
interface ResultadoCheckin {
  resultado: 'OK' | 'DUPLICADO' | 'INVALIDO';
  invitado?: { id: number; codigo: string; nombre: string; compania?: string | null; area: string | null; llegadaEn: string | null; llegadaAdmin: string | null };
}

function sonar(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.15 : 0.35));
  } catch {
    /* sin audio */
  }
}

export default function Escanear() {
  const admin = leerSesion()?.admin;
  const video = useRef<HTMLVideoElement>(null);
  const escaner = useRef<QrScanner | null>(null);
  const ocupado = useRef(false);
  const ultimo = useRef<{ v: string; t: number }>({ v: '', t: 0 });

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [recientes, setRecientes] = useState<Llegada[]>([]);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [tieneFlash, setTieneFlash] = useState(false);
  const [camara, setCamara] = useState<'environment' | 'user'>('environment');
  const [res, setRes] = useState<ResultadoCheckin | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [lista, setLista] = useState<Invitado[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargandoRecientes, setCargandoRecientes] = useState(true);
  const [cargandoLista, setCargandoLista] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      const [r, l] = await Promise.all([api<Resumen>('/api/invitados/resumen'), api<Llegada[]>('/api/checkin/recientes?limite=30')]);
      setResumen(r);
      setRecientes(l);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoRecientes(false);
    }
  }, []);

  useEffect(() => {
    void refrescar();
    const t = setInterval(refrescar, 10_000);
    return () => clearInterval(t);
  }, [refrescar]);

  const mostrar = useCallback((r: ResultadoCheckin) => {
    ocupado.current = true;
    setRes(r);
    sonar(r.resultado === 'OK');
    void refrescar();
  }, [refrescar]);

  const leido = useCallback(async (valor: string) => {
    const ahora = Date.now();
    if (ocupado.current || (valor === ultimo.current.v && ahora - ultimo.current.t < 4000)) return;
    ultimo.current = { v: valor, t: ahora };
    ocupado.current = true;
    try {
      mostrar(await api<ResultadoCheckin>('/api/checkin/qr', { body: { valor } }));
    } catch (e) {
      ocupado.current = false;
      setError((e as Error).message);
    }
  }, [mostrar]);

  useEffect(() => {
    if (!video.current) return;
    const s = new QrScanner(video.current, (r) => void leido(r.data), {
      preferredCamera: camara,
      maxScansPerSecond: 5,
      highlightScanRegion: false,
      returnDetailedScanResult: true,
    });
    escaner.current = s;
    s.start()
      .then(async () => { setErrorCamara(null); setTieneFlash(await s.hasFlash()); })
      .catch(() => setErrorCamara('No se pudo abrir la cámara. Permite el acceso a la cámara y verifica que la app se abra con https://'));
    return () => { s.destroy(); escaner.current = null; };
  }, [camara, leido]);

  // Cierra automáticamente el resultado exitoso para seguir escaneando.
  useEffect(() => {
    if (res?.resultado !== 'OK') return;
    const t = setTimeout(() => cerrar(), 4000);
    return () => clearTimeout(t);
  }, [res]);

  function cerrar() {
    setRes(null);
    setBuscando(false);
    ocupado.current = false;
  }

  async function abrirBusqueda() {
    setRes(null);
    setQ('');
    setBuscando(true);
    ocupado.current = true;
    setCargandoLista(true);
    try {
      setLista(await api<Invitado[]>('/api/invitados'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoLista(false);
    }
  }

  async function registrarManual(id: number) {
    try {
      const r = await api<ResultadoCheckin>('/api/checkin/manual', { body: { invitadoId: id } });
      setBuscando(false);
      mostrar(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const filtrados = useMemo(() => {
    const n = normalizar(q.trim());
    return lista.filter((i) => !n || normalizar(i.nombre).includes(n) || normalizar(i.area).includes(n) || normalizar(i.compania).includes(n) || normalizar(i.codigo).includes(n));
  }, [lista, q]);

  const r = res;
  const inv = r?.invitado;

  return (
    <Pantalla>
      <header className="cabecera fila-entre">
        <div>
          <span className="tenue">Hola, {primerNombre(admin?.nombre)} · Fiesta navideña 2026</span>
          <h1>Registro de llegadas</h1>
        </div>
        <Link to="/" className="chip-usuario" onClick={() => localStorage.removeItem('fnh_sesion')}>
          <Avatar texto={iniciales(admin?.nombre ?? '')} color={admin?.color} tam={38} /> Cambiar
        </Link>
      </header>

      <Aviso texto={error} />

      <div className="stats3">
        <div className="stat"><span>Llegaron</span><strong className="verde">{resumen?.llegaron ?? '–'}</strong></div>
        <div className="stat"><span>Faltan</span><strong>{resumen?.faltan ?? '–'}</strong></div>
        <div className="stat"><span>Invitados</span><strong>{resumen?.total ?? '–'}</strong></div>
      </div>

      <section className="camara" aria-label="Cámara">
        <video ref={video} muted playsInline />
        <div className="visor" aria-hidden="true" />
        <span className="camara-ayuda">{errorCamara ?? 'Apunta al código QR de la invitación'}</span>
        <div className="camara-botones">
          {tieneFlash && (
            <button type="button" aria-label="Linterna" onClick={() => void escaner.current?.toggleFlash()}><Icono n="linterna" /></button>
          )}
          <button type="button" aria-label="Cambiar cámara" onClick={() => setCamara((c) => (c === 'environment' ? 'user' : 'environment'))}><Icono n="camara" /></button>
        </div>
      </section>

      <button type="button" className="btn-blanco" onClick={abrirBusqueda}>
        <Icono n="buscar" /> ¿No trae QR? Buscar por nombre
      </button>

      <section className="tarjeta lista-flex" aria-label="Últimas llegadas">
        <div className="fila-entre tarjeta-titulo">
          <strong>Últimas llegadas</strong>
          <Link to="/invitados">Ver todas</Link>
        </div>
        <div className="scroll">
          {cargandoRecientes && recientes.length === 0 && <Cargando texto="Cargando llegadas…" />}
          {!cargandoRecientes && recientes.length === 0 && <p className="tenue centro relleno">Aún no hay llegadas registradas.</p>}
          {recientes.map((l) => (
            <div key={l.id} className="fila">
              <Avatar texto={iniciales(l.nombre)} tam={42} />
              <span className="fila-texto">
                <strong>{l.nombre}</strong>
                <span className="tenue">{lugar(l)} · registró {primerNombre(l.llegadaAdmin ?? '')} · {l.llegadaVia === 'QR' ? 'QR' : 'Nombre'}</span>
              </span>
              <span className="verde negrita">{hora(l.llegadaEn)}</span>
            </div>
          ))}
        </div>
      </section>

      <Hoja abierta={buscando} alCerrar={cerrar} titulo="Buscar invitado" alta>
        <Buscador valor={q} onChange={setQ} placeholder="Nombre, apellido, área o código" />
        <div className="tarjeta scroll">
          {cargandoLista && lista.length === 0 && <Cargando texto="Cargando invitados…" />}
          {filtrados.map((i) => (
            <button key={i.id} type="button" className="fila boton-fila" disabled={!!i.llegadaEn} onClick={() => registrarManual(i.id)}>
              <Avatar texto={iniciales(i.nombre)} tam={44} />
              <span className="fila-texto"><strong>{i.nombre}</strong><span className="tenue">{[lugar(i), i.codigo].filter(Boolean).join(' · ')}</span></span>
              <span className={'pastilla ' + (i.llegadaEn ? 'ok' : 'solida')}>{i.llegadaEn ? `Llegó ${hora(i.llegadaEn)}` : 'Registrar'}</span>
            </button>
          ))}
        </div>
      </Hoja>

      <Hoja abierta={!!r} alCerrar={cerrar}>
        {r && (
          <div className="resultado" role="alert">
            <span className={'resultado-icono ' + r.resultado.toLowerCase()}>
              <Icono n={r.resultado === 'OK' ? 'check' : r.resultado === 'DUPLICADO' ? 'alerta' : 'x'} size={52} grosor={2.6} />
            </span>
            {r.resultado === 'OK' && <>
              <span className="etiqueta verde">Llegada registrada · {hora(inv?.llegadaEn ?? null)}</span>
              <span className="resultado-nombre">{inv?.nombre}</span>
              <span className="tenue grande">{[inv && lugar(inv), inv?.codigo].filter(Boolean).join(' · ')}</span>
            </>}
            {r.resultado === 'DUPLICADO' && <>
              <span className="etiqueta ambar">Ya había llegado</span>
              <span className="resultado-nombre">{inv?.nombre}</span>
              <span className="tenue grande">Registrado a las {hora(inv?.llegadaEn ?? null)} por {inv?.llegadaAdmin ?? '—'}.</span>
            </>}
            {r.resultado === 'INVALIDO' && <>
              <span className="etiqueta rojo">Código no válido</span>
              <span className="resultado-nombre">QR no reconocido</span>
              <span className="tenue grande">Este código no pertenece a la lista de invitados. Búscalo por nombre o consulta con un administrador.</span>
            </>}
            <button type="button" className="btn-primario ancho" onClick={cerrar}>Seguir escaneando</button>
            {r.resultado === 'INVALIDO' && <button type="button" className="btn-gris ancho" onClick={abrirBusqueda}>Buscar por nombre</button>}
          </div>
        )}
      </Hoja>
    </Pantalla>
  );
}
