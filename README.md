# El Atelier — Hub de producción

Sistema de gestión para herrería, construido con React, Express y PostgreSQL. Incluye autenticación con JWT, RBAC y producción por productos con etapas configurables.

## Puesta en marcha

1. Cree una base de datos PostgreSQL llamada `atelier_herreria` y ejecute `database/schema.sql`.
2. Copie `.env.example` como `.env` y complete `DATABASE_URL` y `JWT_SECRET`.
3. Instale las dependencias con `npm install`.
4. En una terminal ejecute `npm run server` y en otra `npm run dev`.

## Autenticación y roles

- El registro público (`/registro`) crea exclusivamente usuarios con rol `empleado`.
- Para crear el primer administrador, registre una cuenta y ejecute en PostgreSQL:

  ```sql
  UPDATE usuarios SET rol = 'admin' WHERE email = 'tu-correo@ejemplo.com';
  ```

- El administrador accede a `/admin`: crea productos, define sus etapas y tiempos, los asigna a operarios y gestiona roles.
- El empleado accede a `/mis-tareas`: solo ve los productos asignados, controla etapas y actualiza su estado.

Un producto asignado se convierte directamente en una tarea de producción. El administrador puede agregar las etapas que necesite y establecer los minutos estimados de cada una antes de crearlo.
