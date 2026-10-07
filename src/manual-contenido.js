// ---------------------------------------------------------------------
// MANUAL DE USUARIO — "Un atelier"
//
// Esta es la ÚNICA fuente del manual: la sección "Manual de usuario" del
// panel (src/panel-manual.jsx) y el PDF (scripts/generar-manual-pdf.mjs)
// se generan a partir de este archivo. Para corregir o ampliar el manual
// se edita acá y se vuelve a generar el PDF (ver README.md).
//
// Formato de cada bloque:
//   { t: 'p',     x: 'Texto' }                       párrafo
//   { t: 'ul',    x: ['a', 'b'] }                    lista con viñetas
//   { t: 'ol',    x: ['paso 1', 'paso 2'] }          pasos numerados
//   { t: 'nota',  x: 'Consejo útil' }                recuadro de consejo
//   { t: 'aviso', x: 'Algo importante' }             recuadro de atención
//   { t: 'tabla', cab: ['A', 'B'], filas: [['a', 'b']] }
//   { t: 'img',   src: 'archivo.png', pie: 'Epígrafe' } captura de src/manual-capturas/
// Dentro de un texto, **así** se muestra en negrita.
//
// `para` indica quién ve el capítulo: 'super_admin', 'admin' y/o 'empleado'.
// El rol 'super_admin' es interno: NO se nombra en ningún texto del manual, y
// los capítulos que son solo para ese rol no se incluyen en el PDF.
// ---------------------------------------------------------------------

export const MANUAL_VERSION = 'Octubre 2026'

const TODOS = ['super_admin', 'admin', 'empleado']
const GESTION = ['super_admin', 'admin']

