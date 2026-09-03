# El Atelier — Hub de producción

Sistema de gestión para herrería, construido con React, Express y PostgreSQL. Incluye autenticación con JWT, RBAC, catálogo de productos con etapas de fabricación, pedidos multiproducto, semáforo de rendimiento con recompensas automáticas y estadísticas de gestión.

## Puesta en marcha

1. Cree una base de datos PostgreSQL llamada `atelier_herreria` y ejecute `database/schema.sql`.
2. Copie `.env.example` como `.env` y complete `DATABASE_URL` y `JWT_SECRET`.
3. Instale las dependencias con `npm install`.
4. En una terminal ejecute `npm run server` y en otra `npm run dev`.

### Base de datos

- `database/schema.sql` es el esquema completo y **es idempotente**: puede ejecutarse sobre una base vacía o sobre una ya en uso sin perder datos.
- `database/migracion_002_produccion.sql` es el delta para bases que venían del esquema anterior (agrega productos con precio, pedidos multiproducto, semáforo, recompensas y configuración).
- `database/migracion_003_detalle_tareas.sql` es el delta que agrega fecha de inicio, fecha de entrega y prioridad a la bandeja de tareas (`vista_tareas_empleado`), usados por el modal de detalle del panel **Tareas**. Si ya ejecutaste `schema.sql` con esta versión no hace falta correrla aparte.
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
- El registro público (`/registro`) sigue disponible y siempre crea usuarios con rol `empleado`.

## Cómo funciona

### Productos

El admin define nombre, precio de venta y las **etapas de fabricación** propias del producto. Cada etapa lleva nombre, costo y duración estimada. El sistema muestra el costo total y el margen calculados a partir de esas etapas.

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

## API

| Recurso | Rutas |
| --- | --- |
| Autenticación | `POST /api/auth/registro`, `POST /api/auth/iniciar-sesion`, `GET /api/auth/sesion`, `PATCH /api/auth/contrasena` |
| Usuarios | `GET /api/usuarios`, `GET /api/usuarios/empleados`, `POST /api/usuarios`, `PATCH /api/usuarios/:id`, `/:id/rol`, `/:id/activo`, `/:id/contrasena` |
| Productos | `GET|POST /api/productos`, `GET|PUT|DELETE /api/productos/:id`, `PATCH /api/productos/:id/activo` |
| Clientes | `GET|POST /api/clientes`, `PUT /api/clientes/:id` |
| Pedidos | `GET|POST /api/pedidos`, `GET|PATCH|DELETE /api/pedidos/:id`, `PATCH /api/pedidos/:id/etapas/:etapaId/asignar`, `PATCH /api/pedidos/:id/asignaciones` |
| Tareas | `GET|POST /api/tareas`, `PATCH /api/tareas/:id/estado`, `PATCH /api/tareas/:tareaId/etapas/:etapaId`, `GET /api/tareas/asignadas/mias`, `PATCH /api/tareas/asignadas/:origen/:id/iniciar`, `PATCH /api/tareas/asignadas/:origen/:id/completar` |
| Recompensas | `GET|POST /api/recompensas`, `GET /api/recompensas/ranking`, `DELETE /api/recompensas/:id` |
| Estadísticas | `GET /api/estadisticas/resumen`, `GET /api/estadisticas/generales` |
| Configuración | `GET /api/configuracion`, `GET /api/configuracion/valores`, `PUT /api/configuracion` |
