-- =====================================================================
-- Paquete FN_API: lógica de las APIs REST de la Fiesta navideña.
-- Cada procedimiento responde JSON (usado por los handlers de ORDS en 04_servicios_rest.sql).
-- Requiere Oracle 19c o superior.
-- Ejecutar en APEX › SQL Workshop › SQL Scripts (o SQL*Plus / SQL Developer).
-- =====================================================================

CREATE OR REPLACE PACKAGE FN_API AS
  -- Código HTTP de la última respuesta (el handler lo asigna a :status_code)
  FUNCTION estado RETURN NUMBER;
  -- Fecha en formato ISO-8601 UTC, p. ej. 2026-12-05T00:05:00Z
  FUNCTION iso(p_fecha TIMESTAMP WITH TIME ZONE) RETURN VARCHAR2;

  -- Administradores
  PROCEDURE admins_listar;
  PROCEDURE admin_obtener(p_id VARCHAR2);
  PROCEDURE admin_crear(p_body CLOB);
  PROCEDURE admin_cambiar_pin(p_id VARCHAR2, p_body CLOB);
  PROCEDURE admin_desactivar(p_id VARCHAR2);

  -- Evento
  PROCEDURE evento_obtener;
  PROCEDURE evento_actualizar(p_body CLOB);
  PROCEDURE evento_arte_guardar(p_arte BLOB, p_mime VARCHAR2, p_nombre VARCHAR2);

  -- Invitados
  PROCEDURE invitados_listar;
  PROCEDURE invitados_resumen;
  PROCEDURE invitado_obtener(p_id VARCHAR2);
  PROCEDURE invitados_importar(p_body CLOB);
  PROCEDURE invitado_crear(p_body CLOB);
  PROCEDURE invitado_actualizar(p_id VARCHAR2, p_body CLOB);
  PROCEDURE invitado_desactivar(p_id VARCHAR2);

  -- Llegadas
  PROCEDURE checkin_qr(p_body CLOB);
  PROCEDURE checkin_manual(p_body CLOB);
  PROCEDURE checkin_recientes(p_limite VARCHAR2);
  PROCEDURE checkin_deshacer(p_id VARCHAR2);

  -- Envíos
  PROCEDURE envio_registrar(p_body CLOB);
END FN_API;
/

