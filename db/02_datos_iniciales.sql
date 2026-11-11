-- =====================================================================
-- Datos iniciales: evento activo y primer administrador.
-- El PIN del administrador se crea con:  npm run crear-admin -w api
-- (genera el hash bcrypt e inserta en FN_ADMIN). No guarde PINs en texto.
-- =====================================================================

INSERT INTO FN_EVENTO (NOMBRE, FECHA_TEXTO, DIA, MES_CORTO, HORA, LUGAR, SALON, VESTIMENTA,
                       PREFIJO_CODIGO, TEMA_PASE, ASUNTO_CORREO, MENSAJE, ACTIVO)
VALUES ('Fiesta navideña 2026',
        'Viernes 5 de diciembre de 2026', '5', 'DIC', '7:00 p. m.',
        'Hotel Marriott Panamá Albrook', 'Salón Gran Colón', 'Black & White',
        'HAS', 'rojo',
        'Te invitamos a la Fiesta navideña 2026 · 5 de diciembre',
        'Hola {nombre}, Grupo De Haseth tiene el placer de invitarte a nuestra Fiesta navideña 2026, el viernes 5 de diciembre a las 7:00 p. m. en el Hotel Marriott Panamá Albrook, Salón Gran Colón. Vestimenta: Black & White. Te enviamos el arte de la invitación y tu pase con código QR personal ({codigo}); preséntalo en la entrada. ¡Te esperamos!',
        'S');

COMMIT;
