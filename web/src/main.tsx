import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { esGestion, leerSesion } from './api';
import Ingreso from './pages/Ingreso';
import Escanear from './pages/Escanear';
import Invitados from './pages/Invitados';
import Enviar from './pages/Enviar';
import Ajustes from './pages/Ajustes';
import Premios from './pages/Premios';
import Proyector from './pages/Proyector';
import './styles.css';

/** Requiere sesión; con "gestion", además perfil Principal o Administrador (el Host vuelve a Escanear). */
function Protegida({ children, gestion }: { children: React.ReactElement; gestion?: boolean }) {
  if (!leerSesion()) return <Navigate to="/" replace />;
  if (gestion && !esGestion()) return <Navigate to="/escanear" replace />;
  return children;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Ingreso />} />
        <Route path="/escanear" element={<Protegida><Escanear /></Protegida>} />
        <Route path="/invitados" element={<Protegida gestion><Invitados /></Protegida>} />
        <Route path="/enviar" element={<Protegida gestion><Enviar /></Protegida>} />
        <Route path="/premios" element={<Protegida gestion><Premios /></Protegida>} />
        <Route path="/proyector/:id" element={<Protegida gestion><Proyector /></Protegida>} />
        <Route path="/ajustes" element={<Protegida><Ajustes /></Protegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
