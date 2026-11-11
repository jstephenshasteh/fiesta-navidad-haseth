-- =====================================================================
-- Seguridad del módulo fiesta.v1 con OAuth2 (client credentials).
-- Solo el servidor de la app (Railway) puede llamar a las APIs: primero pide un token
-- a  https://SU-SERVIDOR/ords/ALIAS/oauth/token  con su CLIENT_ID y CLIENT_SECRET.
--
-- Ejecútelo DESPUÉS de 04_servicios_rest.sql.
-- Se usa el paquete ORDS_SECURITY (ORDS 23.3 o superior: apex.oracle.com, Autonomous
-- Database y versiones recientes). Si su ORDS es más antiguo, vea la alternativa al final.
-- =====================================================================

-- 1) Rol y privilegio que protegen el módulo completo
DECLARE
  l_roles    OWA.vc_arr;
  l_patterns OWA.vc_arr;
  l_modules  OWA.vc_arr;
BEGIN
  BEGIN
    ORDS.CREATE_ROLE(p_role_name => 'fiesta_api');
  EXCEPTION WHEN OTHERS THEN NULL;  -- ya existía
  END;

  l_roles(1)   := 'fiesta_api';
  l_modules(1) := 'fiesta.v1';

  ORDS.DEFINE_PRIVILEGE(
    p_privilege_name => 'fiesta.api',
    p_roles          => l_roles,
    p_patterns       => l_patterns,
    p_modules        => l_modules,
    p_label          => 'API Fiesta navideña',
    p_description    => 'Acceso del servidor de la app a las APIs de la fiesta');
  COMMIT;
END;
/

-- 2) Cliente OAuth para el servidor de la app.
--    ¡Copie el CLIENT_ID y el CLIENT_SECRET que se muestran! El secreto no se puede volver a ver.
--    (En APEX › SQL Scripts, la salida aparece en los resultados del script.)
SET SERVEROUTPUT ON
DECLARE
  l_esquema VARCHAR2(128) := SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA');
  l_cred    ORDS_TYPES.t_client_credentials;
BEGIN
  -- Registra el cliente (sin secreto) ...
  l_cred := ORDS_SECURITY.REGISTER_CLIENT(
    p_schema        => l_esquema,
    p_name          => 'fiesta_railway',
    p_grant_type    => 'client_credentials',
    p_support_email => 'soporte@grupodehaseth.com',
    p_description   => 'Servidor de la app Fiesta navideña (Railway)');
  ORDS_SECURITY.GRANT_CLIENT_ROLE(p_client_name => 'fiesta_railway', p_role_name => 'fiesta_api');
  COMMIT;

  -- ... y le genera un secreto aleatorio (ORDS guarda solo su huella; cópielo ahora).
  l_cred := ORDS_SECURITY.ROTATE_CLIENT_SECRET(
    p_schema     => l_esquema,
    p_client_key => ORDS_TYPES.oauth_client_key(p_name => 'fiesta_railway'));
  COMMIT;

  DBMS_OUTPUT.PUT_LINE('ORDS_CLIENT_ID     = ' || l_cred.client_key.client_id);
  DBMS_OUTPUT.PUT_LINE('ORDS_CLIENT_SECRET = ' || l_cred.client_secret.secret);
END;
/
-- Si pierde el secreto, genere otro (el anterior deja de funcionar):
-- DECLARE l ORDS_TYPES.t_client_credentials; BEGIN
--   l := ORDS_SECURITY.ROTATE_CLIENT_SECRET(SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
--          ORDS_TYPES.oauth_client_key(p_name => 'fiesta_railway'), TRUE, TRUE);
--   COMMIT; DBMS_OUTPUT.PUT_LINE(l.client_secret.secret); END;
-- /

-- ---------------------------------------------------------------------
-- Alternativa para ORDS anterior a 23.3 (paquete OAUTH, ya obsoleto):
--
-- BEGIN
--   OAUTH.CREATE_CLIENT(
--     p_name            => 'fiesta_railway',
--     p_grant_type      => 'client_credentials',
--     p_owner           => 'Grupo De Haseth',
--     p_description     => 'Servidor de la app Fiesta navideña (Railway)',
--     p_support_email   => 'soporte@grupodehaseth.com',
--     p_privilege_names => 'fiesta.api');
--   OAUTH.GRANT_CLIENT_ROLE(p_client_name => 'fiesta_railway', p_role_name => 'fiesta_api');
--   COMMIT;
-- END;
-- /
-- SELECT client_id, client_secret FROM user_ords_clients WHERE name = 'fiesta_railway';
--
-- Para borrar el cliente y crearlo de nuevo:
--   BEGIN ORDS_SECURITY.DELETE_CLIENT(p_name => 'fiesta_railway'); COMMIT; END;
-- ---------------------------------------------------------------------
