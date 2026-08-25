# El Atelier — Hub de producción

Sistema de gestión para herrería, construido con React, Express y PostgreSQL. Incluye autenticación con JWT, RBAC y tareas por etapas fijas.

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

- El administrador accede a `/admin`: gestiona roles, crea tareas y las asigna.
- El empleado accede a `/mis-tareas`: solo ve sus tareas, controla etapas y actualiza su estado.

Cada tarea crea siempre tres etapas fijas: Preparación, Ejecución y Control de calidad. El administrador define el tiempo estimado de cada una al crear la tarea.
