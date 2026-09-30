-- =====================================================================
-- Migración 018: nombre de la marca
-- El nombre correcto es "Un atelier". Corrige el valor guardado en
-- configuracion.negocio_nombre en bases que todavía tengan una variante
-- incorrecta ("El Atelier", "El atelier", "El ateriel", etc.).
-- Idempotente: solo toca el valor si es una variante de "el atelier";
-- si el nombre fue personalizado a otra cosa desde Configuración, no se toca.
-- (database/schema.sql ya incluye este mismo cambio.)
-- =====================================================================
UPDATE configuracion
   SET valor = 'Un atelier', actualizado_en = NOW()
 WHERE clave = 'negocio_nombre'
   AND valor ~* '^\s*(el|un)\s+(atelier|ateriel)\s*$'
   AND valor <> 'Un atelier';
