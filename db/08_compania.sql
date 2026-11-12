-- =====================================================================
-- Actualización: campo COMPANIA (Haseth, Botica, Laboratorio…) en FN_INVITADO.
--
-- Pasos (en APEX › SQL Workshop › SQL Scripts):
--   1) Ejecute este script.
--   2) Vuelva a ejecutar 03_paquete_fn_api.sql.
-- =====================================================================

-- 1) Agrega la columna (si ya existe, no hace nada)
DECLARE
  l_existe NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_existe FROM user_tab_columns
   WHERE table_name = 'FN_INVITADO' AND column_name = 'COMPANIA';
  IF l_existe = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE fn_invitado ADD (compania VARCHAR2(100))';
  END IF;
END;
/

-- 2) Si cargó los invitados con 07_cargar_invitados.sql, el área quedó como
--    "Compañía · Departamento". Esto los separa en los dos campos.
UPDATE fn_invitado
   SET compania = TRIM(SUBSTR(area, 1, INSTR(area, ' · ') - 1)),
       area     = TRIM(SUBSTR(area, INSTR(area, ' · ') + 3))
 WHERE compania IS NULL
   AND INSTR(area, ' · ') > 0;

COMMIT;

-- 3) Índice para filtrar por compañía
DECLARE
  l_existe NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_existe FROM user_indexes WHERE index_name = 'FN_INVITADO_COMPANIA_IX';
  IF l_existe = 0 THEN
    EXECUTE IMMEDIATE 'CREATE INDEX fn_invitado_compania_ix ON fn_invitado (evento_id, compania, area)';
  END IF;
END;
/

-- Verificación
SELECT compania, COUNT(*) invitados
  FROM fn_invitado
 WHERE activo = 'S'
 GROUP BY compania
 ORDER BY compania;
