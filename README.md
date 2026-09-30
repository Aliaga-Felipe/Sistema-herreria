# Un atelier — Hub de producción

Sistema de gestión para herrería, construido con React, Express y PostgreSQL. Incluye autenticación con JWT, RBAC, catálogo de productos con etapas de fabricación, pedidos multiproducto, semáforo de rendimiento con recompensas automáticas y estadísticas de gestión.

## Puesta en marcha

1. Cree una base de datos PostgreSQL llamada `atelier_herreria` y ejecute `database/schema.sql`.
2. Copie `.env.example` como `.env` y complete `DATABASE_URL` y `JWT_SECRET`.
3. Instale las dependencias con `npm install`.
4. En una terminal ejecute `npm run server` y en otra `npm run dev`.

### Base de datos

- `database/schema.sql` es el esquema completo y **es idempotente**: puede ejecutarse sobre una base vacía o sobre una ya en uso sin perder datos. Cada vez que este archivo cambia (por ejemplo, al actualizar el sistema) hay que volver a ejecutarlo contra la base real para que el cambio tenga efecto; si no tenés `psql` a mano, `node server/scripts/aplicar-schema.js` hace lo mismo usando la conexión de `.env`.
- `database/migracion_002_produccion.sql` es el delta para bases que venían del esquema anterior (agrega productos con precio, pedidos multiproducto, semáforo, recompensas y configuración).
- `database/migracion_003_detalle_tareas.sql` es el delta que agrega fecha de inicio, fecha de entrega y prioridad a la bandeja de tareas (`vista_tareas_empleado`), usados por el modal de detalle del panel **Tareas**. Si ya ejecutaste `schema.sql` con esta versión no hace falta correrla aparte.
- `database/migracion_013_integracion_whatsapp_catalogo.sql` agrega las columnas de sincronización con el catálogo de WhatsApp Business (ver [`INTEGRACION_WHATSAPP.md`](INTEGRACION_WHATSAPP.md)). Como siempre, `schema.sql` ya incluye este mismo cambio.
- `database/migracion_015_ventas_productos.sql` agrega el registro de ventas de productos que usan el Panel de control y Estadísticas: un producto **activo** está disponible y entra en la proyección; al **desactivarlo o eliminarlo** pasa a contarse como **vendido** ("Eliminar" ahora es un borrado lógico para no perder la venta). Los productos que ya estaban desactivados se toman como vendidos. El cálculo de todas las métricas está en `server/metricas.js`. Como siempre, `schema.sql` ya incluye este cambio: alcanza con `node server/scripts/aplicar-schema.js`.
- `database/migracion_019_estados_producto.sql`: los productos pasan a tener tres estados —**Activo**, **Vendido** (botón “Producto vendido”, conserva fecha y precio) y **Desactivado** (no se ve en la web y no cuenta como stock ni como venta)—. **Eliminar** ahora borra el producto de verdad y deja libre su ID de producto; si estaba vendido, su venta pasa a `historial_ventas_productos` y las estadísticas la conservan. Un producto con pedidos asociados no se puede eliminar (se desactiva). Los productos que estaban desactivados pasan a *Desactivado*. Incluida en `schema.sql`.
- `database/migracion_020_dos_pasos.sql`: tabla `codigos_acceso` de la **verificación en dos pasos**. Al iniciar sesión se envía un código de 6 dígitos por email (vence a los 10 minutos, un solo uso, 5 intentos, se guarda sólo su hash). **Requiere el SMTP configurado** (`SMTP_*` en `.env`); `DOS_PASOS_OBLIGATORIO=false` la apaga como salida de emergencia. Incluida en `schema.sql`.
- `database/migracion_021_textos_portada.sql`: reemplaza el eslogan y la descripción de la portada de la web pública por los textos nuevos (“Un galpón de objetos con historia” y su bajada) y corrige el rubro si quedó como “Herreria e diseño”. Solo toca los valores que todavía son los textos anteriores: si se personalizaron desde Configuración, no se modifican. Se aplica con `node server/scripts/aplicar-schema.js` (ya está incluida en `schema.sql`).
- `database/migracion_016_tareas_por_pedido.sql`: las tareas de producción se definen al crear cada pedido (una lista propia por producto del pedido, en `pedido_etapas`) y los productos ya no tienen tareas; el pedido toma el precio de venta del producto (el formulario ya no pide precio ni arma presupuesto). La vieja tabla `etapas_producto` se conserva sólo como sugerencia de tareas. Incluida en `schema.sql`.
- `database/migracion_017_precio_opcional_y_categorias.sql`: el **precio de venta pasa a ser opcional** (columna `precio_venta` admite NULL; sin precio, la web pública muestra "Consultar precio", el panel "Sin precio" y el producto no se envía al catálogo de WhatsApp, que exige un precio) y publicar en la web ya no exige precio. Además, las **categorías creadas desde el panel** (sección Categorías) se conservan: el esquema ya no borra las que no sean Mesas, Mesitas ratoneras o Fogoneros. No modifica datos existentes. Incluida en `schema.sql`.
- `database/prueba-humo.mjs` recorre el flujo completo contra la API y borra al final todo lo que creó:

  ```bash
  npm run server            # en otra terminal
  node database/prueba-humo.mjs
  ```

## Autenticación y roles

- El primer administrador se carga a mano en la base de datos:

  ```bash
  node -e "console.log(require('bcrypt').hashSync('TuClave123', 12))"
  ```

  ```sql
  INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
  VALUES ('Administrador', 'admin@atelier.com', '<hash-bcrypt>', 'admin');
  -- o promover una cuenta existente:
  UPDATE usuarios SET rol = 'admin' WHERE email = 'tu-correo@ejemplo.com';
  ```

