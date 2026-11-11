-- =====================================================================
-- Actualización: agregar y editar invitados desde la app (sin Excel).
--
-- Pasos (en APEX › SQL Workshop › SQL Scripts):
--   1) Vuelva a ejecutar 03_paquete_fn_api.sql (agrega invitado_crear e invitado_actualizar).
--   2) Ejecute este script (agrega las 2 APIs nuevas sin tocar las demás).
-- =====================================================================
BEGIN
  -- POST /fiesta/v1/invitados  → crear un invitado
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados', p_method => 'POST',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitado_crear(:body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Crea un invitado {nombre, correo, whatsapp, area, token}');

  -- PUT /fiesta/v1/invitados/:id  → editar un invitado
  ORDS.DEFINE_HANDLER(p_module_name => 'fiesta.v1', p_pattern => 'invitados/:id', p_method => 'PUT',
    p_source_type => ORDS.source_type_plsql,
    p_source => 'BEGIN fn_api.invitado_actualizar(:id, :body_text); :status_code := fn_api.estado; END;',
    p_comments => 'Edita un invitado {nombre, correo, whatsapp, area}');
  COMMIT;
END;
/
