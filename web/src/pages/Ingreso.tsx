import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, guardarSesion, iniciales, leerSesion, NOMBRE_ROL, primerNombre, rolDe, type Admin } from '../api';
import { Aviso, Avatar, Cargando, Hoja } from '../components/Comunes';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function Ingreso() {
  const nav = useNavigate();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Admin | null>(null);
  const [pin, setPin] = useState('');
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoAdmins, setCargandoAdmins] = useState(true);

  useEffect(() => {
    if (leerSesion()) nav('/escanear', { replace: true });
    api<Admin[]>('/api/admins')
      .then(setAdmins)
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargandoAdmins(false));
  }, [nav]);

  async function entrar(p: string) {
    if (!sel) return;
    setCargando(true);
    setErrorPin(null);
    try {
      const r = await api<{ token: string; admin: Admin }>('/api/auth/login', { body: { adminId: sel.id, pin: p } });
      guardarSesion(r);
      nav('/escanear', { replace: true });
    } catch (e) {
      setErrorPin((e as Error).message);
      setPin('');
    } finally {
      setCargando(false);
    }
  }

  function tecla(t: string) {
    if (cargando) return;
    if (t === '⌫') return setPin((p) => p.slice(0, -1));
    if (!t) return;
    const p = (pin + t).slice(0, 4);
    setPin(p);
    if (p.length === 4) void entrar(p);
  }

  return (
    <div className="ingreso">
      <header className="ingreso-cabecera">
        <span className="sobretitulo">Grupo De Haseth</span>
        <h1 className="titulo-serif">Fiesta navideña 2026</h1>
        <span>Panel de administradores</span>
      </header>
      <section className="ingreso-cuerpo">
        <h2>¿Quién eres?</h2>
        <p className="tenue">Elige tu nombre de administrador para entrar.</p>
        <Aviso texto={error} />
        {cargandoAdmins && <Cargando texto="Cargando administradores…" />}
        <div className="rejilla-admins">
          {admins.map((a) => (
            <button key={a.id} type="button" className="tarjeta-admin" onClick={() => { setSel(a); setPin(''); setErrorPin(null); }}>
              <Avatar texto={iniciales(a.nombre)} color={a.color} tam={76} />
              <strong>{a.nombre}</strong>
              <span className="tenue">{NOMBRE_ROL[rolDe(a)]}</span>
            </button>
          ))}
        </div>
        <p className="tenue centro pie">¿No apareces? Otro administrador puede agregarte en Ajustes › Administradores.</p>
      </section>

      <Hoja abierta={!!sel} alCerrar={() => setSel(null)}>
        {sel && (
          <div className="pin">
            <Avatar texto={iniciales(sel.nombre)} color={sel.color} tam={72} />
            <h2>Hola, {primerNombre(sel.nombre)}</h2>
            <p className="tenue">Ingresa tu PIN de 4 dígitos</p>
            <div className="puntos" aria-label={`${pin.length} de 4 dígitos`}>
              {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'lleno' : ''} />)}
            </div>
            <Aviso texto={errorPin} />
            <div className="teclado">
              {TECLAS.map((t, i) => (
                <button key={i} type="button" disabled={!t || cargando} aria-label={t === '⌫' ? 'Borrar' : t || undefined}
                  className={t ? '' : 'vacia'} onClick={() => tecla(t)}>{t}</button>
              ))}
            </div>
            <button type="button" className="btn-texto" onClick={() => setSel(null)}>Cancelar</button>
          </div>
        )}
      </Hoja>
    </div>
  );
}
