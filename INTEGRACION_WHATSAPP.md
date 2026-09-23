# Integración con el catálogo de WhatsApp Business

Cuando el admin crea o edita un producto y lo marca como **"Publicar en la
web"**, el sistema lo guarda en PostgreSQL, lo muestra en el catálogo público
y además intenta sincronizarlo automáticamente con el catálogo de Meta
conectado al WhatsApp Business del cliente. Es una sola carga: no hace falta
repetirla a mano en WhatsApp.

Esta integración usa la **API oficial de Meta** (Graph API / Commerce
Platform). No usa WhatsApp Web, scraping ni librerías no oficiales.

## 1. Qué necesita tener el cliente antes de empezar

1. **WhatsApp Business** con el número real ya verificado.
2. Una **Meta Business Portfolio** (Business Manager) que administre ese
   WhatsApp Business Account (WABA).
3. Un **catálogo de productos** en Meta Commerce Manager, con el tipo
   "E-commerce", que sea de la misma Business Manager que el WABA.
4. El catálogo **conectado** a esa cuenta de WhatsApp Business (WhatsApp
   Manager → Catálogo → Conectar).

Si el cliente ya usa el catálogo de WhatsApp manualmente (según lo que nos
dijeron, sí lo tiene), los puntos 3 y 4 ya deberían estar hechos. Igual
conviene confirmarlos antes de seguir.

> **Si no tenemos alguno de estos datos confirmados, no lo inventamos.** El
> código queda preparado para funcionar en cuanto se completen las
> variables de entorno (paso 4); hasta entonces, la sincronización queda
> simplemente apagada y el resto del sistema sigue funcionando normal.

## 2. Qué hay que crear en Meta for Developers

