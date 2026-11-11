import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { leerSesion } from './api';
import Ingreso from './pages/Ingreso';
import Escanear from './pages/Escanear';
import Invitados from './pages/Invitados';
import Enviar from './pages/Enviar';
import Ajustes from './pages/Ajustes';
import './styles.css';

function Protegida({ children }: { children: React.ReactElement }) {
  return leerSesion() ? children : <Navigate to="/" replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Ingreso />} />
        <Route path="/escanear" element={<Protegida><Escanear /></Protegida>} />
        <Route path="/invitados" element={<Protegida><Invitados /></Protegida>} />
        <Route path="/enviar" element={<Protegida><Enviar /></Protegida>} />
        <Route path="/ajustes" element={<Protegida><Ajustes /></Protegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
