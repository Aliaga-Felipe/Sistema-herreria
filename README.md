# Un atelier — Hub de producción

Sistema de gestión para herrería, construido con React, Express y PostgreSQL. Incluye autenticación con JWT, RBAC, catálogo de productos, pedidos multiproducto con horas-hombre repartidas en etapas asignadas, producción diaria verificada por el administrador, recompensa diaria por equipo y estadísticas de gestión.

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
- `database/migracion_022_produccion_por_etapas.sql`: une productos, pedidos, tareas, producción diaria y recompensas en un solo flujo. Cada etapa de pedido guarda sus **horas-hombre** (`pedido_etapas.horas_hombre`; las etapas existentes toman sus minutos pasados a horas), cada jornada (`jornadas_equipo`) pasa a tener estado **ABIERTA / TERMINADA** y la nueva tabla `jornada_etapas` guarda qué etapas se propusieron para cada día. Los días del modelo anterior quedan como terminados con su detalle y `objetivos_produccion` / `registros_produccion` se conservan solo como historial. No borra datos. Incluida en `schema.sql`: alcanza con `node server/scripts/aplicar-schema.js`.
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

### El flujo de trabajo

Productos, pedidos, tareas, producción diaria y recompensas funcionan como un único circuito:

1. **Producto**: el admin lo crea con su precio, costos y **horas-hombre estimadas** para fabricar una unidad.
2. **Pedido**: desde el producto (botón **Crear pedido**) o desde Pedidos, el admin arma el pedido. Para cada producto indica las horas-hombre estimadas (se proponen las del producto) y las **reparte en etapas**, cada una con sus horas y **el empleado que la hace**. La suma de las etapas tiene que ser igual a la estimación: el formulario y la API lo validan.
3. **Producción diaria**: el admin propone qué se termina en el día: un **pedido completo**, un **producto** del pedido o **etapas sueltas**. Una etapa pendiente puede estar en una sola producción abierta a la vez.
4. **Mis tareas**: cada empleado ve sus etapas (arriba las de la producción de hoy) y, al terminar una, **solo la marca como terminada**: no informa cuánto tardó.
5. **Verificación**: el admin revisa el trabajo; si una etapa no quedó bien la **reabre** (vuelve a pendiente). Después marca la **producción diaria como terminada**.
6. **Recompensa**: si al terminar el día se completaron todas las etapas propuestas, el equipo cobra sus horas-hombre estimadas (ver abajo). Si falta alguna, ese día no hay recompensa y lo pendiente se puede proponer otro día.

### Productos

El admin define nombre, precio de venta, costos (materiales y costo por hora de mano de obra) y las **horas-hombre estimadas** por unidad, que se proponen al pedir el producto. Las etapas de fabricación no viven en el producto sino en cada pedido.

Al marcar un producto como **"Publicar en la web"** además se sincroniza solo con el catálogo de WhatsApp Business del cliente (una sola carga, dos catálogos). Ver [`INTEGRACION_WHATSAPP.md`](INTEGRACION_WHATSAPP.md) para la configuración completa.

### Pedidos

Un pedido agrupa **uno o más productos** con su cantidad (el precio sale del producto). Cada producto lleva sus horas-hombre estimadas por unidad repartidas en etapas (`pedido_etapas`), cada una con su nombre, sus horas y su responsable. Las horas se cargan por unidad y se multiplican por la cantidad; la mano de obra del pedido es horas-hombre estimadas × costo por hora.

Las etapas guardan su propia copia de nombre y horas, así que editar el producto más adelante no altera la producción en curso. Después de crear el pedido se pueden agregar o quitar etapas pendientes (las horas del producto en el pedido son siempre la suma de sus etapas) y reasignarlas desde **Tareas**. El estado del pedido (`PENDIENTE` → `EN_PRODUCCION` → `TERMINADO`) se recalcula solo según el avance de sus etapas.

### Tareas del empleado

En **Mis tareas** el empleado ve sus etapas asignadas, las de la producción de hoy primero, con sus horas-hombre y cómo viene el equipo en el día. Puede marcarlas como empezadas y, al terminarlas, solo confirma (con observaciones opcionales). Ya no se informa el tiempo real, así que el **semáforo de rendimiento dejó de calcularse**: las etapas cerradas antes lo conservan en la base como historial.

### Recompensa del equipo

