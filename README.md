# Fiesta navideña 2026 · Grupo De Haseth

App web para **tablet** (se abre desde el navegador; no se instala desde tiendas) para que los **administradores**:

- Entren eligiendo su nombre + PIN.
- **Escaneen el QR** de cada invitado con la cámara de la tablet y registren su llegada (o lo busquen por nombre si no trae QR).
- **Carguen invitados desde Excel**.
- **Envíen la invitación por WhatsApp (360dialog) y/o correo**: 2 imágenes → el **arte general** + un **pase QR personalizado** (nombre, código y QR únicos).
- Exporten la lista de llegadas a Excel.

## Cómo funciona

```
Tablet (navegador)  ──HTTPS──▶  App en Railway (web + servidor Node)  ──HTTPS + OAuth2──▶  Oracle APEX (APIs REST / ORDS)  ──▶  Tablas FN_*
                                     │
                                     ├─▶ 360dialog (WhatsApp)
                                     └─▶ SMTP (correo)
```

- **Oracle APEX** guarda los datos y los expone como APIs REST (módulo `fiesta/v1`).
- **El servidor Node** (en Railway) sirve la app web, valida el PIN de los administradores, genera el pase QR
  y envía por WhatsApp y correo. Guarda las claves (APEX, 360dialog, SMTP), que nunca llegan a la tablet.
- **La tablet** solo habla con el servidor Node.

## Estructura

```
fiesta-navidena-haseth/
├─ db/                 Scripts para Oracle APEX: tablas, paquete FN_API, APIs REST y seguridad OAuth2
├─ api/                Servidor Node.js + Express + TypeScript (consume APEX, pase QR, correo, WhatsApp)
│  └─ src/
│     ├─ apex.ts       Cliente de las APIs de APEX (token OAuth2 + llamadas)
│     ├─ routes/       auth · evento · invitados · checkin · envios
│     └─ services/     pase (imagen QR) · correo (SMTP) · whatsapp360 (360dialog) · datos
└─ web/                App React + Vite + TypeScript (PWA para la tablet)
   └─ src/pages/       Ingreso · Escanear · Invitados · Enviar · Ajustes
```

## 1. Oracle APEX: tablas y APIs REST

En APEX, entre a **SQL Workshop › SQL Scripts**, suba cada archivo de `db/` y ejecútelo **en este orden**:

| Script | Qué hace |
|---|---|
| `01_tablas.sql` | Crea las tablas `FN_EVENTO`, `FN_ADMIN`, `FN_INVITADO`, `FN_ENVIO`, `FN_ESCANEO` |
| `02_datos_iniciales.sql` | Crea el evento (fecha, hora, lugar, mensaje) |
| `03_paquete_fn_api.sql` | Paquete PL/SQL `FN_API` con toda la lógica (responde JSON) |
| `04_servicios_rest.sql` | Publica el módulo REST `fiesta.v1` (aparece en **SQL Workshop › RESTful Services**) |
| `05_seguridad_oauth.sql` | Protege el módulo con OAuth2 y crea el cliente `fiesta_railway`. **Copie el CLIENT_ID y CLIENT_SECRET que muestra** |

Requisitos: Oracle 19c o superior y ORDS 23.3 o superior (en apex.oracle.com y Autonomous Database ya se cumple).
El esquema debe estar habilitado para REST: en **SQL Workshop › RESTful Services**, si aparece *Register Schema with ORDS*, acéptelo.
Ahí mismo verá el **alias** del esquema, que forma la URL de las APIs.

`99_borrar_todo.sql` elimina todo (módulo, paquete y tablas) para empezar de cero.

### APIs publicadas

URL base: `https://SU-SERVIDOR/ords/ALIAS/fiesta/v1` (en apex.oracle.com: `https://apex.oracle.com/pls/apex/ALIAS/fiesta/v1`).

| Método | Ruta | Cuerpo / parámetros | Respuesta |
|---|---|---|---|
| GET | `/admins` | | `[{id, nombre, esPrincipal, color}]` |
| POST | `/admins` | `{nombre, pinHash, esPrincipal, color}` | `{id}` |
| GET | `/admins/:id` | | `{id, nombre, pinHash, esPrincipal, color}` |
| PUT | `/admins/:id/pin` | `{pinHash}` | `{ok}` |
| DELETE | `/admins/:id` | | `{ok}` |
| GET | `/evento` | | datos del evento activo |
| PUT | `/evento` | campos a cambiar (`nombre`, `hora`, `lugar`, `mensaje`, `temaPase`…) | evento actualizado |
| GET | `/evento/arte` | | imagen (PNG/JPG) |
| PUT | `/evento/arte?nombre=arte.png` | bytes de la imagen (`Content-Type: image/png`) | `{ok}` |
| GET | `/invitados` | | lista con estado de envío y llegada |
| GET | `/invitados/resumen` | | `{total, llegaron, faltan, enviadas, pendientes}` |
| POST | `/invitados/importar` | `{invitados:[{nombre, correo, whatsapp, area, token}]}` | `{creados, actualizados}` |
| GET | `/invitados/:id` | | invitado con `token` del QR |
| DELETE | `/invitados/:id` | | `{ok}` |
| POST | `/checkin/qr` | `{token, valor, adminId}` | `{resultado: OK\|DUPLICADO\|INVALIDO, invitado}` |
| POST | `/checkin/manual` | `{invitadoId, adminId}` | igual que el anterior |
| GET | `/checkin/recientes?limite=30` | | últimas llegadas |
| DELETE | `/checkin/:id` | | `{ok}` (deshace una llegada) |
| POST | `/envios` | `{invitadoId, canal, estado, detalle, proveedorId, adminId}` | `{ok}` |

