import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, descargar, DETALLE_ROL, guardarSesion, iniciales, leerSesion, miRol, NOMBRE_ROL, rolDe, urlApi, type Admin, type Evento, type Rol } from '../api';
import { Aviso, Avatar, Cargando, Hoja, Pantalla, Segmentado } from '../components/Comunes';

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
  const rol = miRol();
  const principal = rol === 'PRINCIPAL';
  const [ev, setEv] = useState<Evento | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [canales, setCanales] = useState<{ whatsapp: boolean; correo: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [versionArte, setVersionArte] = useState(0);
  const [hojaAdmin, setHojaAdmin] = useState(false);
  const [hojaPin, setHojaPin] = useState(false);
  const [nuevo, setNuevo] = useState<{ nombre: string; pin: string; rol: Rol }>({ nombre: '', pin: '', rol: 'HOST' });
  const [editando, setEditando] = useState<{ admin: Admin; rol: Rol } | null>(null);
  const [miPin, setMiPin] = useState('');

  async function cargar() {
    if (!principal) return; // los demás perfiles solo ven "Mi cuenta"
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
      setNuevo({ nombre: '', pin: '', rol: 'HOST' });
      setAdmins(await api<Admin[]>('/api/admins'));
      setOk('Usuario agregado');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function quitarAdmin(a: Admin) {
    if (!confirm(`¿Quitar a ${a.nombre}? Ya no podrá entrar a la app.`)) return;
    try {
      await api(`/api/admins/${a.id}`, { method: 'DELETE' });
      setEditando(null);
      setAdmins(await api<Admin[]>('/api/admins'));
      setOk(`${a.nombre} ya no tiene acceso`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cambiarRol() {
    if (!editando) return;
    try {
      await api(`/api/admins/${editando.admin.id}`, { method: 'PUT', body: { rol: editando.rol } });
      setAdmins(await api<Admin[]>('/api/admins'));
      setOk(`${editando.admin.nombre} ahora es ${NOMBRE_ROL[editando.rol]}`);
      setEditando(null);
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
      <div className="scroll ajustes">
        <span className="rotulo">Mi cuenta</span>
        <div className="tarjeta">
          <div className="fila-ajuste">
            <Avatar texto={iniciales(yo?.nombre ?? '')} color={yo?.color} tam={36} />
            <span className="fila-texto"><span>{yo?.nombre}</span><span className="tenue chico">{NOMBRE_ROL[rol]} · {DETALLE_ROL[rol]}</span></span>
          </div>
          <button type="button" className="fila-ajuste btn-fila verde" onClick={() => setHojaPin(true)}>Cambiar mi PIN</button>
          <button type="button" className="fila-ajuste btn-fila rojo" onClick={salir}>Cerrar sesión</button>
        </div>

        {principal && (
          <>
            <span className="rotulo">Usuarios</span>
            <div className="tarjeta">
              {admins.map((a) => (
                <button key={a.id} type="button" className="fila-ajuste btn-fila" disabled={a.id === yo?.id}
                  onClick={() => setEditando({ admin: a, rol: rolDe(a) })} aria-label={`Editar perfil de ${a.nombre}`}>
                  <Avatar texto={iniciales(a.nombre)} color={a.color} tam={36} />
                  <span className="fila-texto"><span>{a.nombre}{a.id === yo?.id ? ' (tú)' : ''}</span><span className="tenue chico">{NOMBRE_ROL[rolDe(a)]}</span></span>
                  {a.id !== yo?.id && <span className="verde chico negrita">Cambiar</span>}
                </button>
              ))}
              <button type="button" className="fila-ajuste btn-fila verde" onClick={() => setHojaAdmin(true)}>Agregar usuario</button>
            </div>

            <span className="rotulo">Evento</span>
            <div className="tarjeta">
              {!ev && !error && <Cargando texto="Cargando datos del evento…" />}
              {ev && CAMPOS.map((c) => (
                <label key={c.k} className="fila-ajuste">
                  <span>{c.t}</span>
                  <input defaultValue={ev[c.k] ?? ''} key={`${c.k}-${ev[c.k]}`}
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
                <label className="btn-pildora gris">
                  Cambiar
                  <input type="file" accept="image/png,image/jpeg" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirArte(f); }} />
                </label>
              </div>
              <div className="fila-ajuste">
                <span>Imagen 2 · Color del pase QR</span>
                <div className="fila-gap">
                  {(['rojo', 'verde'] as const).map((t) => (
                    <button key={t} type="button" aria-pressed={ev?.temaPase === t} aria-label={t === 'rojo' ? 'Rojo' : 'Verde'}
                      className={'muestra ' + t + (ev?.temaPase === t ? ' activa' : '')} onClick={() => guardar({ temaPase: t })} />
                  ))}
                </div>
              </div>
            </div>

            <span className="rotulo">Canales de envío</span>
            <div className="tarjeta">
              <div className="fila-ajuste"><span>WhatsApp (360dialog)</span><span className={'pastilla ' + (canales?.whatsapp ? 'ok' : 'pend')}>{canales?.whatsapp ? 'Configurado' : 'Sin configurar'}</span></div>
              <div className="fila-ajuste"><span>Correo (SMTP)</span><span className={'pastilla ' + (canales?.correo ? 'ok' : 'pend')}>{canales?.correo ? 'Configurado' : 'Sin configurar'}</span></div>
            </div>

            <span className="rotulo">Datos</span>
            <div className="tarjeta">
              <button type="button" className="fila-ajuste btn-fila verde" onClick={() => descargar('/api/invitados/exportar.xlsx', 'llegadas_fiesta_2026.xlsx')}>Exportar llegadas a Excel</button>
            </div>
          </>
        )}
        {!principal && <p className="tenue chico relleno centro">Los usuarios y los datos del evento solo los cambia el administrador principal.</p>}
      </div>

      <Hoja abierta={hojaAdmin} alCerrar={() => setHojaAdmin(false)} titulo="Nuevo usuario">
        <label className="campo">Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
        <label className="campo">PIN (4 dígitos)<input inputMode="numeric" maxLength={4} value={nuevo.pin} onChange={(e) => setNuevo({ ...nuevo, pin: e.target.value.replace(/\D/g, '') })} /></label>
        <SelectorRol valor={nuevo.rol} onChange={(r) => setNuevo({ ...nuevo, rol: r })} />
        <button type="button" className="btn-primario ancho" disabled={nuevo.nombre.trim().length < 2 || nuevo.pin.length !== 4} onClick={crearAdmin}>Agregar</button>
      </Hoja>

      <Hoja abierta={!!editando} alCerrar={() => setEditando(null)} titulo={editando ? editando.admin.nombre : undefined}>
        {editando && (
          <>
            <SelectorRol valor={editando.rol} onChange={(r) => setEditando({ ...editando, rol: r })} />
            <button type="button" className="btn-primario ancho" disabled={editando.rol === rolDe(editando.admin)} onClick={cambiarRol}>Guardar perfil</button>
            <button type="button" className="btn-texto rojo" onClick={() => quitarAdmin(editando.admin)}>Quitar acceso</button>
          </>
        )}
      </Hoja>

      <Hoja abierta={hojaPin} alCerrar={() => setHojaPin(false)} titulo="Cambiar mi PIN">
        <label className="campo">Nuevo PIN (4 dígitos)<input inputMode="numeric" maxLength={4} value={miPin} onChange={(e) => setMiPin(e.target.value.replace(/\D/g, ''))} /></label>
        <button type="button" className="btn-primario ancho" disabled={miPin.length !== 4} onClick={cambiarPin}>Guardar</button>
      </Hoja>
    </Pantalla>
  );
}

/** Elegir perfil, con la explicación de lo que puede hacer. */
function SelectorRol({ valor, onChange }: { valor: Rol; onChange: (r: Rol) => void }) {
  return (
    <div className="campo">
      Perfil
      <Segmentado etiqueta="Perfil" valor={valor} onChange={onChange}
        opciones={(['HOST', 'ADMIN', 'PRINCIPAL'] as Rol[]).map((r) => ({ v: r, t: r === 'PRINCIPAL' ? 'Principal' : NOMBRE_ROL[r] }))} />
      <small className="tenue">{DETALLE_ROL[valor]}</small>
    </div>
  );
}
