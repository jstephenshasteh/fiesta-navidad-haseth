-- =====================================================================
-- CUIDADO: borra el módulo REST, el paquete y TODAS las tablas con sus datos.
-- Úselo solo para empezar de cero (por ejemplo, si creó las tablas con una versión anterior).
-- =====================================================================
BEGIN ORDS.DELETE_MODULE(p_module_name => 'fiesta.v1'); COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN ORDS.DELETE_PRIVILEGE(p_name => 'fiesta.api'); COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/
DROP PACKAGE FN_API;
DROP TABLE FN_GANADOR PURGE;
DROP TABLE FN_PUESTO PURGE;
DROP TABLE FN_RONDA PURGE;
DROP TABLE FN_ESCANEO PURGE;
DROP TABLE FN_ENVIO PURGE;
DROP TABLE FN_INVITADO PURGE;
DROP TABLE FN_ADMIN PURGE;
DROP TABLE FN_EVENTO PURGE;
