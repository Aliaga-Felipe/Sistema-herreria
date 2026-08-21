# El Atelier — Hub de producción

Sistema de gestión para herrería, construido con React, Express y PostgreSQL. La interfaz está en español e incorpora el lenguaje visual oscuro y cálido de las referencias.

## Puesta en marcha

1. Cree una base de datos PostgreSQL llamada `atelier_herreria` y ejecute `database/schema.sql`.
2. Copie `.env.example` como `.env` y complete `DATABASE_URL` y `JWT_SECRET`.
3. Instale las dependencias con `npm install`.
4. En una terminal ejecute `npm run server` y en otra `npm run dev`.

## Alcance incluido

- Panel operativo y producción mensual responsivos.
- Alta visual de productos con etapas dinámicas.
- Modelo relacional para usuarios, equipos, productos, etapas, pedidos y recompensas.
- API con autenticación JWT, control de rol administrador y recuperación de contraseña de un solo uso (15 minutos).

> Para producción, conecte el envío de correo en `POST /api/auth/recuperar`, use HTTPS, una clave JWT segura y un proveedor de correo transaccional.