export const manual = {
  titulo: 'Manual de usuario',
  marca: 'Un atelier',
  subtitulo: 'Guía paso a paso para usar el sistema de gestión del taller',
  capitulos: [
    {
      id: 'introduccion',
      titulo: 'Qué es este sistema y cómo usar el manual',
      para: TODOS,
      bloques: [
        { t: 'p', x: 'El sistema de **Un atelier** sirve para organizar el trabajo del taller en un solo lugar: cargar los productos, tomar pedidos, repartir las tareas entre los empleados, registrar lo que se produce y lo que se vende, y mostrar el catálogo en la web pública.' },
        { t: 'p', x: 'Este manual explica cada pantalla con palabras simples. No hace falta saber de informática. Cada capítulo indica al principio qué hace la sección y quién puede usarla.' },
        { t: 'p', x: 'Hay dos tipos de cuenta, cada una con permisos distintos:' },
        {
          t: 'tabla',
          cab: ['Tipo de cuenta', 'Qué puede hacer'],
          filas: [
            ['Administrador', 'Gestiona productos, categorías, pedidos (con sus etapas y empleados), la producción diaria, la recompensa del equipo y estadísticas. Da de alta empleados y restablece sus contraseñas.'],
            ['Empleado', 'Ve solo sus etapas de trabajo asignadas (primero las de la producción de hoy), las empieza y las marca como terminadas. No tiene que informar cuánto tardó.']
          ]
        },
        { t: 'nota', x: 'En la esquina superior derecha del panel aparece un círculo con una letra: **A** es administrador y **O** es empleado. Sirve para saber con qué tipo de cuenta estás trabajando.' }
      ]
    },
    {
      id: 'ingreso',
      titulo: 'Ingresar al sistema y verificar tu identidad',
      para: TODOS,
      bloques: [
        { t: 'p', x: 'Para cuidar la información del taller, el ingreso tiene **dos pasos**: primero tu correo y contraseña, y después un código de 6 números que te llega por mail.' },
        {
          t: 'ol',
          x: [
            'Abrí la página de ingreso del sistema (“Iniciar sesión”).',
            'Escribí tu correo electrónico y tu contraseña y tocá el botón para continuar.',
            'Aparece la pantalla **“Verificá tu identidad”**. Te avisa a qué correo se envió el código, con parte de la dirección oculta (por ejemplo, ma******@dominio.com).',
            'Abrí ese correo, copiá el código de 6 números y escribilo en la pantalla.',
            'Tocá **“Verificar e ingresar”**. Entrás al panel.'
          ]
        },
        { t: 'img', src: 'ingreso.png', pie: 'Pantalla de ingreso: correo y contraseña.' },
        { t: 'p', x: 'Cosas importantes sobre el código:' },
        {
          t: 'ul',
          x: [
            'Se envía al correo que figura en tu cuenta, no necesariamente al que usás todos los días. Si no te llega, pedile a un administrador que confirme qué correo tenés cargado.',
            'Dura **10 minutos** y sirve **una sola vez**.',
            'Tenés **5 intentos** para escribirlo bien. Si te equivocás demasiadas veces, hay que empezar de nuevo desde el correo y la contraseña.',
            'Si no llegó, esperá un minuto y tocá **“Reenviar código”**. Se puede reenviar unas pocas veces por código. Antes de reenviar, **revisá la carpeta de spam o correo no deseado**.',
            'Con **“Volver”** regresás a la pantalla anterior para corregir el correo o la contraseña.'
          ]
        },
        { t: 'aviso', x: 'Nunca compartas tu código ni tu contraseña, ni siquiera con alguien del taller. El sistema jamás te va a pedir el código por teléfono o por chat.' },
        { t: 'p', x: '**Cuánto dura la sesión.** Una vez adentro, la sesión queda abierta unas 8 horas. Después el sistema te pide ingresar de nuevo. Si dejás de trabajar, usá siempre **“Cerrar sesión”** (abajo en el menú lateral), sobre todo en computadoras compartidas.' },
        { t: 'p', x: '**Si ingresás mal varias veces.** Por seguridad, después de varios intentos fallidos el sistema te pide esperar unos minutos antes de volver a probar. No es un error: es una protección.' }
      ]
    },
    {
      id: 'panel',
      titulo: 'Conocer el panel',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Al ingresar como administrador ves el **menú lateral** con todas las secciones y, a la derecha, el contenido de la sección elegida. En el celular el menú se abre con el botón de tres rayitas (arriba a la izquierda) y se cierra al elegir una sección.' },
        { t: 'img', src: 'panel.png', pie: 'El panel: a la izquierda el menú con las secciones y a la derecha el Panel de control.' },
        {
          t: 'tabla',
          cab: ['Sección', 'Para qué sirve'],
          filas: [
            ['Panel de control', 'Resumen del taller de un vistazo y accesos directos.'],
            ['Productos', 'Catálogo: precios, costos, fotos, estados y publicación en la web.'],
            ['Categorías', 'Grupos para ordenar los productos.'],
            ['Tareas', 'Todas las etapas de los pedidos con sus empleados: reasignarlas, cambiar cuántos empleados necesitan o reabrirlas.'],
            ['Pedidos', 'Trabajos comprometidos: productos, horas-hombre, etapas con sus empleados, fechas y avance.'],
            ['Producción diaria', 'Qué se propone terminar cada día, su avance, la verificación, el cierre del día y el historial de días.'],
            ['Estadísticas', 'Ventas, gastos, ganancias y rendimiento del equipo.'],
            ['Recompensas', 'Cuánto cobró el equipo (hoy, en el mes y en total) y el valor de la hora-hombre.'],
            ['Usuarios', 'Cuentas de las personas del taller.'],
            ['Manual de usuario', 'Esta guía, con búsqueda y descarga en PDF.']
          ]
        },
        { t: 'h', x: 'El Panel de control' },
        { t: 'p', x: 'Es la pantalla inicial. Muestra cifras clave (pedidos abiertos, pedidos atrasados, etapas y horas-hombre pendientes, ingresos en curso y la **producción de hoy**, con su avance y la recompensa en juego), los pedidos en curso ordenados por prioridad y fecha de entrega, los últimos productos vendidos y los empleados con tareas pendientes. Desde ahí también hay accesos directos para crear un pedido, un producto o un empleado y para ir a Producción diaria, Tareas y Recompensas.' },
        { t: 'nota', x: 'Los números se actualizan solos cada tanto y cuando volvés a la pestaña del navegador. Si algo no coincide con lo que esperás, recargá la página.' }
      ]
    },
    {
      id: 'flujo',
      titulo: 'Cómo se organiza el trabajo: del producto a la recompensa',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Productos, pedidos, tareas, producción diaria y recompensas forman **un solo circuito**. Conviene entenderlo una vez, porque todas las pantallas de gestión se apoyan en él:' },
        {
          t: 'ol',
          x: [
            '**Producto.** Lo cargás en Productos con sus **horas-hombre estimadas**: las horas de trabajo que lleva fabricar una unidad.',
            '**Pedido.** Le asignás un pedido al producto (botón **“Crear pedido”** en la tarjeta del producto, o desde Pedidos). Ahí repartís esas horas-hombre en **etapas** (Corte, Soldadura, Pintura…) y elegís **cuántos empleados** necesita cada una y **quiénes** son. La suma de las etapas tiene que dar las horas-hombre estimadas.',
            '**Producción diaria.** Cada día proponés qué se va a terminar: **un pedido completo**, **un producto** del pedido o **etapas sueltas**.',
            '**Mis tareas.** Cada empleado ve sus etapas, primero las de hoy. Cuando termina una, la marca como terminada. **No tiene que decir cuánto tardó.**',
            '**Verificación.** Revisás el trabajo. Si algo no quedó bien, reabrís esa etapa. Cuando está todo en orden, marcás la **producción diaria como terminada**.',
            '**Recompensa.** Si se completó todo lo propuesto, el equipo cobra las horas-hombre de ese día por el valor de la hora-hombre. Si faltó algo, ese día no hay recompensa.'
          ]
        },
        { t: 'p', x: '**Ejemplo.** Una mesa de comedor lleva 11 horas-hombre: Corte 3 hs (Martín), Soldadura 6 hs (Lucía) y Pintura 2 hs (Diego). Si hoy proponés la mesa completa y los tres terminan sus etapas, al cerrar el día el equipo cobra 11 horas-hombre: con la hora a $2.500 y 100 % de premio, **$27.500**.' },
        { t: 'nota', x: 'Las horas-hombre que se pagan son siempre las **estimadas** por el administrador al armar el pedido: el sistema no mide cuánto tardó cada uno. Por eso es importante estimarlas bien.' }
      ]
    },
    {
      id: 'productos',
      titulo: 'Productos',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Cada producto es una pieza del catálogo del taller. Acá se define cuánto cuesta fabricarla, a qué precio se vende, cómo se ve y si aparece o no en la web pública.' },
        { t: 'img', src: 'productos.png', pie: 'Listado de productos con sus filtros por estado y las acciones de cada uno.' },
        { t: 'h', x: 'Crear un producto nuevo' },
        {
          t: 'ol',
          x: [
            'Entrá a **Productos** y tocá **“+ Nuevo producto”**.',
            'Completá el **nombre**. El **ID de producto (chapita)** se genera solo; podés cambiarlo. Es el número que aparece en la chapita de la pieza y en la web.',
            'Elegí la **categoría** y, si querés, cargá las **horas-hombre estimadas** (las horas de trabajo para fabricar una unidad), las medidas y el precio de venta. Si dejás el precio vacío, la web muestra “Consultar precio”.',
            'Escribí la **descripción técnica** (medidas, materiales, notas) y la **historia del producto** (el relato detrás de la pieza). Se muestran en la web pública.',
            'Si querés que se vea en la web, marcá **“Publicar en la web”**. Para publicar son obligatorios: nombre, ID, descripción técnica, historia y categoría. Sin esa marca, el producto queda como **borrador**, visible solo en el panel.',
            'Opcional: marcá **“Producto destacado”** para que aparezca en la portada de la web.',
            'Tocá guardar. Recién con el producto guardado podés **cargarle fotos**.'
          ]
        },
        { t: 'img', src: 'producto-nuevo.png', pie: 'Formulario “Nuevo producto”.' },
        { t: 'h', x: 'Fotos' },
        {
          t: 'ul',
          x: [
            'Se pueden subir varias fotos (JPG, PNG, WEBP o GIF, hasta 8 MB cada una) arrastrándolas, eligiéndolas o pegándolas con Ctrl+V.',
            'La foto marcada como **Principal** es la que se ve en el catálogo. Para cambiarla, tocá **“Hacer principal”** en otra foto.',
            'Con **“Quitar”** se elimina una foto.'
          ]
        },
        { t: 'img', src: 'producto-fotos.png', pie: 'Fotos de un producto: la principal está marcada y abajo está la zona para subir más.' },
        { t: 'h', x: 'Costos y márgenes' },
        { t: 'p', x: 'Cada producto calcula solo su costo: **materiales** (precio unitario por cantidad que usa una unidad) más **mano de obra** (horas-hombre por el costo por hora que define el taller). Con el precio de venta se obtiene el **margen**. Esta información es interna: no se muestra en la web.' },
        { t: 'nota', x: 'Las **horas-hombre** del producto se proponen solas cada vez que se arma un pedido de ese producto, donde se reparten en etapas (ver “Pedidos”). Cambiarlas no modifica los pedidos ya creados.' },
        { t: 'h', x: 'Crear un pedido desde el producto' },
        { t: 'p', x: 'En la tarjeta de cada producto activo está el botón **“Crear pedido”**: abre el formulario de pedido con ese producto ya elegido, sus horas-hombre y, si ya se pidió antes, las mismas etapas y empleados de la última vez.' },
        { t: 'h', x: 'WhatsApp' },
        { t: 'p', x: 'Cada producto muestra una marca de sincronización con el catálogo de WhatsApp: ✓ sincronizado, ✗ con error (al pasar el mouse se ve el motivo), … sincronizando y — todavía sin sincronizar. Es informativa; el sistema la actualiza solo.' },
        { t: 'h', x: 'Buscar y filtrar' },
        { t: 'p', x: 'Sobre el listado hay filtros por estado: **Todos, Activos, Vendidos y Desactivados**, cada uno con su cantidad.' }
      ]
    },
    {
      id: 'estados',
      titulo: 'Estados de un producto: activo, vendido, desactivado y eliminado',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Un producto siempre está en uno de tres estados. Es importante distinguirlos, porque **no significan lo mismo** y afectan a las estadísticas.' },
        {
          t: 'tabla',
          cab: ['Estado', 'Qué significa', '¿Se ve en la web?', '¿Cuenta como venta?'],
          filas: [
            ['Activo', 'Disponible en el taller. Es el estado normal.', 'Sí, si está publicado', 'No'],
            ['Vendido', 'Se vendió. Queda registrado con el precio del momento.', 'No', 'Sí'],
            ['Desactivado', 'Se pausó o se guardó sin venderse (por ejemplo, se dejó de fabricar).', 'No', 'No']
          ]
        },
        { t: 'h', x: 'Marcar un producto como vendido' },
        {
          t: 'ol',
          x: [
            'En **Productos**, buscá el producto activo.',
            'Tocá **“Producto vendido”** y confirmá.',
            'El sistema registra la venta al **precio actual** del producto, lo saca de la web y lo cuenta en las estadísticas.'
          ]
        },
        { t: 'p', x: 'Si lo marcás dos veces por error, la venta **no se duplica**. Si te equivocaste, tocá **“Reactivar”**: se anula esa venta y el producto vuelve a estar disponible.' },
        { t: 'h', x: 'Desactivar y reactivar' },
        { t: 'p', x: '**“Desactivar”** oculta el producto de la web pero lo conserva en el panel. **No** cuenta como venta. Cuando quieras usarlo de nuevo, tocá **“Reactivar”**.' },
        { t: 'h', x: 'Eliminar' },
        { t: 'p', x: '**“Eliminar”** borra el producto de forma definitiva, junto con sus fotos y materiales. Pide confirmación y no se puede deshacer. Además:' },
        {
          t: 'ul',
          x: [
            'Su **ID de producto (chapita) queda libre** y puede usarse en un producto nuevo.',
            'Si el producto ya estaba **vendido**, la venta **se conserva** en el historial y en las estadísticas aunque lo elimines.',
            'Si el producto forma parte de algún **pedido**, no se puede eliminar (el sistema lo avisa). En ese caso usá **“Desactivar”**.'
          ]
        },
        { t: 'aviso', x: 'Desactivar no es lo mismo que vender: un producto desactivado nunca suma a las ventas ni a las ganancias reales. Si vendiste la pieza, usá siempre “Producto vendido”.' }
      ]
    },
    {
      id: 'categorias',
      titulo: 'Categorías',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Las categorías agrupan los productos (por ejemplo, “Sillas” o “Mesas”). Aparecen al cargar o editar un producto y como filtros del catálogo de la web pública.' },
        {
          t: 'ul',
          x: [
            'Para crear una, escribí el nombre en **“Nueva categoría”** (por ejemplo, “Sillas”) y tocá **“Crear categoría”**.',
            'El sistema no permite repetir una categoría, aunque cambien las mayúsculas o los acentos.',
            'En **“Categorías existentes”** ves cuántos productos tiene cada una.',
            'Para publicar un producto en la web tiene que tener categoría.'
          ]
        },
        { t: 'img', src: 'categorias.png', pie: 'Sección Categorías.' }
      ]
    },
    {
      id: 'pedidos',
      titulo: 'Pedidos',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Un pedido es un trabajo comprometido. Puede incluir uno o más productos. Para cada producto se estiman sus **horas-hombre** y se reparten en **etapas**, cada una con los **empleados** que la hacen (uno o varios). El avance del pedido se calcula solo a partir de esas etapas.' },
        { t: 'img', src: 'pedidos.png', pie: 'Listado de pedidos con sus etapas, horas-hombre, prioridad, entrega y cumplimiento.' },
        { t: 'h', x: 'Crear un pedido' },
        {
          t: 'ol',
          x: [
            'En **Pedidos** tocá **“+ Nuevo pedido”** (también está en el Panel de control), o tocá **“Crear pedido”** en la tarjeta de un producto.',
            'Elegí el producto y la **cantidad**. Con **“+ Agregar producto”** sumás más. Si el producto todavía no existe, usá **“+ Crear producto nuevo”**.',
            'Revisá las **horas-hombre estimadas para terminar una unidad**. Se completan solas con las del producto; podés cambiarlas para este pedido.',
            'Cargá las **etapas** (por ejemplo: Corte, Soldadura, Pintura): para cada una, el nombre, sus **horas por unidad** y los **empleados** que la hacen. Si una etapa la hacen varios juntos, cambiá **“1 empleado”** por la cantidad que necesita (por ejemplo, **“2 empleados”**) y aparece un selector para cada uno. Si el producto ya se pidió antes, se proponen las etapas y los empleados de la última vez.',
            'Debajo de las etapas, el sistema te dice si **la suma coincide** con las horas-hombre estimadas (✓) o cuántas horas faltan repartir o sobran. Con **“Usar X hs como estimación”** ajustás la estimación a lo que suman las etapas.',
            'Elegí la **prioridad** (Normal, Alta o Urgente), la **fecha de entrega** y, si querés, agregá **notas**.',
            'Tocá **“Crear pedido”**. Las etapas quedan asignadas: cada empleado ya las ve en su pantalla “Mis tareas”.'
          ]
        },
        { t: 'img', src: 'pedido-nuevo.png', pie: 'Formulario “Nuevo pedido”: horas-hombre estimadas repartidas en etapas, cada una con sus empleados (la soldadura la hacen dos).' },
        { t: 'nota', x: 'Las horas de una etapa son el **total entre todos** sus empleados: si dos personas sueldan juntas 3 horas cada una, la etapa lleva **6 horas-hombre**. Debajo de los empleados se ve cuánto le toca a cada uno (“≈ 3 hs cada uno”). Ese total es el que cuenta para la producción diaria y la recompensa del equipo.' },
        { t: 'aviso', x: 'El pedido no se guarda si a alguna etapa le falta alguno de los empleados que necesita, si un mismo empleado está dos veces en la misma etapa o si las etapas no suman exactamente las horas-hombre estimadas. Las horas se cargan **por unidad**: si pedís 4 sillas, cada etapa vale 4 veces lo que cargaste.' },
        { t: 'h', x: 'Revisar y cambiar un pedido' },
        { t: 'p', x: 'Tocá un pedido en el listado para ver su detalle: precio, costos y ganancia, y cada producto con sus etapas, horas-hombre, estado y empleados. Las etapas propuestas en la producción diaria muestran la marca **“Producción de hoy”** (o la fecha del día).' },
        {
          t: 'ul',
          x: [
            'Para **agregar una etapa** a un producto, completá la fila de abajo (nombre, horas por unidad y empleados) y tocá **“+ Agregar esta etapa”**. Sus horas se suman a la estimación del producto.',
            'Con la **×** quitás una etapa que todavía no se completó (sus horas se restan de la estimación).',
            'Con **“Pedido completo a la producción de hoy”** (o **“+ A la producción de hoy”** en un producto) proponés ese trabajo para hoy sin ir a Producción diaria.',
            'Para cambiar los empleados de una etapa (o cuántos necesita), usá la sección **Tareas**.'
          ]
        },
        { t: 'h', x: 'Estados de un pedido' },
        { t: 'p', x: 'Un pedido puede estar **pendiente, en producción, pausado, terminado o cancelado**. Cambia solo a medida que se completan etapas, y también podés modificarlo a mano. El pedido copia el precio, el costo y las horas-hombre al momento de crearlo: si después editás el producto, los pedidos existentes **no cambian**.' },
        { t: 'h', x: 'Ordenar y revisar' },
        { t: 'p', x: 'El listado se puede ordenar por prioridad, porcentaje completado, fecha de entrega o estado, y se cambia la dirección del orden con el botón correspondiente. Cada producto muestra sus etapas completadas, sus horas-hombre y su cumplimiento.' },
        { t: 'aviso', x: '“Eliminar pedido” borra el pedido definitivamente y saca sus etapas de la producción diaria. Si solo querés frenarlo, cambiá su estado a pausado o cancelado.' }
      ]
    },
    {
      id: 'tareas',
      titulo: 'Tareas: el trabajo de cada empleado',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'La sección **Tareas** muestra todas las etapas de los pedidos en un solo lugar, agrupadas por producto, con sus empleados y sus horas-hombre. Las etapas se asignan **al crear el pedido**; acá se **cambian los empleados** cuando hace falta (por ejemplo, si alguien falta) y se **reabre** una etapa que no quedó bien.' },
        { t: 'img', src: 'tareas.png', pie: 'Tareas de producción agrupadas por producto y pedido.' },
        {
          t: 'ol',
          x: [
            'Entrá a **Tareas**. Con el filtro de arriba elegís ver todas, las pendientes, las que les **falta asignar** o las completadas.',
            'Hacé clic en una etapa para ver su detalle: estado, empleados, horas-hombre, si está en la producción diaria y sus fechas.',
            'Para cambiar quién la hace, en **“Empleados asignados”** elegí cuántos empleados necesita y quiénes son, y tocá **“Guardar asignación”**. La etapa pasa a “Mis tareas” de cada uno.'
          ]
        },
        { t: 'img', src: 'tarea-asignar.png', pie: 'Detalle de una etapa: en “Empleados asignados” se elige cuántos necesita y quiénes son.' },
        {
          t: 'ul',
          x: [
            'Una etapa **ya completada no se puede reasignar**.',
            'Si una etapa completada no quedó bien, tocá **“Reabrir etapa”**: vuelve a pendiente y el empleado la ve de nuevo en “Mis tareas”. No se puede reabrir una etapa que ya se pagó en una producción diaria terminada (primero hay que reabrir ese día).',
            'Se puede guardar una etapa con **menos empleados** de los que necesita (por ejemplo, si alguien falta): queda marcada en rojo con **“falta 1”** y la Producción diaria lo avisa.',
            'Si se elimina la cuenta de un empleado, sus etapas pendientes quedan **sin asignar** (o con un empleado menos, si la hacían varios): el filtro **“Falta asignar”** te ayuda a encontrarlas y completarlas.'
          ]
        }
      ]
    },
    {
      id: 'produccion',
      titulo: 'Producción diaria',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Acá se decide **qué se propone terminar cada día**, se sigue cómo avanza y, al final, se **verifica y se cierra** el día. Con eso el sistema calcula la recompensa del equipo.' },
        { t: 'p', x: 'Arriba elegís el **Día** (por defecto, hoy; con **“Hoy”** volvés al día actual). También podés abrir cualquier día desde el **Historial de días**, al final de la pantalla. Las tarjetas muestran lo **propuesto** y lo **completado** (en horas-hombre), el **estado** del día y la **recompensa** que cobra el equipo si se completa todo.' },
        { t: 'img', src: 'produccion.png', pie: 'Producción del día en curso: lo propuesto, lo completado y cada etapa con sus empleados.' },
        { t: 'h', x: 'Proponer el trabajo del día' },
        { t: 'p', x: 'En **“Agregar trabajo”** aparecen los pedidos en curso con sus etapas pendientes. Podés agregar:' },
        {
          t: 'ul',
          x: [
            '**Un pedido completo**: botón **“+ Pedido completo”**.',
            '**Un producto** de un pedido que tiene varios productos: botón **“+ Producto”**.',
            '**Etapas sueltas**: marcá sus casillas y tocá **“Agregar a la producción”** en la barra de abajo, que muestra cuántas etapas y horas elegiste.'
          ]
        },
        { t: 'img', src: 'produccion-agregar.png', pie: 'Agregar trabajo al día: un pedido completo, un producto o etapas sueltas.' },
        { t: 'nota', x: 'Una etapa pendiente solo puede estar en **una** producción abierta: si ya la propusiste para otro día, aparece como “En la producción del…”. Las etapas completadas y las de pedidos pausados, cancelados o terminados no se pueden agregar. También podés proponer trabajo desde el detalle de un pedido.' },
        { t: 'h', x: 'Seguir el avance' },
        { t: 'p', x: 'En **“Propuesto para el día”** se ven las etapas agrupadas por pedido y producto, con su estado, sus horas, sus empleados y cuándo se completaron (📝 indica que se dejaron observaciones: pasá el mouse para leerlas). Con **“Quitar”** sacás una etapa del día (no se borra del pedido) y con **“Vaciar el día”** sacás todo.' },
        { t: 'h', x: 'Verificar y terminar el día' },
        {
          t: 'ol',
          x: [
            'Cuando los empleados terminan todas sus etapas, el estado del día pasa a **“Lista para verificar”**.',
            'Revisá el trabajo. Si una etapa no quedó bien, tocá **“Reabrir”**: vuelve a pendiente y el empleado la ve de nuevo en “Mis tareas”.',
            'Cuando todo está en orden, tocá **“Marcar producción diaria terminada”** y confirmá. El sistema guarda el resultado y la recompensa del equipo.'
          ]
        },
        { t: 'img', src: 'produccion-terminada.png', pie: 'Producción del día terminada y cumplida, con la recompensa del equipo.' },
        {
          t: 'ul',
          x: [
            'Si al terminar el día **falta alguna etapa**, el sistema te avisa: podés terminarlo igual, pero ese día **no hay recompensa**. Lo que quedó pendiente se puede proponer otro día.',
            'Una producción terminada ya no cambia aunque después se editen los pedidos. Si necesitás corregirla, tocá **“Reabrir producción”**, junto al título “Propuesto para el…”: la recompensa vuelve a $0 hasta que la termines de nuevo.',
            'Podés armar la producción de otro día (por ejemplo, la de mañana) eligiendo esa fecha arriba.'
          ]
        },
        { t: 'aviso', x: 'Las horas-hombre que cuentan son las **estimadas** al crear el pedido, no el tiempo que se tardó. Verificá bien el trabajo antes de terminar el día: es lo que habilita la recompensa.' },
        { t: 'h', x: 'Historial de días: ver o reabrir un día anterior' },
        { t: 'p', x: 'Al final de la pantalla está el **Historial de días**: cada día con producción propuesta, con lo propuesto, lo completado, el resultado (cumplido, en curso o cuántas horas faltaron), el valor de la hora y la recompensa. El día que estás viendo queda marcado.' },
        {
          t: 'ol',
          x: [
            'Tocá el día que querés ver. La pantalla sube y muestra **ese día**: sus tarjetas y todas sus etapas, con quién las hizo y cuándo se completaron.',
            'Si ese día ya está terminado y necesitás cambiarlo (por ejemplo, se cerró por error o falta corregir una etapa), tocá **“Reabrir producción”**, junto al título “Propuesto para el…”.',
            'Hacé los cambios y volvé a tocar **“Marcar producción diaria terminada”**.'
          ]
        },
        { t: 'img', src: 'produccion-historial.png', pie: 'Historial de días: el día marcado es el que se está viendo arriba.' },
        { t: 'nota', x: 'Para **ver** un día no hace falta reabrirlo: alcanza con tocarlo en el historial. Los días cargados con el sistema anterior (objetivos por producto) se ven igual, con su detalle por producto, pero no se pueden reabrir.' }
      ]
    },
    {
      id: 'mis-tareas',
      titulo: 'Mis tareas (para empleados)',
      para: ['empleado'],
      bloques: [
        { t: 'p', x: 'Al ingresar como empleado ves **“Mis tareas”**: las etapas de pedidos que te asignaron. Arriba, en **“Producción de hoy”**, están las que el taller se propuso terminar hoy y te tocan a vos; abajo, tus otras etapas. Si todavía no hay ninguna, verás el mensaje “No tenés tareas asignadas”.' },
        { t: 'p', x: 'Las tarjetas de arriba muestran cuántas etapas tenés para hoy, cuántas pendientes en total, cuántas completaste y cómo viene **el equipo hoy** (qué parte de la producción del día ya se completó).' },
        { t: 'img', src: 'mis-tareas.png', pie: 'Pantalla “Mis tareas” de un empleado.' },
        {
          t: 'ol',
          x: [
            'Cuando empieces una etapa, tocá **“Empezar”** (es opcional: sirve para que el administrador sepa que ya la estás haciendo).',
            'Al terminarla, tocá **“Marcar terminada”**.',
            'Si querés, escribí observaciones (materiales usados, inconvenientes, detalles del trabajo). **No hace falta decir cuánto tardaste.**',
            'Tocá **“Sí, la terminé”**. La etapa queda como completada, en el mismo lugar de la lista.'
          ]
        },
        { t: 'img', src: 'mis-tareas-terminar.png', pie: 'Al terminar una etapa solo se confirma; las observaciones son opcionales.' },
        { t: 'nota', x: 'Cada etapa muestra sus **horas-hombre estimadas**: es lo que vale esa etapa para el equipo. Si el equipo completa todo lo propuesto para el día, el administrador lo verifica y **el equipo cobra la recompensa del día**.' },
        { t: 'nota', x: 'Si una etapa la hacen **varios empleados juntos**, la tarjeta dice **“Junto con …”** y les aparece a todos. Cualquiera de ellos la marca como terminada y queda **completada para todos**. Sus horas-hombre son el total entre todos.' },
        { t: 'p', x: 'Si marcaste una etapa por error, o el administrador ve que algo no quedó bien, la puede **reabrir**: vuelve a aparecer como pendiente en tu lista.' }
      ]
    },
    {
      id: 'recompensas',
      titulo: 'Recompensa del equipo',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Todo el taller trabaja como **un único equipo**. La recompensa es **un solo monto por día**, nunca por empleado, y se paga cuando se **completa la producción propuesta** para el día y el administrador la da por terminada.' },
        { t: 'h', x: 'Cómo se calcula' },
        {
          t: 'tabla',
          cab: ['Dato', 'De dónde sale'],
          filas: [
            ['Propuesto', 'La suma de las horas-hombre estimadas de las etapas propuestas para el día en Producción diaria.'],
            ['Completado', 'Las horas-hombre de las etapas propuestas que ya se completaron.'],
            ['Resultado', 'Cumplido si al terminar el día se completaron **todas** las etapas propuestas.'],
            ['Recompensa', 'Propuesto × valor de la hora-hombre × % de premio, si el día se cumplió. Si no, es $0.']
          ]
        },
        { t: 'p', x: '**Ejemplo.** Hoy se propone una mesa de comedor completa (11 horas-hombre) y el corte de 4 sillas (4 horas-hombre): el día vale 15 horas. Si se completan todas esas etapas y el administrador termina el día, con un valor de $2.500 la hora-hombre y 100 % de premio la recompensa es **$37.500**. Si falta una sola etapa, la recompensa del día es $0.' },
        {
          t: 'ul',
          x: [
            'Se paga solo lo **propuesto**: terminar etapas que no estaban en la producción del día no suma a la recompensa de ese día.',
            'Mientras el día está abierto, la pantalla muestra la recompensa **“al completar”**; recién cuando el administrador termina el día queda como pagada y cuenta como gasto en Estadísticas.',
            'Sin trabajo propuesto no hay recompensa.'
          ]
        },
        { t: 'h', x: 'Lo que cobró el equipo' },
        { t: 'p', x: 'Arriba de **Recompensas** hay tres tarjetas: la recompensa de **hoy** (la que está en juego mientras el día está abierto, o la que se pagó si ya se terminó), lo **pagado este mes** y lo **pagado en total**, con cuántos días se cumplieron.' },
        { t: 'img', src: 'recompensas.png', pie: 'Recompensas: lo que cobró el equipo y cómo se calcula.' },
        { t: 'nota', x: 'El detalle de cada día (qué se propuso, qué se completó y su resultado) está en el **Historial de días** de **Producción diaria**: el botón **“Ver los días en Producción diaria”** te lleva ahí. El trabajo del día también se arma y se termina en esa pantalla.' },
        { t: 'h', x: 'Valor de la hora-hombre y % de premio' },
        { t: 'p', x: 'En **“Cómo se calcula la recompensa”** se define cuánto vale cada hora-hombre y qué porcentaje se paga (de 0 a 100; 100 paga todo el valor). Al tocar **“Guardar parámetros”** los valores nuevos **rigen desde hoy**: los días ya terminados conservan los que tenían. Cada cambio queda anotado en un historial.' },
        { t: 'nota', x: 'Un día terminado guarda una copia de su resultado: si después se cambia el valor de la hora-hombre o se edita un pedido, ese día no se modifica.' },
        { t: 'p', x: 'Si el taller venía usando los bonos individuales del sistema anterior, al final de la pantalla aparece **“Historial anterior: bonos individuales”**. Es solo de consulta: esos bonos ya no se generan, pero siguen contando como gasto en Estadísticas.' }
      ]
    },
    {
      id: 'estadisticas',
      titulo: 'Estadísticas',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Reúne los números del taller para decidir con datos. Se puede filtrar por período.' },
        { t: 'img', src: 'estadisticas.png', pie: 'Estadísticas: resultados reales, proyección y facturación por mes.' },
        {
          t: 'ul',
          x: [
            '**Real: ganancias y gastos**: lo que efectivamente se vendió (productos marcados como vendidos) y lo que costó producir.',
            '**Proyectado: si se vende todo el stock**: cuánto se ganaría si se vendieran todos los productos activos. Es una estimación, no dinero ya cobrado.',
            '**Facturación por mes**, **rentabilidad por producto** y **margen**.',
            '**Recompensas pagadas**: la recompensa del equipo de cada producción diaria terminada (más los bonos individuales del sistema anterior, si los hubo). Se cuenta como gasto.',
            '**Producción diaria**: días con producción, cuántos de los terminados se cumplieron, horas-hombre propuestas y completadas y el **promedio por día**.',
            '**Horas-hombre por día**: un gráfico con una columna por día (los últimos 14 del período). La parte clara es lo completado y la oscura lo propuesto; ✓ marca los días cumplidos. Pasando el mouse por una columna se ve su detalle, y con **“Ver los datos como tabla”** se ven los mismos números en una tabla.',
            '**Trabajo pendiente**: las horas-hombre que faltan completar en los pedidos abiertos y cuántos días de producción llevarían al ritmo del período.',
            '**Rendimiento de empleados**: horas-hombre que completó cada uno en el período, cuántas fueron parte de días cumplidos (los que pagaron recompensa al equipo) y lo que tiene pendiente. Una etapa que hicieron varios cuenta para cada uno, con sus horas repartidas en partes iguales.'
          ]
        },
        { t: 'img', src: 'estadisticas-produccion.png', pie: 'Producción diaria en Estadísticas: días cumplidos, horas-hombre por día y trabajo pendiente.' },
        { t: 'p', x: 'Los gastos de producción se cuentan al completar cada etapa: el costo de cada producto del pedido se reparte entre sus etapas **según sus horas-hombre** (una etapa de 6 horas pesa el triple que una de 2).' },
        { t: 'p', x: 'Para el conteo de productos, el sistema distingue tres grupos: **activos**, **vendidos** y **desactivados**. Los desactivados no suman a las ventas ni a las ganancias, y los vendidos se mantienen en el historial aunque el producto se elimine.' },
        { t: 'nota', x: 'Si el período elegido no tiene ventas, verás “Sin ventas registradas en el período”. Con el botón **Limpiar** volvés a ver todo.' }
      ]
    },
    {
      id: 'usuarios',
      titulo: 'Usuarios',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Acá se administran las cuentas de las personas del taller. Cada persona ingresa con su propio correo y contraseña. **Nunca compartan una misma cuenta**: cada uno debe tener la suya.' },
        { t: 'img', src: 'usuarios.png', pie: 'Sección Usuarios.' },
        { t: 'h', x: 'Dar de alta un empleado' },
        {
          t: 'ol',
          x: [
            'Entrá a **Usuarios** y tocá **“+ Nuevo empleado”**.',
            'Completá nombre completo, **correo electrónico** y una contraseña de al menos 8 caracteres.',
            'Guardá. La cuenta queda activa enseguida. Pasale la contraseña a la persona para su primer ingreso.'
          ]
        },
        { t: 'img', src: 'usuario-nuevo.png', pie: 'Formulario “Nuevo empleado”.' },
        { t: 'aviso', x: 'Cargá un correo que la persona **pueda abrir**: ahí le llega el código de verificación en cada ingreso.' },
        { t: 'h', x: 'Restablecer una contraseña' },
        { t: 'p', x: 'Si alguien olvidó su contraseña, tocá **“Restablecer contraseña”** en su fila, escribí una nueva (mínimo 8 caracteres) y avisale. Elegí contraseñas difíciles de adivinar: no sirven las repetidas ni las demasiado simples.' },
        { t: 'h', x: 'Qué puede hacer un administrador acá' },
        {
          t: 'ul',
          x: [
            'Crear cuentas de empleados.',
            'Restablecer la contraseña de un empleado.',
            'Eliminar la cuenta de un empleado, si no tiene registros asociados.'
          ]
        },
        { t: 'p', x: 'Las cuentas de administrador no se crean ni se modifican desde esta pantalla.' },
        { t: 'p', x: 'Un empleado con historial (tareas, recompensas o registros de producción) no se puede eliminar: el sistema lo avisa para no perder información. Nadie puede desactivarse a sí mismo ni cambiar su propio rol.' }
      ]
    },
    {
      id: 'configuracion',
      titulo: 'Configuración',
      para: ['super_admin'],
      bloques: [
        { t: 'p', x: 'Es la sección de ajustes generales. Los cambios impactan en la web pública y en los cálculos del sistema.' },
        { t: 'h', x: 'Datos de la web pública' },
        { t: 'p', x: 'Lo que cargues acá aparece en el catálogo público: portada, pie de página, botón de WhatsApp y página de Contacto.' },
        { t: 'p', x: '**Ningún campo de Configuración es obligatorio**: podés dejar cualquiera en blanco y guardar. Lo que queda vacío simplemente no se muestra en la web (por ejemplo, sin WhatsApp no aparece el botón) y los valores numéricos vacíos cuentan como cero. Si dejás en blanco el mail receptor, las consultas llegan al correo de contacto general.' },
        {
          t: 'ul',
          x: [
            '**Nombre y frases** de la marca (el nombre debe ser exactamente **Un atelier**).',
            '**Teléfono de WhatsApp** (con código de país, por ejemplo 5491122334455), horarios, redes sociales y textos de presentación.',
            '**Imagen de “Sobre nosotros”**: pegala con Ctrl+V o subí un archivo. Con “Quitar imagen” se elimina.',
            '**Mail receptor de consultas**: la casilla donde llegan los mensajes del formulario de contacto de la web. Revisala seguido y verificá que esté bien escrita.'
          ]
        },
        { t: 'h', x: 'Video de fondo de la portada' },
        { t: 'p', x: 'Subí un video corto para el fondo de la página de inicio. En la web se reproduce **solo, sin sonido, en bucle y sin controles**. Con “Quitar video” se elimina. Conviene un video liviano (pocos MB) para que la página cargue rápido, sobre todo en celulares.' },
        { t: 'h', x: 'Costos' },
        { t: 'p', x: '**Costo por hora de mano de obra**: se multiplica por las horas-hombre de cada producto (y de cada pedido) para calcular el costo de mano de obra. El valor de la hora-hombre de la recompensa y el % de premio se cambian en Recompensas.' },
        { t: 'aviso', x: 'Cambiar estos valores modifica los cálculos futuros. Antes de tocarlos, anotá los valores actuales.' }
      ]
    },
    {
      id: 'web-publica',
      titulo: 'La web pública y el formulario de contacto',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'La web pública es la vidriera de **Un atelier**. Los visitantes ven la portada, el catálogo de productos publicados, el detalle de cada pieza (con su historia y su chapita) y la página de Contacto.' },
        { t: 'img', src: 'web-catalogo.png', pie: 'Catálogo de la web pública.' },
        {
          t: 'ul',
          x: [
            'Solo se muestran los productos **activos** marcados como **“Publicar en la web”**. Al marcar uno como vendido o desactivarlo, deja de verse.',
            'Los productos destacados aparecen en la portada.',
            'El botón de WhatsApp usa el número de WhatsApp del taller.'
          ]
        },
        { t: 'img', src: 'web-producto.png', pie: 'Detalle de un producto en la web pública.' },
        { t: 'h', x: 'Formulario de contacto' },
        { t: 'p', x: 'Los mensajes que envían los visitantes llegan al **mail receptor de consultas**. Para evitar el spam, el formulario tiene protecciones invisibles para las personas:' },
        { t: 'img', src: 'web-contacto.png', pie: 'Página de Contacto de la web pública.' },
        {
          t: 'ul',
          x: [
            'Rechaza envíos hechos por robots o demasiado rápidos.',
            'Limita cuántos mensajes se pueden mandar seguidos: si alguien insiste, se le pide esperar unos minutos.',
            'No acepta el mismo mensaje repetido ni mensajes con demasiados enlaces.'
          ]
        },
        { t: 'nota', x: 'Si una persona te dice que no pudo enviar su consulta, pedile que espere unos minutos y pruebe de nuevo, o que te escriba por WhatsApp. Los mensajes de consulta a veces caen en spam: revisá esa carpeta.' }
      ]
    },
    {
      id: 'seguridad',
      titulo: 'Seguridad y buenas prácticas',
      para: TODOS,
      bloques: [
        {
          t: 'ul',
          x: [
            'Usá una **contraseña propia y larga**, que no uses en otros sitios.',
            'No compartas tu cuenta ni tu código de verificación.',
            'Cerrá la sesión al terminar, especialmente en computadoras compartidas.',
            'Si sospechás que alguien conoce tu contraseña, pedí que te la restablezcan de inmediato.',
            'Ingresá siempre desde la dirección oficial del sistema, y no desde enlaces que lleguen por mensajes sospechosos.',
            'Los administradores deben dar de baja o restablecer las cuentas de quienes dejan el taller.'
          ]
        },
        { t: 'p', x: 'El sistema protege por su cuenta el ingreso (verificación en dos pasos y bloqueos por intentos), los permisos de cada rol y el formulario de contacto. Aun así, el cuidado de las contraseñas depende de cada persona.' }
      ]
    },
    {
      id: 'problemas',
      titulo: 'Problemas frecuentes al ingresar',
      para: TODOS,
      bloques: [
        {
          t: 'tabla',
          cab: ['Qué pasa', 'Qué hacer'],
          filas: [
            ['No me llega el código de verificación', 'Revisá spam o correo no deseado, esperá un minuto y tocá “Reenviar código”. Si sigue sin llegar, pedí a un administrador que confirme el correo cargado en tu cuenta.'],
            ['El código dice que venció o es incorrecto', 'Dura 10 minutos y se usa una sola vez. Volvé atrás e ingresá de nuevo para recibir uno nuevo.'],
            ['Me pide esperar unos minutos', 'Hubo demasiados intentos seguidos. Es una protección: esperá y probá de nuevo.'],
            ['Me sacó del sistema', 'La sesión dura unas 8 horas. Volvé a ingresar.']
          ]
        }
      ]
    },
    {
      id: 'problemas-gestion',
      titulo: 'Problemas frecuentes en la gestión',
      para: GESTION,
      bloques: [
        {
          t: 'tabla',
          cab: ['Qué pasa', 'Qué hacer'],
          filas: [
            ['No puedo eliminar un producto', 'Está dentro de un pedido. Desactivalo en lugar de eliminarlo.'],
            ['Marqué como vendido por error', 'Tocá “Reactivar”: la venta se anula y el producto vuelve a estar disponible.'],
            ['No puedo publicar un producto en la web', 'Faltan datos obligatorios: nombre, ID, descripción técnica, historia o categoría. El aviso te dice cuál.'],
            ['No puedo crear un pedido: dice que las etapas tienen que coincidir', 'La suma de las horas de las etapas tiene que ser igual a las horas-hombre estimadas por unidad. Ajustá las horas de alguna etapa o tocá “Usar X hs como estimación”.'],
            ['¿Cómo asigno una etapa a varios empleados?', 'Al crear el pedido, en la columna **Empleados** de la etapa elegí cuántos necesita (por ejemplo, “2 empleados”) y quiénes son. En un pedido ya creado, hacelo desde **Tareas**.'],
            ['Un empleado no ve una etapa en “Mis tareas”', 'Revisá en Tareas a quién está asignada. Si se eliminó la cuenta de un empleado, sus etapas quedan sin asignar.'],
            ['No puedo agregar una etapa a la producción del día', 'Ya está completada, ya está propuesta en otra producción abierta o el pedido está pausado, cancelado o terminado. El mensaje te dice cuál.'],
            ['¿Cómo veo o reabro un día anterior?', 'En **Producción diaria**, tocá el día en el **Historial de días** (al final de la pantalla) o elegí su fecha arriba. Si ya está terminado, el botón **“Reabrir producción”** está junto al título “Propuesto para el…”.'],
            ['La recompensa del día da $0', 'Solo se paga cuando el administrador termina la producción del día con **todas** las etapas propuestas completadas. Revisá en Producción diaria qué etapa falta; si el día ya se cerró, abrilo desde el historial y reabrilo.'],
            ['Una etapa se marcó como terminada por error', 'El administrador la reabre desde Producción diaria o desde Tareas.'],
            ['No puedo eliminar a un empleado', 'Tiene tareas, recompensas o registros asociados. Se conserva su historial.'],
            ['Un número de las estadísticas no coincide', 'Recordá que los productos desactivados no cuentan como venta. Recargá la página y revisá el período elegido.']
          ]
        }
      ]
    },
    {
      id: 'glosario',
      titulo: 'Glosario',
      para: TODOS,
      bloques: [
        {
          t: 'tabla',
          cab: ['Término', 'Significado'],
          filas: [
            ['Chapita / ID de producto', 'Número visible que identifica cada pieza. Se libera si el producto se elimina.'],
            ['Etapa / tarea', 'Cada paso de la fabricación de un producto dentro de un pedido (corte, soldadura, pintura…). Tiene sus horas-hombre (el total entre todos los que la hacen) y uno o más empleados.'],
            ['Horas-hombre', 'Horas de trabajo de una persona. Cada producto tiene una estimación por unidad; en cada pedido se reparten entre sus etapas y son lo que vale cada etapa para la recompensa.'],
            ['Producción diaria', 'Lista de etapas que el taller se propone terminar en un día. El administrador la verifica y la marca como terminada.'],
            ['Recompensa del equipo', 'Premio en dinero, uno por día para todo el taller: las horas-hombre de la producción del día × el valor de la hora, cuando se completa todo lo propuesto.'],
            ['Borrador', 'Producto guardado pero no publicado en la web.'],
            ['Destacado', 'Producto que se muestra en la portada de la web.'],
            ['Real / proyectado', 'Real es lo ya vendido; proyectado es lo que se ganaría si se vendiera todo el stock.']
          ]
        }
      ]
    }
  ]
}

// Capítulos visibles para un rol (los empleados solo ven los suyos).
export const capitulosPara = rol =>
  manual.capitulos.filter(capitulo => capitulo.para.includes(rol))
