import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export interface Sesion {
  adminId: number;
  nombre: string;
  esPrincipal: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sesion?: Sesion;
    }
  }
}

export function firmar(s: Sesion): string {
  return jwt.sign(s, config.jwtSecret, { expiresIn: '14h' });
}

/** Acepta el token en "Authorization: Bearer ..." o en ?token= (para <img> y descargas). */
export function requiereSesion(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : typeof req.query.token === 'string' ? req.query.token : null;
  if (!token) return res.status(401).json({ error: 'Sesión requerida' });
  try {
    const p = jwt.verify(token, config.jwtSecret) as Sesion;
    req.sesion = { adminId: p.adminId, nombre: p.nombre, esPrincipal: p.esPrincipal };
    next();
  } catch {
    res.status(401).json({ error: 'Sesión vencida, vuelva a ingresar' });
  }
}

export function requierePrincipal(req: Request, res: Response, next: NextFunction) {
  if (!req.sesion?.esPrincipal) return res.status(403).json({ error: 'Solo el administrador principal puede hacer esto' });
  next();
}
