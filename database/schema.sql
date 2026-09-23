-- =====================================================================
-- El Atelier - Hub de produccion (herreria)
-- Esquema completo de PostgreSQL. El script es IDEMPOTENTE: se puede
-- ejecutar sobre una base vacia o sobre una base ya en uso sin perder
-- datos. Para una instalacion existente tambien existe el delta en
-- database/migracion_002_produccion.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- TIPOS ENUMERADOS
-- ---------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE rol_usuario AS ENUM ('admin', 'empleado', 'super_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE estado_tarea AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'REALIZADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE estado_pedido AS ENUM ('PENDIENTE', 'EN_PRODUCCION', 'PAUSADO', 'TERMINADO', 'CANCELADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE estado_etapa AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE semaforo_rendimiento AS ENUM ('VERDE', 'AMARILLO', 'ROJO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Algunas bases creadas con versiones anteriores tienen estado_etapa con
-- las etiquetas EN_PROCESO/BLOQUEADA. Se agregan las que usa la API sin
-- tocar las existentes, para no invalidar filas ya guardadas.
ALTER TYPE estado_etapa ADD VALUE IF NOT EXISTS 'EN_PROGRESO';
ALTER TYPE estado_etapa ADD VALUE IF NOT EXISTS 'CANCELADA';

-- ---------------------------------------------------------------------
-- USUARIOS
-- El primer administrador se carga a mano en la base (ver README).
-- Desde ahi el admin da de alta a los empleados con POST /api/usuarios.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  contrasena_hash TEXT NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'empleado',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(40);

-- No hay flujo de recuperacion de contrasena implementado (ver
-- server/rutas/autenticacion.js): esta tabla nunca se llego a usar.
DROP TABLE IF EXISTS recuperaciones_contrasena;

-- "equipos" y "equipo_integrantes" fueron parte de un prototipo anterior
-- (asignar trabajo a un equipo, no a una persona). El sistema actual
-- asigna cada etapa a un usuario individual (responsable_id / asignado_a)
-- y ningun codigo vivo las usa: se borran, junto con las columnas
-- equipo_id que las referenciaban en pedidos y recompensas (ver mas abajo).
DROP TABLE IF EXISTS equipo_integrantes CASCADE;
DROP TABLE IF EXISTS equipos CASCADE;

-- ---------------------------------------------------------------------
-- CONFIGURACION DEL SISTEMA
-- Parametros editables por el admin (formula de recompensas, semaforo).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion (
  clave VARCHAR(60) PRIMARY KEY,
  valor TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('recompensa_activa', 'true', 'Habilita el calculo automatico de recompensas al completar una etapa.'),
  ('recompensa_valor_hora', '2500', 'Valor de referencia de una hora de taller, usado para valorizar el tiempo ahorrado.'),
  ('recompensa_factor_ahorro', '0.5', 'Proporcion del valor del tiempo ahorrado que se paga como recompensa (0 a 1).'),
  ('recompensa_bono_minimo', '0', 'Monto minimo garantizado cuando la etapa cierra en verde.'),
  ('semaforo_tolerancia', '0.1', 'Margen sobre el tiempo estimado que se considera dentro del promedio (0.1 = 10%).'),
  ('moneda', 'ARS', 'Simbolo de moneda usado en los reportes.'),
  ('negocio_nombre', 'El Atelier', 'Nombre de la herreria mostrado en la web publica.'),
  ('negocio_rubro', 'Herrería de diseño', 'Frase corta que acompaña al nombre del negocio en el encabezado y la portada.'),
  ('negocio_eslogan', 'Diseño que perdura', 'Frase corta mostrada en el hero de la web publica.'),
  ('negocio_descripcion', 'Muebles y piezas de herrería artesanal, diseñados y fabricados a medida.', 'Descripcion breve usada en la portada y en las meta etiquetas SEO.'),
  ('negocio_whatsapp', '5491100000000', 'Numero de WhatsApp (con codigo de pais, sin signos) para el boton de consulta. Ejemplo Argentina: 5491122334455.'),
  ('negocio_email', 'contacto@elatelier.com', 'Correo de contacto mostrado en la web publica.'),
  ('negocio_telefono', '', 'Telefono alternativo mostrado en el pie de pagina (opcional).'),
  ('negocio_direccion', '', 'Direccion del taller mostrada en Contacto (opcional).'),
  ('negocio_instagram', '', 'URL del Instagram (opcional, se oculta si esta vacio).'),
  ('negocio_facebook', '', 'URL del Facebook (opcional, se oculta si esta vacio).'),
  ('negocio_horario', 'Lunes a viernes de 9 a 18 hs', 'Horario de atencion mostrado en Contacto.'),
  ('negocio_hero_video', '', 'URL del video de fondo del hero de portada (opcional, se sube desde Configuracion).'),
  ('costo_hora_mano_obra', '0', 'Costo por hora de mano de obra, usado junto a las horas-hombre del producto para calcular el costo de mano de obra.')
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- TAREAS LIBRES (trabajo interno que no nace de un pedido)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tareas (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(180) NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  estado estado_tarea NOT NULL DEFAULT 'PENDIENTE',
  asignado_a BIGINT NOT NULL REFERENCES usuarios(id),
  creado_por BIGINT NOT NULL REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS finalizada_en TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tarea_etapas (
  id BIGSERIAL PRIMARY KEY,
  tarea_id BIGINT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  orden SMALLINT NOT NULL CHECK (orden > 0),
  minutos_estimados INTEGER NOT NULL CHECK (minutos_estimados > 0),
  realizada BOOLEAN NOT NULL DEFAULT FALSE,
  completada_en TIMESTAMPTZ,
  UNIQUE (tarea_id, orden)
);
-- Tiempo real informado por el empleado + resultado del semaforo.
ALTER TABLE tarea_etapas ADD COLUMN IF NOT EXISTS minutos_reales INTEGER;
ALTER TABLE tarea_etapas ADD COLUMN IF NOT EXISTS semaforo semaforo_rendimiento;
ALTER TABLE tarea_etapas ADD COLUMN IF NOT EXISTS costo NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- CATEGORIAS DEL CATALOGO (usadas por la web publica y el panel admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  slug VARCHAR(140) UNIQUE NOT NULL,
  descripcion TEXT,
  orden SMALLINT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Foto propia de la categoria (si no se carga, la web publica usa como
-- respaldo la foto de algun producto de esa categoria).
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS imagen_url TEXT;

-- ---------------------------------------------------------------------
-- CATALOGO: PRODUCTOS Y SUS ETAPAS DE FABRICACION
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- Catalogo publico: categoria, URL amigable y bandera de destacado.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria_id BIGINT REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS slug VARCHAR(200);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS destacado BOOLEAN NOT NULL DEFAULT FALSE;
-- Horas-hombre de fabricación, usadas junto al costo por hora configurable
-- para calcular el costo de mano de obra (ver MATERIALES Y COSTEO abajo).
ALTER TABLE productos ADD COLUMN IF NOT EXISTS horas_hombre NUMERIC(8,2) NOT NULL DEFAULT 0;
-- Chapita vintage opcional ("PC N° ...") que se muestra junto al nombre del
-- producto en la web pública (ver ProductoDetalle.jsx). Nullable a propósito:
-- si está vacía, la web no muestra ninguna chapita (ver publico.js/
-- panel-productos.jsx). VARCHAR y no numérico para no perder ceros a la
-- izquierda (por ejemplo "014").
ALTER TABLE productos ADD COLUMN IF NOT EXISTS chapita_id VARCHAR(20);
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_chapita_id_key;
ALTER TABLE productos ADD CONSTRAINT productos_chapita_id_key UNIQUE (chapita_id);
-- Identificador visible de la pieza ("chapita" vintage numerada), único
-- por producto. Es un campo propio, distinto de la clave primaria interna
-- (productos.id): el admin lo carga/edita a mano (con sugerencia
-- automática desde el panel) y es el que se muestra en la web pública.
-- Nullable a propósito: los productos existentes sin ID asignado
-- simplemente no muestran chapita (ver ChapitaProducto.jsx).
ALTER TABLE productos ADD COLUMN IF NOT EXISTS id_pieza VARCHAR(20);

-- "chapita_id" fue una columna anterior para esta misma idea: quedó
-- cableada en el backend y el panel, pero nunca en la web pública actual
-- (que ya usa id_pieza). Si existe, se migran sus valores a id_pieza (sin
-- pisar los que ya estén cargados) y se borra, para dejar una sola fuente
-- de verdad. Si algún producto tenía los dos campos cargados con valores
-- distintos, la restricción UNIQUE de abajo puede fallar: revisar ese caso
-- a mano antes de reintentar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'chapita_id') THEN
    UPDATE productos SET id_pieza = chapita_id WHERE id_pieza IS NULL AND chapita_id IS NOT NULL;
    ALTER TABLE productos DROP COLUMN chapita_id;
  END IF;
END $$;

ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_id_pieza_key;
ALTER TABLE productos ADD CONSTRAINT productos_id_pieza_key UNIQUE (id_pieza);

-- Medidas (texto libre, ej. "120 x 60 x 75 cm"), costo del producto
-- (número de referencia cargado a mano por el admin, reemplaza al viejo
-- costo por etapa) e historia del producto (texto editorial, distinto de
-- la descripción técnica ya existente: ver ProductoDetalle.jsx).
ALTER TABLE productos ADD COLUMN IF NOT EXISTS medidas VARCHAR(200);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_producto NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS historia TEXT;

-- Genera un slug para productos que todavia no lo tienen (instalaciones
-- existentes). Los productos nuevos reciben su slug desde la API.
UPDATE productos SET slug = LOWER(
    regexp_replace(
      regexp_replace(
        translate(nombre, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'),
        '[^a-zA-Z0-9]+', '-', 'g'
      ), '(^-+)|(-+$)', '', 'g'
    )
  ) || '-' || id
  WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_slug ON productos(slug);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);

-- Galeria de imagenes del producto: varias por producto, ordenadas, con
-- una marcada como principal para las grillas del catalogo.
CREATE TABLE IF NOT EXISTS producto_imagenes (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  orden SMALLINT NOT NULL DEFAULT 0,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_producto_imagenes_producto ON producto_imagenes(producto_id, orden);
CREATE UNIQUE INDEX IF NOT EXISTS idx_producto_imagenes_principal
  ON producto_imagenes(producto_id) WHERE es_principal;

CREATE TABLE IF NOT EXISTS etapas_producto (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  orden SMALLINT NOT NULL CHECK (orden > 0),
  puntos_recompensa INTEGER NOT NULL DEFAULT 0 CHECK (puntos_recompensa >= 0),
  UNIQUE (producto_id, orden)
);
-- Costo y duracion estimada que define el admin para cada etapa.
ALTER TABLE etapas_producto ADD COLUMN IF NOT EXISTS costo NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE etapas_producto ADD COLUMN IF NOT EXISTS minutos_estimados INTEGER NOT NULL DEFAULT 60;

-- ---------------------------------------------------------------------
-- MATERIALES (ELIMINADO)
-- La sección Materiales se quitó de la aplicación por completo: ningún
-- endpoint ni pantalla la usa. Se borran sus tablas si todavía existen.
-- El costo de un producto queda en mano de obra (horas_hombre × costo de
-- la hora configurado abajo) + costo del producto cargado a mano.
-- pedido_items.costo_materiales_unitario se conserva solo para no alterar
-- el costo guardado de pedidos viejos (los nuevos lo guardan en 0).
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS producto_materiales;
DROP TABLE IF EXISTS materiales;

-- ---------------------------------------------------------------------
-- PRODUCCIÓN DIARIA Y RECOMPENSAS POR OBJETIVO
-- Un objetivo activo por producto (editable); cada registro diario
-- guarda una copia del objetivo vigente ese día, así que editar el
-- objetivo más adelante no reescribe el historial de cumplimiento.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objetivos_produccion (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL UNIQUE REFERENCES productos(id) ON DELETE CASCADE,
  cantidad_objetivo INTEGER NOT NULL CHECK (cantidad_objetivo > 0),
  tipo_recompensa VARCHAR(20) NOT NULL DEFAULT 'monto' CHECK (tipo_recompensa IN ('monto', 'libre')),
  valor_recompensa NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_recompensa >= 0),
  descripcion_recompensa TEXT NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registros_produccion (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  cantidad_producida INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_producida >= 0),
  objetivo_cantidad INTEGER NOT NULL,
  cumplido BOOLEAN NOT NULL DEFAULT FALSE,
  registrado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (producto_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_registros_produccion_fecha ON registros_produccion(fecha);
CREATE INDEX IF NOT EXISTS idx_registros_produccion_producto ON registros_produccion(producto_id, fecha);

-- ---------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(40),
  email VARCHAR(255),
  direccion TEXT
);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------------
-- PEDIDOS (uno o mas productos por pedido)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS pedidos_codigo_seq START 1;

CREATE TABLE IF NOT EXISTS pedidos (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(30) UNIQUE NOT NULL,
  cliente_id BIGINT REFERENCES clientes(id),
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  estado estado_pedido NOT NULL DEFAULT 'PENDIENTE',
  prioridad SMALLINT NOT NULL DEFAULT 0,
  fecha_entrega DATE,
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminado_en TIMESTAMPTZ
);
ALTER TABLE pedidos ALTER COLUMN codigo SET DEFAULT 'PED-' || LPAD(nextval('pedidos_codigo_seq')::text, 5, '0');
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS creado_por BIGINT REFERENCES usuarios(id);
-- "producto_id" (pedido de un solo producto) y "equipo_id" (asignación a
-- un equipo) son de un diseño anterior: el INSERT INTO pedidos actual ya
-- no los completa (ver rutas/pedidos.js: los productos viven en
-- pedido_items, las etapas se asignan a un responsable individual).
ALTER TABLE pedidos DROP COLUMN IF EXISTS producto_id;
ALTER TABLE pedidos DROP COLUMN IF EXISTS equipo_id;

CREATE TABLE IF NOT EXISTS pedido_items (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0
);
-- Copia del costo de mano de obra (y, en pedidos anteriores a la baja de
-- Materiales, del costo de materiales) POR UNIDAD del producto,
-- tomada al crear el pedido (mismo criterio que ya se usaba para copiar
-- costo/duración de las etapas: editar el producto después no altera lo
-- que ya está en producción). Reemplaza a la suma de costo por etapa como
-- fuente del costo estimado del pedido (ver server/rutas/pedidos.js).
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS costo_materiales_unitario NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS costo_mano_obra_unitario NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Cada etapa de cada item del pedido es la unidad de trabajo asignable.
CREATE TABLE IF NOT EXISTS pedido_etapas (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  etapa_producto_id BIGINT REFERENCES etapas_producto(id),
  responsable_id BIGINT REFERENCES usuarios(id),
  estado estado_etapa NOT NULL DEFAULT 'PENDIENTE',
  iniciado_en TIMESTAMPTZ,
  completado_en TIMESTAMPTZ,
  observaciones TEXT
);
ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS pedido_etapas_pedido_id_etapa_producto_id_key;
ALTER TABLE pedido_etapas ALTER COLUMN etapa_producto_id DROP NOT NULL;
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS pedido_item_id BIGINT REFERENCES pedido_items(id) ON DELETE CASCADE;
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS nombre VARCHAR(120) NOT NULL DEFAULT 'Etapa';
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS orden SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS costo_estimado NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS minutos_estimados INTEGER NOT NULL DEFAULT 60;
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS minutos_reales INTEGER;
ALTER TABLE pedido_etapas ADD COLUMN IF NOT EXISTS semaforo semaforo_rendimiento;

-- ---------------------------------------------------------------------
-- PRESUPUESTOS
-- Entidad independiente de "pedidos": guarda seña y saldo de una
-- cotización, se convierta o no luego en un pedido real (pedido_id
-- queda disponible para ese vínculo opcional).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuestos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre VARCHAR(150),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  monto_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_total >= 0),
  sena_monto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sena_monto >= 0),
  notas TEXT,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
  creado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_presupuestos_fecha ON presupuestos(fecha);
CREATE INDEX IF NOT EXISTS idx_presupuestos_cliente ON presupuestos(cliente_id);

CREATE TABLE IF NOT EXISTS presupuesto_items (
  id BIGSERIAL PRIMARY KEY,
  presupuesto_id BIGINT NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  producto_id BIGINT REFERENCES productos(id) ON DELETE SET NULL,
  descripcion VARCHAR(200) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0)
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_items_presupuesto ON presupuesto_items(presupuesto_id);

-- ---------------------------------------------------------------------
-- RECOMPENSAS (se generan solas cuando la etapa cierra en verde)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recompensas (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE CASCADE,
  puntos INTEGER NOT NULL DEFAULT 0,
  monto NUMERIC(12,2),
  motivo TEXT NOT NULL,
  otorgado_por BIGINT REFERENCES usuarios(id),
  otorgado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE recompensas DROP CONSTRAINT IF EXISTS recompensas_puntos_check;
ALTER TABLE recompensas ALTER COLUMN pedido_id DROP NOT NULL;
ALTER TABLE recompensas ALTER COLUMN puntos SET DEFAULT 0;
ALTER TABLE recompensas DROP COLUMN IF EXISTS equipo_id;
ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS pedido_etapa_id BIGINT REFERENCES pedido_etapas(id) ON DELETE CASCADE;
ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS tarea_etapa_id BIGINT REFERENCES tarea_etapas(id) ON DELETE CASCADE;
ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS semaforo semaforo_rendimiento;
ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS minutos_estimados INTEGER;
ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS minutos_reales INTEGER;
ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS minutos_ahorrados INTEGER;
ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS automatica BOOLEAN NOT NULL DEFAULT TRUE;

-- Una etapa genera como maximo una recompensa automatica.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recompensas_pedido_etapa ON recompensas(pedido_etapa_id) WHERE pedido_etapa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_recompensas_tarea_etapa ON recompensas(tarea_etapa_id) WHERE tarea_etapa_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- REGLAS DE BORRADO
-- Las claves foraneas heredadas del esquema anterior no tenian accion de
-- borrado, asi que eliminar un pedido o reescribir las etapas de un
-- producto fallaba. Se redefinen de forma idempotente.
-- ---------------------------------------------------------------------
ALTER TABLE pedido_items DROP CONSTRAINT IF EXISTS pedido_items_pedido_id_fkey;
ALTER TABLE pedido_items ADD CONSTRAINT pedido_items_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;

ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS pedido_etapas_pedido_id_fkey;
ALTER TABLE pedido_etapas ADD CONSTRAINT pedido_etapas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;

-- La etapa del pedido guarda su propia copia de nombre, costo y minutos,
-- asi que puede sobrevivir a la edicion del catalogo.
ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS pedido_etapas_etapa_producto_id_fkey;
ALTER TABLE pedido_etapas ADD CONSTRAINT pedido_etapas_etapa_producto_id_fkey FOREIGN KEY (etapa_producto_id) REFERENCES etapas_producto(id) ON DELETE SET NULL;

ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS pedido_etapas_responsable_id_fkey;
ALTER TABLE pedido_etapas ADD CONSTRAINT pedido_etapas_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE recompensas DROP CONSTRAINT IF EXISTS recompensas_pedido_id_fkey;
ALTER TABLE recompensas ADD CONSTRAINT recompensas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;

-- Al eliminar la cuenta de un empleado (ver DELETE /usuarios/:id), sus
-- tareas libres asignadas quedan sin responsable en lugar de bloquear el
-- borrado o perder la tarea: el admin la reasigna después desde el panel
-- de Tareas (PATCH /tareas/:id/asignar).
ALTER TABLE tareas ALTER COLUMN asignado_a DROP NOT NULL;
ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_asignado_a_fkey;
ALTER TABLE tareas ADD CONSTRAINT tareas_asignado_a_fkey FOREIGN KEY (asignado_a) REFERENCES usuarios(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- INDICES
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tareas_asignado_estado ON tareas(asignado_a, estado);
CREATE INDEX IF NOT EXISTS idx_tarea_etapas_tarea ON tarea_etapas(tarea_id, orden);
CREATE INDEX IF NOT EXISTS idx_etapas_producto_producto ON etapas_producto(producto_id, orden);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_etapas_pedido ON pedido_etapas(pedido_id, orden);
CREATE INDEX IF NOT EXISTS idx_pedido_etapas_responsable ON pedido_etapas(responsable_id, estado);
CREATE INDEX IF NOT EXISTS idx_recompensas_usuario ON recompensas(usuario_id, otorgado_en);

-- ---------------------------------------------------------------------
-- VISTAS
-- ---------------------------------------------------------------------

-- Se recrean en cada corrida. El orden de borrado respeta las
-- dependencias: vista_rendimiento_empleados se apoya en vista_tareas_empleado.
DROP VIEW IF EXISTS vista_rendimiento_empleados;
DROP VIEW IF EXISTS vista_tareas_empleado;
DROP VIEW IF EXISTS vista_pedidos_activos;

-- Avance de cada pedido segun las etapas de sus productos.
CREATE VIEW vista_pedidos_activos AS
SELECT p.id, p.codigo, p.estado, p.prioridad, p.fecha_entrega, p.creado_en,
       c.nombre AS cliente, c.telefono AS cliente_telefono,
       COUNT(pe.id)::int AS etapas_totales,
       COUNT(pe.id) FILTER (WHERE pe.estado = 'COMPLETADA')::int AS etapas_completadas,
       COALESCE(ROUND(100.0 * COUNT(pe.id) FILTER (WHERE pe.estado = 'COMPLETADA') / NULLIF(COUNT(pe.id), 0)), 0)::int AS avance
FROM pedidos p
LEFT JOIN clientes c ON c.id = p.cliente_id
LEFT JOIN pedido_etapas pe ON pe.pedido_id = p.id
GROUP BY p.id, c.nombre, c.telefono;

-- Bandeja unica de trabajo del empleado: etapas de pedido + etapas de tareas libres.
-- iniciado_en, fecha_entrega y prioridad viajan solo para etapas de pedido (las
-- tareas libres no tienen cliente ni fecha de entrega); se agregan al final para
-- no romper a nadie que dependa del orden de columnas previo.
CREATE VIEW vista_tareas_empleado AS
SELECT 'PEDIDO'::text AS origen,
       pe.id::bigint AS id,
       pe.pedido_id::bigint AS contenedor_id,
       p.codigo::text AS referencia,
       COALESCE(pr.nombre, 'Pedido')::text AS titulo,
       pe.nombre::text AS etapa,
       pe.orden::int AS orden,
       pe.responsable_id::bigint AS asignado_a,
       pe.estado::text AS estado,
       pe.minutos_estimados::int AS minutos_estimados,
       pe.minutos_reales::int AS minutos_reales,
       pe.costo_estimado::numeric(12,2) AS costo,
       pe.semaforo AS semaforo,
       pe.completado_en AS completado_en,
       COALESCE(c.nombre, 'Sin cliente')::text AS cliente,
       pe.observaciones::text AS observaciones,
       pe.iniciado_en AS iniciado_en,
       p.fecha_entrega AS fecha_entrega,
       p.prioridad::int AS prioridad
FROM pedido_etapas pe
JOIN pedidos p ON p.id = pe.pedido_id
LEFT JOIN pedido_items pi ON pi.id = pe.pedido_item_id
LEFT JOIN productos pr ON pr.id = pi.producto_id
LEFT JOIN clientes c ON c.id = p.cliente_id
UNION ALL
SELECT 'TAREA'::text,
       te.id::bigint,
       t.id::bigint,
       ('T-' || t.id)::text,
       t.titulo::text,
       te.nombre::text,
       te.orden::int,
       t.asignado_a::bigint,
       (CASE WHEN te.realizada THEN 'COMPLETADA' ELSE 'PENDIENTE' END)::text,
       te.minutos_estimados::int,
       te.minutos_reales::int,
       te.costo::numeric(12,2),
       te.semaforo,
       te.completada_en,
       'Trabajo interno'::text,
       t.descripcion::text,
       NULL::timestamptz,
       NULL::date,
       NULL::int
FROM tarea_etapas te
JOIN tareas t ON t.id = te.tarea_id;

-- Rendimiento consolidado por empleado (base del apartado de estadisticas).
CREATE VIEW vista_rendimiento_empleados AS
SELECT u.id, u.nombre, u.email, u.activo,
       COUNT(v.id) FILTER (WHERE v.estado = 'COMPLETADA')::int AS completadas,
       COUNT(v.id) FILTER (WHERE v.estado <> 'COMPLETADA')::int AS pendientes,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'VERDE')::int AS verdes,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'AMARILLO')::int AS amarillos,
       COUNT(v.id) FILTER (WHERE v.semaforo = 'ROJO')::int AS rojos,
       COALESCE(SUM(v.minutos_estimados) FILTER (WHERE v.estado = 'COMPLETADA'), 0)::int AS minutos_estimados,
       COALESCE(SUM(v.minutos_reales) FILTER (WHERE v.estado = 'COMPLETADA'), 0)::int AS minutos_reales,
       COALESCE(ROUND(AVG(v.minutos_reales) FILTER (WHERE v.estado = 'COMPLETADA')), 0)::int AS promedio_minutos,
       COALESCE((SELECT SUM(r.monto) FROM recompensas r WHERE r.usuario_id = u.id), 0)::numeric(12,2) AS recompensas_monto
FROM usuarios u
LEFT JOIN vista_tareas_empleado v ON v.asignado_a = u.id
WHERE LOWER(u.rol::text) = 'empleado'
GROUP BY u.id;

-- ---------------------------------------------------------------------
-- CATEGORIAS DE PRODUCTO (lista fija)
-- Las categorías disponibles son exactamente tres: Mesas, Mesas ratonas y
-- Fogoneros (mismos slugs que usa CATEGORIAS_PRODUCTO en server/comun.js).
-- La categoría de un producto es opcional. Cualquier otra categoría se
-- elimina y sus productos quedan "sin categoría" (siguen visibles en la
-- web pública cuando no se filtra por categoría).
-- ---------------------------------------------------------------------
INSERT INTO categorias (nombre, slug, descripcion, orden, activo) VALUES
  ('Mesas', 'mesas', 'Mesas de hierro y madera para comedor y exterior.', 1, TRUE),
  ('Mesas ratonas', 'mesas-ratonas', 'Mesas ratonas y de centro en hierro y madera.', 2, TRUE),
  ('Fogoneros', 'fogoneros', 'Fogoneros de hierro para exterior.', 3, TRUE)
ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, activo = TRUE;

UPDATE productos SET categoria_id = NULL
WHERE categoria_id IN (SELECT id FROM categorias WHERE slug NOT IN ('mesas', 'mesas-ratonas', 'fogoneros'));
DELETE FROM categorias WHERE slug NOT IN ('mesas', 'mesas-ratonas', 'fogoneros');

-- ---------------------------------------------------------------------
-- PRIMER ADMINISTRADOR
-- Se carga a mano. Reemplazar el hash por uno generado con bcrypt:
--   node -e "console.log(require('bcrypt').hashSync('TuClave123', 12))"
--
--   INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
--   VALUES ('Administrador', 'admin@atelier.com', '<hash-bcrypt>', 'admin');
--
-- O bien promover una cuenta existente:
--   UPDATE usuarios SET rol = 'admin' WHERE email = 'tu-correo@ejemplo.com';
-- ---------------------------------------------------------------------