Todas requieren `Authorization: Bearer TOKEN`. El token se pide así:

```bash
curl -u CLIENT_ID:CLIENT_SECRET -d grant_type=client_credentials https://SU-SERVIDOR/ords/ALIAS/oauth/token
```

Los errores se responden como `{"error":"mensaje"}` con código 400, 404 o 500.

## 2. Configuración del servidor (local)

Requisitos: Node.js 22.

```bash
npm install
cp api/.env.example api/.env      # en Windows: copy api\.env.example api\.env
```

Complete en `api/.env`: `APEX_BASE_URL`, `APEX_CLIENT_ID`, `APEX_CLIENT_SECRET`, `JWT_SECRET`, y si ya los tiene, SMTP y 360dialog.

Primer administrador: ponga `ADMIN_INICIAL_NOMBRE` y `ADMIN_INICIAL_PIN` en `.env` (se crea al arrancar si no hay ninguno), o:

```bash
npm run crear-admin -w api -- "Juan Stephens" 1234 --principal
```

Luego, desde la app (Ajustes › Administradores) se agregan los demás y se sube el **arte** de la invitación.

## 3. Ejecutar en desarrollo

En dos terminales:

```bash
npm run dev:api     # servidor en http://localhost:4000
npm run dev:web     # web en http://localhost:5173 (redirige /api al servidor)
```

## 4. Despliegue en Railway

El repositorio trae `railway.json`: Railway instala, ejecuta `npm run build` (web + servidor) y arranca con `npm start`.
Un solo servicio sirve la app web y el servidor en el mismo dominio.

1. En Railway: **New Project › Deploy from GitHub repo** y elija este repositorio.
2. En el servicio, pestaña **Variables**, agregue:

   | Variable | Valor |
   |---|---|
   | `APEX_BASE_URL` | `https://SU-SERVIDOR/ords/ALIAS` (sin `/fiesta/v1`) |
   | `APEX_CLIENT_ID` / `APEX_CLIENT_SECRET` | los que mostró `05_seguridad_oauth.sql` |
   | `JWT_SECRET` | texto largo y aleatorio |
   | `TZ` | `America/Panama` |
   | `ADMIN_INICIAL_NOMBRE` / `ADMIN_INICIAL_PIN` | primer administrador (solo la primera vez) |
   | `SMTP_*` | datos del correo |
   | `D360_API_KEY`, `WA_TEMPLATE_INVITACION`, `WA_TEMPLATE_PASE`, `WA_TEMPLATE_LANG`, `WA_CODIGO_PAIS` | WhatsApp |

   No defina `PORT`: Railway lo asigna solo.
3. **Settings › Networking › Generate Domain** para obtener la URL `https://...up.railway.app` (con HTTPS, necesario para la cámara).
4. Verifique:
   - `https://SU-DOMINIO/api/salud` → `{"ok":true}` (la app está arriba).
   - `https://SU-DOMINIO/api/salud/apex` → `{"apex":"ok", ...}` (Railway llega a las APIs de APEX).
5. Abra la URL en la tablet y entre con el administrador inicial. Luego borre `ADMIN_INICIAL_PIN`.

En la tablet, use "Agregar a pantalla de inicio" para que se abra a pantalla completa, como una app.

## WhatsApp con 360dialog

Los mensajes que inicia la empresa deben ser **plantillas aprobadas por Meta**. Cree en 360dialog dos plantillas (categoría *Marketing* o *Utility*, idioma español):

| Variable `.env`          | Encabezado | Cuerpo sugerido |
|--------------------------|-----------|-----------------|
| `WA_TEMPLATE_INVITACION` | Imagen    | `Hola {{1}}, Grupo De Haseth tiene el placer de invitarte a nuestra Fiesta navideña 2026. ¡Te esperamos!` |
| `WA_TEMPLATE_PASE`       | Imagen    | `Este es tu pase de entrada personal ({{1}}). Preséntalo en la entrada del evento.` |

La API sube el arte una vez, genera el pase de cada invitado, lo sube y envía ambas plantillas. Los números de 8 dígitos se completan con el código de país `WA_CODIGO_PAIS` (507).

## Correo

Se envía con SMTP (`nodemailer`): el texto del mensaje + las 2 imágenes dentro del correo y como adjuntos.

## Pase QR

- El QR contiene `FNH:` + un token aleatorio único por invitado (no adivinable). El código visible es `HAS-001`, `HAS-002`, …
- El pase usa las tipografías del arte (**Playfair Display** y **Montserrat**, licencia OFL), incluidas en `api/fonts/`, para verse igual en cualquier servidor.

## Excel de invitados

Columnas reconocidas (encabezado en la fila 1): **Nombre** (obligatoria), **Correo**, **WhatsApp** (o Celular/Teléfono), **Área** (o Departamento).
Descargue la plantilla desde la pantalla *Invitados*. Si un nombre ya existe se actualizan sus datos; los nuevos reciben código y QR.
