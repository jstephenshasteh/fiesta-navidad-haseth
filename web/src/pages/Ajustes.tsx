import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, descargar, guardarSesion, iniciales, leerSesion, urlApi, type Admin, type Evento } from '../api';
import { Aviso, Avatar, Cargando, Hoja, Pantalla } from '../components/Comunes';

type CampoEvento = 'nombre' | 'fechaTexto' | 'dia' | 'mesCorto' | 'hora' | 'lugar' | 'salon' | 'vestimenta';
const CAMPOS: { k: CampoEvento; t: string }[] = [
  { k: 'nombre', t: 'Nombre' },
  { k: 'fechaTexto', t: 'Fecha' },
  { k: 'dia', t: 'Día (pase)' },
  { k: 'mesCorto', t: 'Mes (pase)' },
  { k: 'hora', t: 'Hora' },
  { k: 'lugar', t: 'Lugar' },
  { k: 'salon', t: 'Salón' },
  { k: 'vestimenta', t: 'Vestimenta' },
];

export default function Ajustes() {
  const nav = useNavigate();
  const yo = leerSesion()?.admin;
  const principal = !!yo?.esPrincipal;
  const [ev, setEv] = useState<Evento | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [canales, setCanales] = useState<{ whatsapp: boolean; correo: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [versionArte, setVersionArte] = useState(0);
  const [hojaAdmin, setHojaAdmin] = useState(false);
  const [hojaPin, setHojaPin] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: '', pin: '', esPrincipal: false });
  const [miPin, setMiPin] = useState('');

  async function cargar() {
    try {
      const [e, a, c] = await Promise.all([
        api<Evento>('/api/evento'), api<Admin[]>('/api/admins'), api<{ whatsapp: boolean; correo: boolean }>('/api/envios/canales'),
      ]);
      setEv(e); setAdmins(a); setCanales(c);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { void cargar(); }, []);

  async function guardar(cambios: Partial<Evento>) {
    try {
      setEv(await api<Evento>('/api/evento', { method: 'PUT', body: cambios }));
      setOk('Cambios guardados');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function subirArte(f: File) {
    const form = new FormData();
    form.append('arte', f);
    try {
      await api('/api/evento/arte', { method: 'PUT', form });
      setVersionArte(Date.now());
      await cargar();
      setOk('Arte actualizado');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function crearAdmin() {
    try {
      await api('/api/admins', { body: nuevo });
      setHojaAdmin(false);
      setNuevo({ nombre: '', pin: '', esPrincipal: false });
      setAdmins(await api<Admin[]>('/api/admins'));
      setOk('Administrador agregado');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function quitarAdmin(a: Admin) {
    if (!confirm(`¿Quitar a ${a.nombre} como administrador?`)) return;
    try {
      await api(`/api/admins/${a.id}`, { method: 'DELETE' });
      setAdmins(await api<Admin[]>('/api/admins'));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cambiarPin() {
    try {
      await api(`/api/admins/${yo!.id}/pin`, { method: 'PUT', body: { pin: miPin } });
      setHojaPin(false);
      setMiPin('');
      setOk('PIN actualizado');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function salir() {
    guardarSesion(null);
    nav('/', { replace: true });
  }

  return (
    <Pantalla>
      <header className="cabecera"><h1>Ajustes</h1></header>
      <Aviso texto={error} />
      <Aviso texto={ok} tipo="ok" />
      {!principal && <p className="tenue chico">Solo el administrador principal puede cambiar los datos del evento.</p>}

      <div className="scroll ajustes">
        <span className="rotulo">Evento</span>
        <div className="tarjeta">
          {!ev && !error && <Cargando texto="Cargando datos del evento…" />}
          {ev && CAMPOS.map((c) => (
            <label key={c.k} className="fila-ajuste">
              <span>{c.t}</span>
              <input defaultValue={ev[c.k] ?? ''} disabled={!principal} key={`${c.k}-${ev[c.k]}`}
                onBlur={(e) => e.target.value !== (ev[c.k] ?? '') && guardar({ [c.k]: e.target.value })} />
            </label>
          ))}
        </div>

        <span className="rotulo">Diseño de la invitación</span>
        <div className="tarjeta">
          <div className="fila-ajuste">
            {ev?.tieneArte ? <img className="miniatura" src={`${urlApi('/api/evento/arte')}?v=${versionArte}`} alt="Arte actual" /> : null}
            <span className="fila-texto">
              <span>Imagen 1 · Arte general</span>
              <span className="tenue chico">{ev?.arteNombre ?? 'Sin arte cargado'} · se envía igual a todos</span>
            </span>
            {principal && (
              <label className="btn-pildora gris">
                Cambiar
                <input type="file" accept="image/png,image/jpeg" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirArte(f); }} />
              </label>
            )}
          </div>
          <div className="fila-ajuste">
            <span>Imagen 2 · Color del pase QR</span>
            <div className="fila-gap">
              {(['rojo', 'verde'] as const).map((t) => (
                <button key={t} type="button" disabled={!principal} aria-pressed={ev?.temaPase === t} aria-label={t === 'rojo' ? 'Rojo' : 'Verde'}
                  className={'muestra ' + t + (ev?.temaPase === t ? ' activa' : '')} onClick={() => guardar({ temaPase: t })} />
              ))}
            </div>
          </div>
        </div>

        <span className="rotulo">Administradores</span>
        <div className="tarjeta">
          {admins.map((a) => (
            <div key={a.id} className="fila-ajuste">
              <Avatar texto={iniciales(a.nombre)} color={a.color} tam={36} />
              <span className="fila-texto"><span>{a.nombre}</span><span className="tenue chico">{a.esPrincipal ? 'Principal' : 'Administrador'}</span></span>
              {principal && a.id !== yo?.id && <button type="button" className="btn-texto rojo" onClick={() => quitarAdmin(a)}>Quitar</button>}
            </div>
          ))}
          {principal && <button type="button" className="fila-ajuste btn-fila verde" onClick={() => setHojaAdmin(true)}>Agregar administrador</button>}
          <button type="button" className="fila-ajuste btn-fila verde" onClick={() => setHojaPin(true)}>Cambiar mi PIN</button>
        </div>

        <span className="rotulo">Canales de envío</span>
        <div className="tarjeta">
          <div className="fila-ajuste"><span>WhatsApp (360dialog)</span><span className={'pastilla ' + (canales?.whatsapp ? 'ok' : 'pend')}>{canales?.whatsapp ? 'Configurado' : 'Sin configurar'}</span></div>
          <div className="fila-ajuste"><span>Correo (SMTP)</span><span className={'pastilla ' + (canales?.correo ? 'ok' : 'pend')}>{canales?.correo ? 'Configurado' : 'Sin configurar'}</span></div>
        </div>

        <span className="rotulo">Datos</span>
        <div className="tarjeta">
          <button type="button" className="fila-ajuste btn-fila verde" onClick={() => descargar('/api/invitados/exportar.xlsx', 'llegadas_fiesta_2026.xlsx')}>Exportar llegadas a Excel</button>
          <button type="button" className="fila-ajuste btn-fila rojo" onClick={salir}>Cerrar sesión</button>
        </div>
      </div>

      <Hoja abierta={hojaAdmin} alCerrar={() => setHojaAdmin(false)} titulo="Nuevo administrador">
        <label className="campo">Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
        <label className="campo">PIN (4 dígitos)<input inputMode="numeric" maxLength={4} value={nuevo.pin} onChange={(e) => setNuevo({ ...nuevo, pin: e.target.value.replace(/\D/g, '') })} /></label>
        <label className="fila-gap"><input type="checkbox" checked={nuevo.esPrincipal} onChange={(e) => setNuevo({ ...nuevo, esPrincipal: e.target.checked })} /> Administrador principal</label>
        <button type="button" className="btn-primario ancho" disabled={nuevo.nombre.trim().length < 2 || nuevo.pin.length !== 4} onClick={crearAdmin}>Agregar</button>
      </Hoja>

      <Hoja abierta={hojaPin} alCerrar={() => setHojaPin(false)} titulo="Cambiar mi PIN">
        <label className="campo">Nuevo PIN (4 dígitos)<input inputMode="numeric" maxLength={4} value={miPin} onChange={(e) => setMiPin(e.target.value.replace(/\D/g, ''))} /></label>
        <button type="button" className="btn-primario ancho" disabled={miPin.length !== 4} onClick={cambiarPin}>Guardar</button>
      </Hoja>
    </Pantalla>
  );
}
