-- =====================================================================
-- Migración 021: textos de la portada de la web pública
-- Reemplaza el eslogan y la descripción de la portada por los textos nuevos
-- ("Un galpón de objetos con historia" y su bajada) y corrige el rubro si quedó con una falta
-- de ortografía ("Herreria e diseño"). Idempotente: solo toca los valores
-- que todavía son los textos anteriores; si se personalizaron desde
-- Configuración con otra frase, no se modifican.
-- (database/schema.sql ya incluye este mismo cambio.)
-- =====================================================================
UPDATE configuracion
   SET valor = 'Un galpón de objetos con historia', actualizado_en = NOW()
 WHERE clave = 'negocio_eslogan'
   AND valor ~* '^\s*dise(ñ|n)o\s+que\s+perdura\W*$';

UPDATE configuracion
   SET valor = 'Cuidamos lo que el tiempo dejó en cada objeto y construimos con materiales que todavía tienen mucho por contar.', actualizado_en = NOW()
 WHERE clave = 'negocio_descripcion'
   AND valor ~* '^\s*muebles\s+y\s+piezas\s+de\s+herrer(í|i)a\s+artesanal';

UPDATE configuracion
   SET valor = 'Herrería de diseño', actualizado_en = NOW()
 WHERE clave = 'negocio_rubro'
   AND valor ~* '^\s*herrer(í|i)a\s+(e|de)\s+dise(ñ|n)o\s*$'
   AND valor <> 'Herrería de diseño';