Todo el taller es un único equipo y la recompensa se paga por día, por completar la producción propuesta para la jornada (nunca por empleado). En **Producción diaria** el admin la arma y la da por terminada; en **Recompensas** se ve el desglose y el historial.

```
propuesto (hs)    = Σ horas-hombre estimadas de las etapas propuestas para el día
completado (hs)   = Σ horas-hombre de las que ya están completadas
recompensa        = propuesto × valor hora-hombre × % de premio   si se completaron todas
                    0                                             si falta alguna
```

- La jornada (`jornadas_equipo`) está **ABIERTA** mientras se trabaja: el resultado se calcula en vivo. Al marcarla como **TERMINADA** se guarda una copia de sus etapas y del cálculo (`objetivo_detalle` y totales), que ya no cambia aunque después se editen los pedidos. Se puede reabrir; la recompensa vuelve a 0 hasta terminarla de nuevo.
- Solo cuentan como gasto (Estadísticas) las recompensas de días **terminados**.
- Armar, verificar y cerrar la producción del día, el valor hora-hombre y el % de premio (por defecto 100%) son solo de `admin` o `super_admin`; la API lo valida. El valor hora y el % tienen historial por fecha (`parametros_recompensa_historial`).
- Una etapa que ya se pagó en un día terminado y cumplido no se puede reabrir (hay que reabrir primero ese día).
- La lógica está en funciones puras en `server/recompensa-equipo.js` y la lectura/cierre en `server/jornadas.js`. Tests: `npm test` (los de permisos usan la base de `.env`).
- Los días del modelo anterior (objetivos diarios por producto) quedan como terminados y se ven en Recompensas. Las recompensas individuales del sistema anterior quedan como historial de solo lectura y siguen contando como gasto.

### Panel y estadísticas

- **Panel de control**: pedidos activos y atrasados, etapas y horas-hombre pendientes, ingresos en curso, **producción de hoy** (avance y recompensa), productos vendidos, empleados con tareas pendientes y accesos directos (nuevo pedido, producto, empleado, producción diaria, tareas y recompensas).
- **Estadísticas**: apartado propio y filtrable por fechas, con ingresos cobrados y en curso, gastos de producción y recompensas, ganancia neta y proyectada, facturación por mes, resumen de las producciones diarias (días completados, horas propuestas y completadas), rentabilidad por producto y rendimiento de cada empleado en etapas y horas-hombre completadas.

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
| Pedidos | `GET|POST /api/pedidos` (cada producto con `horas_hombre` y sus etapas `{ nombre, horas_hombre, responsable_id }`), `GET|PATCH|DELETE /api/pedidos/:id`, `GET /api/pedidos/tareas-sugeridas`, `POST /api/pedidos/:id/items/:itemId/tareas`, `PATCH|DELETE /api/pedidos/:id/tareas/:tareaId` |
| Tareas | `GET|POST /api/tareas`, `PATCH /api/tareas/:id/estado`, `PATCH /api/tareas/:tareaId/etapas/:etapaId`, `GET /api/tareas/asignadas/mias`, `PATCH /api/tareas/asignadas/:origen/:id/asignar` (reasignar), `PATCH /api/tareas/asignadas/:origen/:id/iniciar`, `PATCH /api/tareas/asignadas/:origen/:id/completar` (sin informar tiempo), `PATCH /api/tareas/asignadas/PEDIDO/:id/reabrir` (admin) |
| Recompensas | `GET /api/recompensas/equipo`, `GET /api/recompensas/equipo/dia/:fecha`, `GET|PUT /api/recompensas/parametros`, `GET /api/recompensas/historial-individual` |
| Producción | `GET|DELETE /api/produccion/jornada/:fecha`, `POST /api/produccion/jornada/:fecha/etapas` (`{ pedido_id }`, `{ pedido_item_id }` o `{ etapas }`), `DELETE /api/produccion/jornada/:fecha/etapas/:etapaId`, `POST /api/produccion/jornada/:fecha/terminar`, `POST /api/produccion/jornada/:fecha/reabrir` |
| Estadísticas | `GET /api/estadisticas/resumen`, `GET /api/estadisticas/generales` |
| Manual | `GET /api/manual/pdf` (PDF del manual, requiere sesión) |
| Configuración | `GET /api/configuracion`, `GET /api/configuracion/valores`, `PUT /api/configuracion` |