CREATE OR REPLACE PACKAGE BODY FN_API AS

  g_estado NUMBER := 200;

  -- -------------------------------------------------------------------
  -- Utilidades
  -- -------------------------------------------------------------------
  FUNCTION estado RETURN NUMBER IS
  BEGIN
    RETURN g_estado;
  END;

  FUNCTION iso(p_fecha TIMESTAMP WITH TIME ZONE) RETURN VARCHAR2 IS
  BEGIN
    IF p_fecha IS NULL THEN RETURN NULL; END IF;
    RETURN TO_CHAR(SYS_EXTRACT_UTC(p_fecha), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END;

  -- Escribe la respuesta JSON en trozos (soporta respuestas grandes).
  PROCEDURE responder(p_json CLOB, p_estado NUMBER DEFAULT 200) IS
    l_pos PLS_INTEGER := 1;
    l_len PLS_INTEGER := NVL(DBMS_LOB.GETLENGTH(p_json), 0);
  BEGIN
    g_estado := p_estado;
    OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
    WHILE l_pos <= l_len LOOP
      HTP.PRN(DBMS_LOB.SUBSTR(p_json, 8000, l_pos));
      l_pos := l_pos + 8000;
    END LOOP;
  END;

  PROCEDURE responder_error(p_estado NUMBER, p_mensaje VARCHAR2) IS
    l JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    l.put('error', p_mensaje);
    responder(l.to_clob, p_estado);
  END;

  -- Convierte la excepción actual en respuesta HTTP.
  -- ORA-20400 → 400, ORA-20404 → 404, ORA-20409 → 409, cualquier otro → 500.
  PROCEDURE fallo IS
    l_codigo NUMBER := SQLCODE;
    l_msg    VARCHAR2(4000) := REGEXP_REPLACE(SQLERRM, '^ORA-[0-9]+: ', '');
  BEGIN
    ROLLBACK;
    responder_error(
      CASE l_codigo WHEN -20400 THEN 400 WHEN -20404 THEN 404 WHEN -20409 THEN 409 ELSE 500 END,
      l_msg);
  END;

  PROCEDURE ok IS
  BEGIN
    responder('{"ok":true}');
  END;

  FUNCTION cuerpo(p_body CLOB) RETURN JSON_OBJECT_T IS
  BEGIN
    IF p_body IS NULL OR DBMS_LOB.GETLENGTH(p_body) = 0 THEN
      RAISE_APPLICATION_ERROR(-20400, 'Falta el cuerpo JSON de la petición');
    END IF;
    RETURN JSON_OBJECT_T.parse(p_body);
  END;

  FUNCTION a_numero(p_valor VARCHAR2) RETURN NUMBER IS
  BEGIN
    RETURN TO_NUMBER(p_valor);
  EXCEPTION WHEN VALUE_ERROR OR INVALID_NUMBER THEN
    RAISE_APPLICATION_ERROR(-20400, 'Identificador inválido: ' || p_valor);
  END;

  FUNCTION ev_activo RETURN NUMBER IS
    l_id NUMBER;
  BEGIN
    SELECT id INTO l_id FROM fn_evento WHERE activo = 'S' ORDER BY id DESC FETCH FIRST 1 ROWS ONLY;
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20500, 'No hay un evento activo en FN_EVENTO');
  END;


  -- Nota: las funciones privadas (ev_activo, a_numero) y los métodos de JSON_OBJECT_T
  -- no se pueden usar dentro de sentencias SQL; por eso primero se pasan a variables locales.

  -- -------------------------------------------------------------------
  -- Administradores
  -- -------------------------------------------------------------------
  PROCEDURE admins_listar IS
    l CLOB;
  BEGIN
    SELECT JSON_ARRAYAGG(
             JSON_OBJECT(
               'id'          VALUE id,
               'nombre'      VALUE nombre,
               'esPrincipal' VALUE (CASE WHEN es_principal = 'S' THEN 'true' ELSE 'false' END) FORMAT JSON,
               'color'       VALUE color)
             ORDER BY es_principal DESC, nombre RETURNING CLOB)
      INTO l
      FROM fn_admin
     WHERE activo = 'S';
    responder(NVL(l, '[]'));
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- Incluye el hash del PIN: solo debe consumirlo el servidor de la app (protegido con OAuth2).
  PROCEDURE admin_obtener(p_id VARCHAR2) IS
    l    CLOB;
    l_id NUMBER;
  BEGIN
    l_id := a_numero(p_id);
    SELECT JSON_OBJECT(
             'id'          VALUE id,
             'nombre'      VALUE nombre,
             'pinHash'     VALUE pin_hash,
             'esPrincipal' VALUE (CASE WHEN es_principal = 'S' THEN 'true' ELSE 'false' END) FORMAT JSON,
             'color'       VALUE color
             RETURNING CLOB)
      INTO l
      FROM fn_admin
     WHERE id = l_id AND activo = 'S';
    responder(l);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN responder_error(404, 'Administrador no encontrado');
    WHEN OTHERS THEN fallo;
  END;

  -- Cuerpo: {"nombre":"...","pinHash":"$2b$...","esPrincipal":false,"color":"#146B47"}
  PROCEDURE admin_crear(p_body CLOB) IS
    o           JSON_OBJECT_T;
    l_nombre    fn_admin.nombre%TYPE;
    l_hash      fn_admin.pin_hash%TYPE;
    l_principal CHAR(1) := 'N';
    l_color     fn_admin.color%TYPE;
    l_id        NUMBER;
  BEGIN
    o := cuerpo(p_body);
    l_nombre := SUBSTR(TRIM(o.get_string('nombre')), 1, 120);
    l_hash   := o.get_string('pinHash');
    l_color  := NVL(SUBSTR(o.get_string('color'), 1, 9), '#146B47');
    IF o.has('esPrincipal') THEN
      IF o.get_boolean('esPrincipal') THEN l_principal := 'S'; END IF;
    END IF;
    IF l_nombre IS NULL OR l_hash IS NULL THEN
      RAISE_APPLICATION_ERROR(-20400, 'nombre y pinHash son obligatorios');
    END IF;

    INSERT INTO fn_admin (nombre, pin_hash, es_principal, color)
    VALUES (l_nombre, l_hash, l_principal, l_color)
    RETURNING id INTO l_id;
    COMMIT;
    responder('{"id":' || l_id || '}', 201);
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- Cuerpo: {"pinHash":"$2b$..."}
  PROCEDURE admin_cambiar_pin(p_id VARCHAR2, p_body CLOB) IS
    o      JSON_OBJECT_T;
    l_id   NUMBER;
    l_hash fn_admin.pin_hash%TYPE;
  BEGIN
    l_id := a_numero(p_id);
    o := cuerpo(p_body);
    l_hash := o.get_string('pinHash');
    IF l_hash IS NULL THEN
      RAISE_APPLICATION_ERROR(-20400, 'pinHash es obligatorio');
    END IF;
    UPDATE fn_admin SET pin_hash = l_hash WHERE id = l_id AND activo = 'S';
    IF SQL%ROWCOUNT = 0 THEN RAISE_APPLICATION_ERROR(-20404, 'Administrador no encontrado'); END IF;
    COMMIT;
    ok;
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  PROCEDURE admin_desactivar(p_id VARCHAR2) IS
    l_id NUMBER;
  BEGIN
    l_id := a_numero(p_id);
    UPDATE fn_admin SET activo = 'N' WHERE id = l_id;
    IF SQL%ROWCOUNT = 0 THEN RAISE_APPLICATION_ERROR(-20404, 'Administrador no encontrado'); END IF;
    COMMIT;
    ok;
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- -------------------------------------------------------------------
  -- Evento
  -- -------------------------------------------------------------------
  PROCEDURE evento_obtener IS
    l    CLOB;
    l_ev NUMBER;
  BEGIN
    l_ev := ev_activo;
    SELECT JSON_OBJECT(
             'id'            VALUE id,
             'nombre'        VALUE nombre,
             'fechaTexto'    VALUE fecha_texto,
             'dia'           VALUE dia,
             'mesCorto'      VALUE mes_corto,
             'hora'          VALUE hora,
             'lugar'         VALUE lugar,
             'salon'         VALUE salon,
             'vestimenta'    VALUE vestimenta,
             'prefijoCodigo' VALUE prefijo_codigo,
             'temaPase'      VALUE tema_pase,
             'asuntoCorreo'  VALUE asunto_correo,
             'mensaje'       VALUE mensaje,
             'arteNombre'    VALUE arte_nombre,
             'arteMime'      VALUE arte_mime,
             'arteLargo'     VALUE NVL(DBMS_LOB.GETLENGTH(arte), 0),
             'tieneArte'     VALUE CASE WHEN arte IS NULL THEN 0 ELSE 1 END
             RETURNING CLOB)
      INTO l
      FROM fn_evento
     WHERE id = l_ev;
    responder(l);
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- Cuerpo: cualquiera de nombre, fechaTexto, dia, mesCorto, hora, lugar, salon, vestimenta,
  --         asuntoCorreo, mensaje, temaPase. Solo se cambian los campos enviados.
  PROCEDURE evento_actualizar(p_body CLOB) IS
    o    JSON_OBJECT_T;
    l_ev NUMBER;
    v    VARCHAR2(4000);
  BEGIN
    o := cuerpo(p_body);
    l_ev := ev_activo;
    IF o.has('nombre')       THEN v := o.get_string('nombre');       UPDATE fn_evento SET nombre        = SUBSTR(v, 1, 150)  WHERE id = l_ev; END IF;
    IF o.has('fechaTexto')   THEN v := o.get_string('fechaTexto');   UPDATE fn_evento SET fecha_texto   = SUBSTR(v, 1, 80)   WHERE id = l_ev; END IF;
    IF o.has('dia')          THEN v := o.get_string('dia');          UPDATE fn_evento SET dia           = SUBSTR(v, 1, 5)    WHERE id = l_ev; END IF;
    IF o.has('mesCorto')     THEN v := o.get_string('mesCorto');     UPDATE fn_evento SET mes_corto     = SUBSTR(v, 1, 10)   WHERE id = l_ev; END IF;
    IF o.has('hora')         THEN v := o.get_string('hora');         UPDATE fn_evento SET hora          = SUBSTR(v, 1, 30)   WHERE id = l_ev; END IF;
    IF o.has('lugar')        THEN v := o.get_string('lugar');        UPDATE fn_evento SET lugar         = SUBSTR(v, 1, 200)  WHERE id = l_ev; END IF;
    IF o.has('salon')        THEN v := o.get_string('salon');        UPDATE fn_evento SET salon         = SUBSTR(v, 1, 100)  WHERE id = l_ev; END IF;
    IF o.has('vestimenta')   THEN v := o.get_string('vestimenta');   UPDATE fn_evento SET vestimenta    = SUBSTR(v, 1, 80)   WHERE id = l_ev; END IF;
    IF o.has('asuntoCorreo') THEN v := o.get_string('asuntoCorreo'); UPDATE fn_evento SET asunto_correo = SUBSTR(v, 1, 200)  WHERE id = l_ev; END IF;
    IF o.has('mensaje')      THEN v := o.get_string('mensaje');      UPDATE fn_evento SET mensaje       = SUBSTR(v, 1, 2000) WHERE id = l_ev; END IF;
    IF o.has('temaPase') THEN
      v := o.get_string('temaPase');
      IF v IS NULL OR v NOT IN ('rojo', 'verde') THEN
        RAISE_APPLICATION_ERROR(-20400, 'temaPase debe ser rojo o verde');
      END IF;
      UPDATE fn_evento SET tema_pase = v WHERE id = l_ev;
    END IF;
    COMMIT;
    evento_obtener;
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  PROCEDURE evento_arte_guardar(p_arte BLOB, p_mime VARCHAR2, p_nombre VARCHAR2) IS
    l_mime   VARCHAR2(100);
    l_nombre VARCHAR2(200);
    l_ev     NUMBER;
  BEGIN
    l_mime   := LOWER(TRIM(REGEXP_SUBSTR(p_mime, '^[^;]+')));
    l_nombre := NVL(SUBSTR(p_nombre, 1, 200), 'arte');
    IF p_arte IS NULL OR DBMS_LOB.GETLENGTH(p_arte) = 0 THEN
      RAISE_APPLICATION_ERROR(-20400, 'Falta la imagen en el cuerpo de la petición');
    END IF;
    IF l_mime IS NULL OR l_mime NOT IN ('image/png', 'image/jpeg') THEN
      RAISE_APPLICATION_ERROR(-20400, 'La imagen debe ser PNG o JPG');
    END IF;
    l_ev := ev_activo;
    UPDATE fn_evento SET arte = p_arte, arte_mime = l_mime, arte_nombre = l_nombre WHERE id = l_ev;
    COMMIT;
    ok;
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- -------------------------------------------------------------------
  -- Invitados
  -- -------------------------------------------------------------------
  PROCEDURE invitados_listar IS
    l    CLOB;
    l_ev NUMBER;
  BEGIN
    l_ev := ev_activo;
    SELECT JSON_ARRAYAGG(
             JSON_OBJECT(
               'id'              VALUE v.id,
               'codigo'          VALUE v.codigo,
               'nombre'          VALUE v.nombre,
               'correo'          VALUE v.correo,
               'whatsapp'        VALUE v.whatsapp,
               'compania'        VALUE v.compania,
               'area'            VALUE v.area,
               'llegadaEn'       VALUE fn_api.iso(v.llegada_en),
               'llegadaVia'      VALUE v.llegada_via,
               'llegadaAdmin'    VALUE v.admin_nombre,
               'waEnviadoEn'     VALUE fn_api.iso(v.wa_en),
               'correoEnviadoEn' VALUE fn_api.iso(v.correo_en))
             ORDER BY v.nombre RETURNING CLOB)
      INTO l
      FROM (SELECT i.id, i.codigo, i.nombre, i.correo, i.whatsapp, i.compania, i.area,
                   i.llegada_en, i.llegada_via, a.nombre AS admin_nombre,
                   (SELECT MAX(e.enviado_en) FROM fn_envio e
                     WHERE e.invitado_id = i.id AND e.canal = 'WHATSAPP' AND e.estado = 'ENVIADO') AS wa_en,
                   (SELECT MAX(e.enviado_en) FROM fn_envio e
                     WHERE e.invitado_id = i.id AND e.canal = 'CORREO' AND e.estado = 'ENVIADO') AS correo_en
              FROM fn_invitado i
              LEFT JOIN fn_admin a ON a.id = i.llegada_admin_id
             WHERE i.evento_id = l_ev AND i.activo = 'S') v;
    responder(NVL(l, '[]'));
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  PROCEDURE invitados_resumen IS
    l_ev       NUMBER;
    l_total    NUMBER;
    l_llegaron NUMBER;
    l_enviadas NUMBER;
    o          JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    l_ev := ev_activo;
    SELECT COUNT(*),
           COUNT(i.llegada_en),
           NVL(SUM(CASE WHEN EXISTS (SELECT 1 FROM fn_envio e
                                      WHERE e.invitado_id = i.id AND e.estado = 'ENVIADO')
                        THEN 1 ELSE 0 END), 0)
      INTO l_total, l_llegaron, l_enviadas
      FROM fn_invitado i
     WHERE i.evento_id = l_ev AND i.activo = 'S';
    o.put('total', l_total);
    o.put('llegaron', l_llegaron);
    o.put('faltan', l_total - l_llegaron);
    o.put('enviadas', l_enviadas);
    o.put('pendientes', l_total - l_enviadas);
    responder(o.to_clob);
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- Incluye el token del QR: lo usa el servidor para generar el pase.
  PROCEDURE invitado_obtener(p_id VARCHAR2) IS
    l    CLOB;
    l_id NUMBER;
    l_ev NUMBER;
  BEGIN
    l_id := a_numero(p_id);
    l_ev := ev_activo;
    SELECT JSON_OBJECT(
             'id'       VALUE id,
             'codigo'   VALUE codigo,
             'token'    VALUE token_qr,
             'nombre'   VALUE nombre,
             'correo'   VALUE correo,
             'whatsapp' VALUE whatsapp,
             'compania' VALUE compania,
             'area'     VALUE area
             RETURNING CLOB)
      INTO l
      FROM fn_invitado
     WHERE id = l_id AND evento_id = l_ev AND activo = 'S';
    responder(l);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN responder_error(404, 'Invitado no encontrado');
    WHEN OTHERS THEN fallo;
  END;

  -- Cuerpo: {"invitados":[{"nombre":"...","correo":"...","whatsapp":"507...","compania":"...","area":"...","token":"..."}]}
  -- Si el nombre ya existe en el evento, actualiza correo/whatsapp/área; si no, lo crea con código y token.
  PROCEDURE invitados_importar(p_body CLOB) IS
    o           JSON_OBJECT_T;
    l_lista     JSON_ARRAY_T;
    f           JSON_OBJECT_T;
    l_ev        NUMBER;
    l_prefijo   fn_evento.prefijo_codigo%TYPE;
    l_siguiente NUMBER;
    l_id        NUMBER;
    l_nombre    fn_invitado.nombre%TYPE;
    l_correo    fn_invitado.correo%TYPE;
    l_whatsapp  fn_invitado.whatsapp%TYPE;
    l_area      fn_invitado.area%TYPE;
    l_compania  fn_invitado.compania%TYPE;
    l_token     fn_invitado.token_qr%TYPE;
    l_creados   NUMBER := 0;
    l_actual    NUMBER := 0;
    r           JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    o := cuerpo(p_body);
    l_lista := o.get_array('invitados');
    IF l_lista IS NULL OR l_lista.get_size = 0 THEN
      RAISE_APPLICATION_ERROR(-20400, 'La lista de invitados está vacía');
    END IF;

    l_ev := ev_activo;
    SELECT prefijo_codigo INTO l_prefijo FROM fn_evento WHERE id = l_ev;
    SELECT NVL(MAX(TO_NUMBER(REGEXP_SUBSTR(codigo, '[0-9]+$'))), 0) + 1
      INTO l_siguiente
      FROM fn_invitado
     WHERE evento_id = l_ev;

    FOR i IN 0 .. l_lista.get_size - 1 LOOP
      f := TREAT(l_lista.get(i) AS JSON_OBJECT_T);
      l_nombre   := SUBSTR(REGEXP_REPLACE(TRIM(f.get_string('nombre')), '\s+', ' '), 1, 150);
      l_correo   := SUBSTR(f.get_string('correo'), 1, 150);
      l_whatsapp := SUBSTR(f.get_string('whatsapp'), 1, 30);
      l_area     := SUBSTR(f.get_string('area'), 1, 100);
      l_compania := SUBSTR(f.get_string('compania'), 1, 100);
      l_token    := SUBSTR(f.get_string('token'), 1, 64);
      CONTINUE WHEN l_nombre IS NULL OR LENGTH(l_nombre) < 2;

      BEGIN
        SELECT id INTO l_id
          FROM fn_invitado
         WHERE evento_id = l_ev AND activo = 'S' AND UPPER(nombre) = UPPER(l_nombre)
         FETCH FIRST 1 ROWS ONLY;

        UPDATE fn_invitado
           SET correo   = NVL(l_correo, correo),
               whatsapp = NVL(l_whatsapp, whatsapp),
               area     = NVL(l_area, area),
               compania = NVL(l_compania, compania)
         WHERE id = l_id;
        l_actual := l_actual + 1;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        IF l_token IS NULL THEN
          RAISE_APPLICATION_ERROR(-20400, 'Falta el token del QR para ' || l_nombre);
        END IF;
        INSERT INTO fn_invitado (evento_id, codigo, token_qr, nombre, correo, whatsapp, compania, area)
        VALUES (l_ev, l_prefijo || '-' || LPAD(l_siguiente, GREATEST(3, LENGTH(l_siguiente)), '0'), l_token,
                l_nombre, l_correo, l_whatsapp, l_compania, l_area);
        l_siguiente := l_siguiente + 1;
        l_creados := l_creados + 1;
      END;
    END LOOP;

    COMMIT;
    r.put('creados', l_creados);
    r.put('actualizados', l_actual);
    responder(r.to_clob);
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- Cuerpo: {"nombre":"...","correo":"...","whatsapp":"507...","compania":"...","area":"...","token":"..."}
  -- Crea un invitado con el siguiente código (HAS-###). 409 si ya existe ese nombre.
  PROCEDURE invitado_crear(p_body CLOB) IS
    o           JSON_OBJECT_T;
    l_ev        NUMBER;
    l_prefijo   fn_evento.prefijo_codigo%TYPE;
    l_siguiente NUMBER;
    l_existe    NUMBER;
    l_id        NUMBER;
    l_nombre    fn_invitado.nombre%TYPE;
    l_correo    fn_invitado.correo%TYPE;
    l_whatsapp  fn_invitado.whatsapp%TYPE;
    l_area      fn_invitado.area%TYPE;
    l_compania  fn_invitado.compania%TYPE;
    l_token     fn_invitado.token_qr%TYPE;
    l_codigo    fn_invitado.codigo%TYPE;
    r           JSON_OBJECT_T := JSON_OBJECT_T();
  BEGIN
    o := cuerpo(p_body);
    l_nombre   := SUBSTR(REGEXP_REPLACE(TRIM(o.get_string('nombre')), '\s+', ' '), 1, 150);
    l_correo   := SUBSTR(o.get_string('correo'), 1, 150);
    l_whatsapp := SUBSTR(o.get_string('whatsapp'), 1, 30);
    l_area     := SUBSTR(o.get_string('area'), 1, 100);
    l_compania := SUBSTR(o.get_string('compania'), 1, 100);
    l_token    := SUBSTR(o.get_string('token'), 1, 64);
    IF l_nombre IS NULL OR LENGTH(l_nombre) < 2 THEN
      RAISE_APPLICATION_ERROR(-20400, 'El nombre es obligatorio');
    END IF;
    IF l_token IS NULL THEN
      RAISE_APPLICATION_ERROR(-20400, 'Falta el token del QR');
    END IF;

    l_ev := ev_activo;
    SELECT COUNT(*) INTO l_existe
      FROM fn_invitado
     WHERE evento_id = l_ev AND activo = 'S' AND UPPER(nombre) = UPPER(l_nombre);
    IF l_existe > 0 THEN
      RAISE_APPLICATION_ERROR(-20409, 'Ya existe un invitado con el nombre ' || l_nombre);
    END IF;

    SELECT prefijo_codigo INTO l_prefijo FROM fn_evento WHERE id = l_ev;
    SELECT NVL(MAX(TO_NUMBER(REGEXP_SUBSTR(codigo, '[0-9]+$'))), 0) + 1
      INTO l_siguiente
      FROM fn_invitado
     WHERE evento_id = l_ev;
    l_codigo := l_prefijo || '-' || LPAD(l_siguiente, GREATEST(3, LENGTH(l_siguiente)), '0');

    INSERT INTO fn_invitado (evento_id, codigo, token_qr, nombre, correo, whatsapp, compania, area)
    VALUES (l_ev, l_codigo, l_token, l_nombre, l_correo, l_whatsapp, l_compania, l_area)
    RETURNING id INTO l_id;
    COMMIT;

    r.put('id', l_id);
    r.put('codigo', l_codigo);
    responder(r.to_clob, 201);
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- Cuerpo: cualquiera de {"nombre","correo","whatsapp","compania","area"}. Solo cambia los campos enviados
  -- (un campo enviado como null o "" se borra, salvo el nombre, que es obligatorio).
  PROCEDURE invitado_actualizar(p_id VARCHAR2, p_body CLOB) IS
    o        JSON_OBJECT_T;
    l_id     NUMBER;
    l_ev     NUMBER;
    l_existe NUMBER;
    l_nombre fn_invitado.nombre%TYPE;
    v        VARCHAR2(4000);
  BEGIN
    l_id := a_numero(p_id);
    o := cuerpo(p_body);
    l_ev := ev_activo;

    SELECT COUNT(*) INTO l_existe FROM fn_invitado WHERE id = l_id AND evento_id = l_ev AND activo = 'S';
    IF l_existe = 0 THEN
      RAISE_APPLICATION_ERROR(-20404, 'Invitado no encontrado');
    END IF;

    IF o.has('nombre') THEN
      l_nombre := SUBSTR(REGEXP_REPLACE(TRIM(o.get_string('nombre')), '\s+', ' '), 1, 150);
      IF l_nombre IS NULL OR LENGTH(l_nombre) < 2 THEN
        RAISE_APPLICATION_ERROR(-20400, 'El nombre es obligatorio');
      END IF;
      SELECT COUNT(*) INTO l_existe
        FROM fn_invitado
       WHERE evento_id = l_ev AND activo = 'S' AND UPPER(nombre) = UPPER(l_nombre) AND id <> l_id;
      IF l_existe > 0 THEN
        RAISE_APPLICATION_ERROR(-20409, 'Ya existe otro invitado con el nombre ' || l_nombre);
      END IF;
      UPDATE fn_invitado SET nombre = l_nombre WHERE id = l_id;
    END IF;
    IF o.has('correo')   THEN v := SUBSTR(o.get_string('correo'), 1, 150);  UPDATE fn_invitado SET correo   = v WHERE id = l_id; END IF;
    IF o.has('whatsapp') THEN v := SUBSTR(o.get_string('whatsapp'), 1, 30); UPDATE fn_invitado SET whatsapp = v WHERE id = l_id; END IF;
    IF o.has('area')     THEN v := SUBSTR(o.get_string('area'), 1, 100);    UPDATE fn_invitado SET area     = v WHERE id = l_id; END IF;
    IF o.has('compania') THEN v := SUBSTR(o.get_string('compania'), 1, 100); UPDATE fn_invitado SET compania = v WHERE id = l_id; END IF;
    COMMIT;
    ok;
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  PROCEDURE invitado_desactivar(p_id VARCHAR2) IS
    l_id NUMBER;
  BEGIN
    l_id := a_numero(p_id);
    UPDATE fn_invitado SET activo = 'N' WHERE id = l_id;
    IF SQL%ROWCOUNT = 0 THEN RAISE_APPLICATION_ERROR(-20404, 'Invitado no encontrado'); END IF;
    COMMIT;
    ok;
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- -------------------------------------------------------------------
  -- Llegadas
  -- -------------------------------------------------------------------
  -- Registra la llegada (solo si aún no había llegado) y responde con el resultado.
  PROCEDURE registrar_llegada(p_id NUMBER, p_admin NUMBER, p_via VARCHAR2, p_valor VARCHAR2) IS
    l_res VARCHAR2(12);
    l     CLOB;
  BEGIN
    -- "llegada_en IS NULL" evita el doble registro si dos tablets escanean a la vez.
    UPDATE fn_invitado
       SET llegada_en = SYSTIMESTAMP, llegada_admin_id = p_admin, llegada_via = p_via
     WHERE id = p_id AND llegada_en IS NULL;
    IF SQL%ROWCOUNT = 1 THEN l_res := 'OK'; ELSE l_res := 'DUPLICADO'; END IF;

    INSERT INTO fn_escaneo (invitado_id, resultado, valor_leido, admin_id)
    VALUES (p_id, l_res, SUBSTR(p_valor, 1, 200), p_admin);
    COMMIT;

    SELECT JSON_OBJECT(
             'resultado' VALUE l_res,
             'invitado'  VALUE JSON_OBJECT(
                                 'id'           VALUE i.id,
                                 'codigo'       VALUE i.codigo,
                                 'nombre'       VALUE i.nombre,
                                 'compania'     VALUE i.compania,
                                 'area'         VALUE i.area,
                                 'llegadaEn'    VALUE fn_api.iso(i.llegada_en),
                                 'llegadaAdmin' VALUE a.nombre)
             RETURNING CLOB)
      INTO l
      FROM fn_invitado i
      LEFT JOIN fn_admin a ON a.id = i.llegada_admin_id
     WHERE i.id = p_id;
    responder(l);
  END;

  -- Cuerpo: {"token":"...","valor":"texto leído del QR","adminId":1}
  PROCEDURE checkin_qr(p_body CLOB) IS
    o       JSON_OBJECT_T;
    l_token fn_invitado.token_qr%TYPE;
    l_valor VARCHAR2(200);
    l_admin NUMBER;
    l_ev    NUMBER;
    l_id    NUMBER;
  BEGIN
    o := cuerpo(p_body);
    l_token := SUBSTR(o.get_string('token'), 1, 64);
    l_valor := SUBSTR(o.get_string('valor'), 1, 200);
    l_admin := o.get_number('adminId');
    l_ev    := ev_activo;
    BEGIN
      SELECT id INTO l_id
        FROM fn_invitado
       WHERE token_qr = l_token AND evento_id = l_ev AND activo = 'S';
    EXCEPTION WHEN NO_DATA_FOUND THEN
      INSERT INTO fn_escaneo (resultado, valor_leido, admin_id) VALUES ('INVALIDO', l_valor, l_admin);
      COMMIT;
      responder('{"resultado":"INVALIDO"}');
      RETURN;
    END;
    registrar_llegada(l_id, l_admin, 'QR', l_valor);
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- Cuerpo: {"invitadoId":12,"adminId":1}
  PROCEDURE checkin_manual(p_body CLOB) IS
    o        JSON_OBJECT_T;
    l_buscar NUMBER;
    l_admin  NUMBER;
    l_ev     NUMBER;
    l_id     NUMBER;
  BEGIN
    o := cuerpo(p_body);
    l_buscar := o.get_number('invitadoId');
    l_admin  := o.get_number('adminId');
    l_ev     := ev_activo;
    SELECT id INTO l_id
      FROM fn_invitado
     WHERE id = l_buscar AND evento_id = l_ev AND activo = 'S';
    registrar_llegada(l_id, l_admin, 'NOMBRE', NULL);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN responder_error(404, 'Invitado no encontrado');
    WHEN OTHERS THEN fallo;
  END;

  PROCEDURE checkin_recientes(p_limite VARCHAR2) IS
    l        CLOB;
    l_ev     NUMBER;
    l_limite NUMBER;
  BEGIN
    l_ev := ev_activo;
    l_limite := LEAST(GREATEST(NVL(TO_NUMBER(REGEXP_SUBSTR(p_limite, '^[0-9]+$')), 30), 1), 200);
    SELECT JSON_ARRAYAGG(
             JSON_OBJECT(
               'id'           VALUE v.id,
               'codigo'       VALUE v.codigo,
               'nombre'       VALUE v.nombre,
               'compania'     VALUE v.compania,
               'area'         VALUE v.area,
               'llegadaEn'    VALUE fn_api.iso(v.llegada_en),
               'llegadaVia'   VALUE v.llegada_via,
               'llegadaAdmin' VALUE v.admin_nombre)
             ORDER BY v.llegada_en DESC RETURNING CLOB)
      INTO l
      FROM (SELECT i.id, i.codigo, i.nombre, i.compania, i.area, i.llegada_en, i.llegada_via, a.nombre AS admin_nombre
              FROM fn_invitado i
              LEFT JOIN fn_admin a ON a.id = i.llegada_admin_id
             WHERE i.evento_id = l_ev AND i.activo = 'S' AND i.llegada_en IS NOT NULL
             ORDER BY i.llegada_en DESC
             FETCH FIRST l_limite ROWS ONLY) v;
    responder(NVL(l, '[]'));
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  PROCEDURE checkin_deshacer(p_id VARCHAR2) IS
    l_id NUMBER;
  BEGIN
    l_id := a_numero(p_id);
    UPDATE fn_invitado
       SET llegada_en = NULL, llegada_admin_id = NULL, llegada_via = NULL
     WHERE id = l_id;
    IF SQL%ROWCOUNT = 0 THEN RAISE_APPLICATION_ERROR(-20404, 'Invitado no encontrado'); END IF;
    COMMIT;
    ok;
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

  -- -------------------------------------------------------------------
  -- Envíos
  -- -------------------------------------------------------------------
  -- Cuerpo: {"invitadoId":12,"canal":"WHATSAPP|CORREO","estado":"ENVIADO|ERROR",
  --          "detalle":"...","proveedorId":"...","adminId":1}
  PROCEDURE envio_registrar(p_body CLOB) IS
    o           JSON_OBJECT_T;
    l_invitado  NUMBER;
    l_canal     VARCHAR2(10);
    l_estado    VARCHAR2(10);
    l_detalle   VARCHAR2(1000);
    l_proveedor VARCHAR2(200);
    l_admin     NUMBER;
  BEGIN
    o := cuerpo(p_body);
    l_invitado  := o.get_number('invitadoId');
    l_canal     := UPPER(SUBSTR(o.get_string('canal'), 1, 10));
    l_estado    := UPPER(SUBSTR(o.get_string('estado'), 1, 10));
    l_detalle   := SUBSTR(o.get_string('detalle'), 1, 1000);
    l_proveedor := SUBSTR(o.get_string('proveedorId'), 1, 200);
    l_admin     := o.get_number('adminId');
    INSERT INTO fn_envio (invitado_id, canal, estado, detalle, proveedor_id, admin_id)
    VALUES (l_invitado, l_canal, l_estado, l_detalle, l_proveedor, l_admin);
    COMMIT;
    responder('{"ok":true}', 201);
  EXCEPTION WHEN OTHERS THEN fallo;
  END;

END FN_API;
/