1. Entrar a [developers.facebook.com](https://developers.facebook.com/) y
   crear (o reutilizar) una app de tipo "Business".
2. Agregar el producto **WhatsApp** y/o **Marketing API** a la app, según lo
   que pida el flujo (para operar el catálogo alcanza con permisos de
   Marketing API / Commerce sobre el catálogo).
3. Asociar la app a la misma **Business Manager** que tiene el catálogo y el
   WABA del cliente.
4. Crear un **usuario del sistema** (System User) dentro de la Business
   Manager (Configuración del negocio → Usuarios → Usuarios del sistema):
   - Asignarle el catálogo con permiso de **administración total**
     (`catalog_management`).
   - Generar un **token de acceso** para ese usuario del sistema, con el
     permiso `catalog_management` (y `whatsapp_business_management` si más
     adelante se agrega envío de mensajes). Un token de usuario del
     sistema no vence cada 60 días como el de un usuario normal, así que es
     la forma recomendada para un proceso de servidor como este.

Con esto se obtienen los datos que van al `.env` del servidor (paso 4).

## 3. Dónde obtener cada dato

| Variable | Dónde se obtiene |
| --- | --- |
| `META_ACCESS_TOKEN` | Business Manager → Usuarios del sistema → generar token (permiso `catalog_management`) |
| `META_CATALOG_ID` | Commerce Manager → el catálogo → Configuración → "ID del catálogo" |
| `META_WABA_ID` | WhatsApp Manager → Configuración de la cuenta → "ID de la cuenta de WhatsApp Business" (hoy no lo usa el código; se guarda documentado, ver `.env.example`) |
| `META_PHONE_NUMBER_ID` | WhatsApp Manager → Números de teléfono (hoy no lo usa el código; queda documentado para una futura integración de mensajería) |
| `META_GRAPH_API_VERSION` | La versión vigente de la Graph API, ver [changelog oficial](https://developers.facebook.com/docs/graph-api/changelog). Verificarla antes de desplegar: Meta retira versiones viejas con el tiempo. |
| `PUBLIC_BASE_URL` | El dominio público (https) donde va a quedar publicada esta aplicación (por ejemplo `https://elatelier.com.ar`) |

## 4. Variables de entorno del servidor

Copiar `.env.example` como `.env` (si todavía no existe) y completar:

```
WHATSAPP_SYNC_ENABLED=true
META_ACCESS_TOKEN=<token del usuario del sistema>
META_CATALOG_ID=<id del catálogo>
META_WABA_ID=<id de la cuenta de WhatsApp Business>
META_PHONE_NUMBER_ID=<phone number id>
META_GRAPH_API_VERSION=v23.0
PUBLIC_BASE_URL=https://tu-dominio-real.com
```

**Importante:**
- Estas variables viven **sólo en el servidor** (`server/`), nunca en el
  frontend. Ninguna variable con prefijo `VITE_` expone esto al navegador.
- Mientras `WHATSAPP_SYNC_ENABLED` no sea exactamente `true`, el sistema
  nunca llama a la API de Meta, sin importar qué otras variables estén
  completas. Es el interruptor general de esta funcionalidad.
- `PUBLIC_BASE_URL` tiene que ser un dominio público real (https). Meta
  necesita poder descargar la imagen del producto y abrir su página; no
  puede acceder a `http://localhost`. Por eso en desarrollo local esta
  variable queda vacía y la sincronización no corre (aunque se active
  `WHATSAPP_SYNC_ENABLED`, va a fallar con un error claro: "falta
  PUBLIC_BASE_URL").
- Después de cambiar el `.env` hay que reiniciar el servidor
  (`npm run server`) para que tome los valores nuevos.

## 5. Cómo funciona la sincronización (para quien mantenga el código)

- Endpoint de Meta usado: `POST /{catalog_id}/products` de la Graph API.
  Este endpoint hace **upsert** por `retailer_id`: si ya existe un ítem con
  ese `retailer_id` lo actualiza, si no existe lo crea. Por eso alcanza con
  llamarlo siempre igual, tanto para crear como para editar, sin tener que
  guardar ni reenviar el id numérico que devuelve Meta.
- El `retailer_id` que se envía es propio del sistema: `atelier-<id interno
  del producto>` (columna `whatsapp_retailer_id`, ver
  `database/migracion_013_integracion_whatsapp_catalogo.sql`). **No** es
  `chapita_id` (la chapita vintage que ve el público en la web) ni
  `id_pieza` (columna vieja sin uso): son identificadores con otro
  propósito, que el admin puede seguir editando a mano sin que eso rompa la
  sincronización.
- Se sincronizan: nombre, descripción técnica, precio (según `moneda` en
  Configuración), la foto principal (URL absoluta armada con
  `PUBLIC_BASE_URL`) y el link a la página pública del producto
  (`PUBLIC_BASE_URL/productos/<slug>`).
- **Cuándo se dispara sola:** al crear o editar un producto, al subir/cambiar/
  borrar sus fotos y al activar/desactivar el producto. Siempre corre en
  segundo plano (no atrasa la respuesta del guardado) y **nunca** impide que
  el producto quede guardado en PostgreSQL, aunque Meta falle.
- **Desactivación:** cuando un producto deja de estar activo o publicado,
  en vez de borrarlo del catálogo de Meta se lo marca `availability:
  "discontinued"` (`out of stock`/no disponible). Es la alternativa que
  recomienda la documentación de Meta para no perder el historial que usan
  sus recomendaciones; volver a publicar el producto lo reactiva solo.
- **Estados** (columna `whatsapp_sync_estado`, visibles en la tarjeta del
  producto en el panel):
  - `NO_SINCRONIZADO`: todavía no se intentó (borrador, o la integración
    está apagada).
  - `PENDIENTE`: sincronización en curso.
  - `SINCRONIZADO`: el último intento fue exitoso.
  - `ERROR`: el último intento falló; el motivo queda en
    `whatsapp_sync_error` (nunca se guardan tokens ni datos sensibles ahí)
    y se ve en el panel. Desde la tarjeta del producto hay un botón
    "Reintentar WhatsApp".
- Un producto **publicado sin ninguna foto cargada** puede guardarse
  igual (la foto no es obligatoria para publicar en la web), pero la
  sincronización con WhatsApp va a quedar en `ERROR` con el motivo "no
  tiene ninguna foto cargada", porque Meta exige imagen. Alcanza con
  subirle una foto: la sincronización se reintenta sola.

## 6. Cómo probar la integración

1. Completar las variables del paso 4 con datos reales y reiniciar el
   servidor.
2. Desde el panel, crear o editar un producto: completar nombre, ID
   (chapita), precio, descripción técnica, historia y categoría, subirle al
   menos una foto, y tildar **"Publicar en la web"**.
3. Guardar. En la tarjeta del producto va a aparecer la insignia
   **"WhatsApp …"** (sincronizando) y, unos segundos después, al recargar el
   panel, **"WhatsApp ✓"** si salió bien.
4. Si aparece **"WhatsApp ✗"**, el motivo se muestra debajo del nombre del
   producto. Corregir lo que indique y usar el botón **"Reintentar
   WhatsApp"** de la tarjeta (no hace falta volver a guardar todo el
   producto).
5. Para confirmar que el producto apareció realmente en WhatsApp: abrir
   Commerce Manager → el catálogo → buscar el producto por su nombre (o por
   su `retailer_id`, visible en la base como `atelier-<id>`), o revisarlo
   desde la app de WhatsApp Business del cliente (pestaña Catálogo).
6. Cambiar el precio o el nombre del producto y guardar de nuevo: el mismo
   ítem en Meta se actualiza (no se crea uno duplicado), gracias al upsert
   por `retailer_id`.

## 7. Si algo falla

| Síntoma / error | Causa probable | Qué hacer |
| --- | --- | --- |
| "Integración con WhatsApp no configurada: falta ..." | Falta completar alguna variable de entorno | Completar `.env` según el paso 4 y reiniciar el servidor |
| "La integración con WhatsApp no está habilitada..." (al reintentar) | `WHATSAPP_SYNC_ENABLED` no es `true` | Activarla en `.env` y reiniciar |
| "El producto no tiene ninguna foto cargada..." | Producto publicado sin fotos | Subirle al menos una foto |
| Error con "OAuthException" o mención a un token inválido/expirado | El `META_ACCESS_TOKEN` venció o se revocó | Generar un token nuevo del usuario del sistema (paso 2) y actualizar `.env` |
| Error mencionando permisos insuficientes | El usuario del sistema no tiene `catalog_management` sobre ese catálogo | Revisar la asignación de activos en Business Manager |
| Error mencionando el catálogo o un id inexistente | `META_CATALOG_ID` mal copiado, o no pertenece a esa Business Manager | Volver a copiarlo desde Commerce Manager |
| Error de red / tiempo de espera agotado | Problema temporal de conexión con Meta, o límite de llamadas por hora superado (Meta limita 100 llamadas por catálogo por hora) | Usar "Reintentar WhatsApp" más tarde |
| El producto se guardó pero no se ve en la web | No tiene que ver con esta integración: revisar que esté "Publicar en la web" y activo | Ver la sección Productos del panel |

En ningún caso un error de Meta hace que se pierda el producto: siempre
queda guardado en PostgreSQL y disponible para reintentar.

## 8. Renovar o reemplazar credenciales

- **Token vencido o revocado:** generar uno nuevo desde el mismo usuario del
  sistema (Business Manager → Usuarios del sistema → Generar nuevo token,
  mismo permiso `catalog_management`), actualizar `META_ACCESS_TOKEN` en el
  `.env` del servidor y reiniciarlo. Los tokens de usuario del sistema no
  vencen solos, pero se pueden revocar a mano o al eliminar el usuario del
  sistema.
- **Cambio de catálogo o de cuenta de WhatsApp:** actualizar
  `META_CATALOG_ID` (y `META_WABA_ID`/`META_PHONE_NUMBER_ID` si
  corresponde) y reiniciar el servidor. Los productos ya sincronizados
  contra el catálogo anterior van a quedar sólo ahí: hay que volver a
  guardarlos (o usar "Reintentar WhatsApp") para que se creen en el
  catálogo nuevo.
- **Versión de la Graph API:** Meta retira versiones viejas
  periódicamente. Revisar el
  [changelog oficial](https://developers.facebook.com/docs/graph-api/changelog)
  de tanto en tanto y actualizar `META_GRAPH_API_VERSION` antes de que la
  versión en uso deje de estar soportada.

## 9. Límite conocido

Si un producto llega a eliminarse **definitivamente** de PostgreSQL (sólo
es posible si nunca tuvo pedidos asociados) después de haber estado
sincronizado con WhatsApp, el sistema lo marca `discontinued` en Meta antes
de borrar la fila local. Si ese intento de aviso a Meta falla (por ejemplo,
por un corte de red justo en ese momento), el ítem puede quedar visible en
el catálogo de Meta sin ningún registro local que lo referencie. En ese
caso hay que sacarlo a mano desde Commerce Manager.
