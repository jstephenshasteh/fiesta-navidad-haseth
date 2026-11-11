-- =====================================================================
-- Servicios REST (ORDS) para la app de la Fiesta navideña.
-- Módulo:  fiesta.v1   →   https://SU-SERVIDOR/ords/ALIAS_DEL_ESQUEMA/fiesta/v1/...
--
-- Requisitos:
--   * Haber ejecutado 01_tablas.sql, 02_datos_iniciales.sql y 03_paquete_fn_api.sql.
--   * El esquema debe estar habilitado para REST (en APEX: SQL Workshop › RESTful Services;
--     si pide "Register Schema with ORDS", acéptelo). El alias del esquema aparece ahí.
--
-- Este script se puede volver a ejecutar: DEFINE_MODULE reemplaza el módulo completo.
-- Después de ejecutarlo, el módulo aparece en SQL Workshop › RESTful Services › Modules.
-- =====================================================================

BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name    => 'fiesta.v1',
    p_base_path      => '/fiesta/v1/',
    p_items_per_page => 0,
    p_status         => 'PUBLISHED',
    p_comments       => 'API de la Fiesta navideña 2026 (invitados, llegadas y envíos)');

  -- ---------------------------------------------------------------
  -- Administradores
  -- ---------------------------------------------------------------
  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'admins');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'admins', p_method => 'GET',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.admins_listar; :status_code := fn_api.estado; END;',
    p_comments => 'Lista los administradores activos');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'admins', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.admin_crear(:body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Crea un administrador {nombre, pinHash, esPrincipal, color}');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'admins/:id');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'admins/:id', p_method => 'GET',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.admin_obtener(:id); :status_code := fn_api.estado; END;',
    p_comments => 'Un administrador, incluido el hash del PIN (para validar el ingreso)');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'admins/:id', p_method => 'DELETE',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.admin_desactivar(:id); :status_code := fn_api.estado; END;',
    p_comments => 'Desactiva un administrador');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'admins/:id/pin');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'admins/:id/pin', p_method => 'PUT',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.admin_cambiar_pin(:id, :body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Cambia el PIN {pinHash}');

  -- ---------------------------------------------------------------
  -- Evento
  -- ---------------------------------------------------------------
  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'evento');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'evento', p_method => 'GET',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.evento_obtener; :status_code := fn_api.estado; END;',
    p_comments => 'Datos del evento activo');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'evento', p_method => 'PUT',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.evento_actualizar(:body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Actualiza los datos del evento (solo los campos enviados)');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'evento/arte');
  -- Devuelve la imagen tal cual (tipo "media": primera columna = tipo MIME, segunda = BLOB)
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'evento/arte', p_method => 'GET',
    p_source_type => ORDS.source_type_media,
    p_source => 'SELECT arte_mime, arte FROM fn_evento
                  WHERE id = (SELECT MAX(id) FROM fn_evento WHERE activo = ''S'') AND arte IS NOT NULL',
    p_comments => 'Imagen 1: arte de la invitación');
  -- Cuerpo = bytes de la imagen; Content-Type = image/png o image/jpeg; ?nombre=archivo.png
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'evento/arte', p_method => 'PUT',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.evento_arte_guardar(:body, :content_type, :nombre); :status_code := fn_api.estado; END;',
    p_comments => 'Sube o reemplaza el arte');

  -- ---------------------------------------------------------------
  -- Invitados
  -- ---------------------------------------------------------------
  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'invitados');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados', p_method => 'GET',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitados_listar; :status_code := fn_api.estado; END;',
    p_comments => 'Lista de invitados con estado de envío y llegada');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitado_crear(:body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Crea un invitado {nombre, correo, whatsapp, area, token}');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'invitados/resumen');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados/resumen', p_method => 'GET',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitados_resumen; :status_code := fn_api.estado; END;',
    p_comments => 'Contadores: total, llegaron, faltan, enviadas, pendientes');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'invitados/importar');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados/importar', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitados_importar(:body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Carga masiva {invitados:[{nombre, correo, whatsapp, area, token}]}');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'invitados/:id');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados/:id', p_method => 'GET',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitado_obtener(:id); :status_code := fn_api.estado; END;',
    p_comments => 'Un invitado, incluido el token del QR');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados/:id', p_method => 'PUT',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitado_actualizar(:id, :body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Edita un invitado {nombre, correo, whatsapp, area}');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados/:id', p_method => 'DELETE',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitado_desactivar(:id); :status_code := fn_api.estado; END;',
    p_comments => 'Quita un invitado de la lista');

  -- ---------------------------------------------------------------
  -- Llegadas
  -- ---------------------------------------------------------------
  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'checkin/qr');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'checkin/qr', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.checkin_qr(:body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Registra llegada por QR {token, valor, adminId} → OK | DUPLICADO | INVALIDO');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'checkin/manual');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'checkin/manual', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.checkin_manual(:body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Registra llegada buscando por nombre {invitadoId, adminId}');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'checkin/recientes');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'checkin/recientes', p_method => 'GET',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.checkin_recientes(:limite); :status_code := fn_api.estado; END;',
    p_comments => 'Últimas llegadas (?limite=30)');

  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'checkin/:id');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'checkin/:id', p_method => 'DELETE',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.checkin_deshacer(:id); :status_code := fn_api.estado; END;',
    p_comments => 'Deshace una llegada registrada por error');

  -- ---------------------------------------------------------------
  -- Envíos
  -- ---------------------------------------------------------------
  ORDS.DEFINE_TEMPLATE(p_module_name => 'fiesta.v1', p_pattern => 'envios');
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'envios', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.envio_registrar(:body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Registra el resultado de un envío por WhatsApp o correo');

  COMMIT;
END;
/