- Desde ahí el admin da de alta a los empleados en **Usuarios**: define la contraseña inicial, restablece claves y desactiva cuentas (baja lógica, nunca se borra el historial).
- No existe registro público: la única forma de crear una cuenta es desde el panel de **Usuarios**, y solo pueden hacerlo los roles `admin` y `super_admin`.

## Cómo funciona

### Productos

El admin define nombre, precio de venta y las **etapas de fabricación** propias del producto. Cada etapa lleva nombre, costo y duración estimada. El sistema muestra el costo total y el margen calculados a partir de esas etapas.

Al marcar un producto como **"Publicar en la web"** además se sincroniza solo con el catálogo de WhatsApp Business del cliente (una sola carga, dos catálogos). Ver [`INTEGRACION_WHATSAPP.md`](INTEGRACION_WHATSAPP.md) para la configuración completa.

### Pedidos

Un pedido agrupa **uno o más productos** con su cantidad y precio, más los datos del cliente (nombre, contacto, correo, dirección y notas). Al crearlo, cada etapa de cada producto se despliega como una **tarea de producción asignable a un empleado**, con el costo y la duración multiplicados por la cantidad pedida.

Las etapas guardan su propia copia de nombre, costo y minutos, así que editar el catálogo más adelante no altera la producción en curso. El estado del pedido (`PENDIENTE` → `EN_PRODUCCION` → `TERMINADO`) se recalcula solo según el avance de sus etapas.

### Tareas del empleado

En **Mis tareas** el empleado ve las etapas asignadas, las marca como iniciadas y, al terminarlas, **informa cuánto tiempo le llevó**. Ese dato es el que alimenta el semáforo.

### Semáforo y recompensas

Al cerrar una etapa se compara el tiempo real contra el estimado por el admin:

| Semáforo | Condición (tolerancia `t`, por defecto 10%) |
| --- | --- |
| 🟢 Verde | real ≤ estimado × (1 − t) — más rápido de lo esperado |
| 🟡 Amarillo | dentro de ± t del estimado |
| 🔴 Rojo | real > estimado × (1 + t) — más lento de lo esperado |

Solo el verde genera bono, calculado como:

```
bono = máx(bono_mínimo, (minutos_ahorrados / 60) × valor_hora × factor_ahorro)
```

Los cuatro parámetros (`recompensa_valor_hora`, `recompensa_factor_ahorro`, `recompensa_bono_minimo`, `semaforo_tolerancia`), más el interruptor `recompensa_activa`, viven en la tabla `configuracion` y se editan desde **Recompensas** o **Configuración** sin tocar código.

### Panel y estadísticas

- **Panel de control**: pedidos activos y atrasados, etapas pendientes y sin asignar, ganancia estimada, semáforo del taller, productos más vendidos, empleados con tareas pendientes y accesos directos para crear productos, pedidos y usuarios.
- **Estadísticas**: apartado propio y filtrable por fechas, con ingresos cobrados y en curso, gastos de producción y recompensas, ganancia neta y proyectada, facturación por mes, rentabilidad por producto y rendimiento de cada empleado (tareas completadas, tiempos promedio y conteo de semáforos).

### Manual de usuario

- Dentro del panel: sección **Manual de usuario** (admin, super admin y empleado; cada rol ve solo los capítulos que le corresponden), con índice, buscador y botón **Descargar PDF**.
- Todo el texto vive en un único archivo, `src/manual-contenido.js`. Para corregir o ampliar el manual se edita ahí.
- El PDF (`server/manual/manual-de-usuario.pdf`) se genera desde ese mismo archivo y lo entrega `GET /api/manual/pdf` solo a usuarios con sesión iniciada. Después de cambiar el contenido, regeneralo con `npm run manual:pdf` (usa Playwright; la primera vez puede hacer falta `npx playwright install chromium`) y recompilá con `npm run build`.

## API

| Recurso | Rutas |
| --- | --- |
| Autenticación | `POST /api/auth/iniciar-sesion`, `GET /api/auth/sesion`, `PATCH /api/auth/contrasena` |
| Usuarios | `GET /api/usuarios`, `GET /api/usuarios/empleados`, `POST /api/usuarios`, `PATCH /api/usuarios/:id`, `/:id/rol`, `/:id/activo`, `/:id/contrasena` |
| Productos | `GET|POST /api/productos`, `GET|PUT|DELETE /api/productos/:id`, `PATCH /api/productos/:id/activo`, `POST /api/productos/:id/whatsapp/reintentar` |
| Clientes | `GET|POST /api/clientes`, `PUT /api/clientes/:id` |
| Pedidos | `GET|POST /api/pedidos`, `GET|PATCH|DELETE /api/pedidos/:id` (solo informativo: no asigna empleados) |
| Tareas | `GET|POST /api/tareas`, `PATCH /api/tareas/:id/estado`, `PATCH /api/tareas/:tareaId/etapas/:etapaId`, `GET /api/tareas/asignadas/mias`, `PATCH /api/tareas/asignadas/:origen/:id/asignar` (única vía para asignar empleados a etapas), `PATCH /api/tareas/asignadas/:origen/:id/iniciar`, `PATCH /api/tareas/asignadas/:origen/:id/completar` |
| Recompensas | `GET|POST /api/recompensas`, `GET /api/recompensas/ranking`, `DELETE /api/recompensas/:id` |
| Estadísticas | `GET /api/estadisticas/resumen`, `GET /api/estadisticas/generales` |
| Manual | `GET /api/manual/pdf` (PDF del manual, requiere sesión) |
| Configuración | `GET /api/configuracion`, `GET /api/configuracion/valores`, `PUT /api/configuracion` |
