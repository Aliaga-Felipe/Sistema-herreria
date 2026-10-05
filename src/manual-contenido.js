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

export const MANUAL_VERSION = 'Septiembre 2026'

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
            ['Administrador', 'Gestiona productos, categorías, pedidos, tareas, producción diaria, la recompensa del equipo y estadísticas. Da de alta empleados y restablece sus contraseñas.'],
            ['Empleado', 'Ve solo sus etapas de trabajo asignadas, las empieza y las marca como terminadas informando el tiempo que le llevó.']
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
            ['Tareas', 'Etapas de producción y asignación de empleados.'],
            ['Pedidos', 'Trabajos comprometidos con sus productos, fechas y avance.'],
            ['Producción diaria', 'Objetivos diarios por producto y registro de lo producido cada día.'],
            ['Estadísticas', 'Ventas, gastos, ganancias y rendimiento del equipo.'],
            ['Recompensas', 'Premio diario del equipo cuando se completa la producción propuesta.'],
            ['Usuarios', 'Cuentas de las personas del taller.'],
            ['Manual de usuario', 'Esta guía, con búsqueda y descarga en PDF.']
          ]
        },
        { t: 'h', x: 'El Panel de control' },
        { t: 'p', x: 'Es la pantalla inicial. Muestra cifras clave (pedidos abiertos, pedidos atrasados, etapas pendientes, ingresos en curso y semáforo del taller), los pedidos en curso ordenados por prioridad y fecha de entrega, los últimos productos vendidos y los empleados con tareas pendientes. Desde ahí también hay accesos directos para crear un pedido, un producto o un empleado, asignar tareas y entrar a Estadísticas o Recompensas.' },
        { t: 'nota', x: 'Los números se actualizan solos cada tanto y cuando volvés a la pestaña del navegador. Si algo no coincide con lo que esperás, recargá la página.' }
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
            'Elegí la **categoría** y, si querés, cargá horas-hombre, medidas y precio de venta. Si dejás el precio vacío, la web muestra “Consultar precio”.',
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
        { t: 'nota', x: 'Las **horas-hombre** de un producto se usan también para la recompensa: con ese número se pasan a horas tanto los objetivos diarios como lo producido (ver “Recompensa del equipo”). Un producto sin horas-hombre cargadas no suma.' },
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
        { t: 'p', x: 'Un pedido es un trabajo comprometido. Puede incluir uno o más productos y cada producto tiene sus propias tareas de producción. El avance del pedido se calcula solo a partir de esas tareas.' },
        { t: 'img', src: 'pedidos.png', pie: 'Listado de pedidos con prioridad, fecha de entrega y cumplimiento.' },
        { t: 'h', x: 'Crear un pedido' },
        {
          t: 'ol',
          x: [
            'En **Pedidos** tocá **“+ Nuevo pedido”** (también está en el Panel de control).',
            'En **“Productos del pedido”** elegí el producto y la **cantidad**. Con **“+ Agregar producto”** sumás más. Si el producto todavía no existe, usá **“+ Crear producto nuevo”**.',
            'Para cada producto definí sus **tareas** o etapas (por ejemplo: Corte, Soldadura, Pintura) con los **minutos por unidad** de cada una.',
            'Elegí la **prioridad** (Normal, Alta o Urgente) y la **fecha de entrega**.',
            'Podés agregar **notas** (detalles de fabricación, condiciones de pago, etc.).',
            'Guardá. El sistema arma el presupuesto (materiales, mano de obra, precio y ganancia) con los datos del producto.'
          ]
        },
        { t: 'img', src: 'pedido-nuevo.png', pie: 'Formulario “Nuevo pedido”.' },
        { t: 'nota', x: 'Los empleados no se asignan al crear el pedido: se asignan después desde **Tareas**.' },
        { t: 'h', x: 'Estados de un pedido' },
        { t: 'p', x: 'Un pedido puede estar **pendiente, en producción, pausado, terminado o cancelado**. Cambia solo a medida que se completan etapas, y también podés modificarlo a mano. El pedido copia el precio y el costo del producto al momento de crearlo: si después editás el producto, los pedidos existentes **no cambian**.' },
        { t: 'h', x: 'Ordenar y revisar' },
        { t: 'p', x: 'El listado se puede ordenar por prioridad y por fecha de entrega, y se cambia la dirección del orden con el botón correspondiente. Cada pedido muestra su porcentaje de avance, las etapas completadas y su cumplimiento.' },
        { t: 'aviso', x: '“Eliminar pedido” borra el pedido definitivamente. Si solo querés frenarlo, cambiá su estado a pausado o cancelado.' }
      ]
    },
    {
      id: 'tareas',
      titulo: 'Tareas: asignar el trabajo al equipo',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'La sección **Tareas** muestra todas las etapas del taller en un solo lugar. Desde acá se decide **quién hace cada etapa**.' },
        { t: 'img', src: 'tareas.png', pie: 'Tareas de producción agrupadas por producto y pedido.' },
        {
          t: 'ol',
          x: [
            'Entrá a **Tareas** y hacé clic en la etapa que querés asignar.',
            'Elegí el **empleado responsable**. Se ve el tiempo estimado y, cuando corresponde, el resultado del semáforo.',
            'Guardá. La etapa aparece en “Mis tareas” del empleado.'
          ]
        },
        { t: 'img', src: 'tarea-asignar.png', pie: 'Detalle de una etapa: en “Responsable de esta etapa” se elige al empleado.' },
        {
          t: 'ul',
          x: [
            'Una etapa **ya completada no se puede reasignar**.',
            'En una tarea libre, el responsable se aplica a todas sus etapas.',
            'Cada etapa muestra su estado: pendiente, en proceso o completada, con tiempo estimado y tiempo real.'
          ]
        }
      ]
    },
    {
      id: 'produccion',
      titulo: 'Producción diaria y objetivos',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Sirve para seguir el avance de lo que se está fabricando, definir la **producción propuesta por día** y cargar lo que se produjo. Con esos datos el sistema calcula la recompensa del equipo.' },
        { t: 'p', x: 'Arriba, las tarjetas muestran el **objetivo del equipo** (la producción propuesta, en horas-hombre) y la **recompensa al cumplir** (cuánto cobra el equipo si lo completa).' },
        { t: 'h', x: 'Seguimiento' },
        { t: 'p', x: '**Productos en producción** muestra el avance de cada producto de los pedidos abiertos, etapa por etapa, con su responsable y el resultado del semáforo.' },
        { t: 'img', src: 'produccion.png', pie: 'Producción diaria: objetivo del equipo, recompensa al cumplir y avance de cada producto.' },
        { t: 'h', x: 'Definir los objetivos' },
        {
          t: 'ol',
          x: [
            'Tocá **“+ Nuevo objetivo”**.',
            'Elegí el tipo: **“Producción diaria de un producto”** (cuántas unidades por día se esperan) o **“Terminar un pedido específico”**.',
            'Indicá el producto y la **cantidad objetivo por día**, o el pedido. El formulario muestra a cuántas horas equivale cada unidad y cuánto suma ese objetivo al del equipo.',
            'Dejá marcado **“Objetivo activo”** y guardá.'
          ]
        },
        { t: 'img', src: 'objetivo-nuevo.png', pie: 'Formulario “Nuevo objetivo”.' },
        { t: 'p', x: 'Los objetivos **activos por producto** forman el **objetivo del equipo**: cada uno aporta su cantidad multiplicada por las horas-hombre del producto. Por ejemplo, 4 sillas de 4 horas-hombre y 2 mesitas de 6 horas-hombre dan un objetivo de 28 horas.' },
        {
          t: 'ul',
          x: [
            'Un objetivo de tipo **“Terminar un pedido”** sirve para el seguimiento, pero **no suma** al objetivo del equipo ni a la recompensa.',
            'Un producto **sin horas-hombre** tampoco suma: la tarjeta del objetivo lo avisa. Cargalas en Productos.',
            'Con **“Editar”** cambiás la cantidad o lo pausás; con **“Eliminar”** lo quitás.'
          ]
        },
        { t: 'h', x: 'Cargar la producción del día' },
        {
          t: 'ol',
          x: [
            'En **“Producción del día”** elegí la **fecha** (por defecto, hoy). Podés elegir un día anterior si te olvidaste de cargarlo.',
            'Escribí cuántas unidades se hicieron de cada producto y tocá **“Registrar”** en cada fila.',
            'Si se fabricó un producto que no tiene objetivo propio, elegilo en **“Otro producto”**: se agrega a la lista y también suma horas producidas.'
          ]
        },
        { t: 'img', src: 'produccion-planilla.png', pie: 'Objetivos activos y carga de la producción del día, con el resumen de la recompensa al pie.' },
        { t: 'p', x: 'Al pie aparece el **resumen del día**: objetivo, producido y si se cumplió (con la recompensa) o cuántas horas faltan. Se actualiza cada vez que registrás producción o cambiás un objetivo.' },
        { t: 'aviso', x: 'Si volvés a registrar un producto en la misma fecha, la cantidad nueva **reemplaza** a la anterior (no se suma).' },
        { t: 'h', x: 'Historial de producción' },
        { t: 'p', x: 'Lista lo producido por día y por producto. Si el producto tiene objetivo propio, indica si se cumplió; si no, dice “Sin objetivo propio”. Se puede filtrar por fechas.' }
      ]
    },
    {
      id: 'mis-tareas',
      titulo: 'Mis tareas (para empleados)',
      para: ['empleado'],
      bloques: [
        { t: 'p', x: 'Al ingresar como empleado ves **“Mis etapas”**: las etapas de pedidos que el administrador te asignó. Si todavía no hay ninguna, verás el mensaje “No tenés tareas asignadas”.' },
        { t: 'img', src: 'mis-tareas.png', pie: 'Pantalla “Mis tareas” de un empleado.' },
        {
          t: 'ol',
          x: [
            'Elegí una etapa y tocá **“Empezar”** cuando comiences a trabajarla.',
            'Al terminar, tocá **“Marcar terminada”**.',
            'Escribí cuántos **minutos** te llevó realmente y, si querés, agregá observaciones (materiales usados, inconvenientes, detalles del trabajo).',
            'Confirmá. Se muestra el **resultado** del semáforo.'
          ]
        },
        { t: 'img', src: 'mis-tareas-terminar.png', pie: 'Al marcar una etapa como terminada se informa el tiempo real.' },
        { t: 'nota', x: 'El tiempo real lo informás vos al terminar la etapa. Cargalo con honestidad: de eso depende el semáforo. Las etapas cerradas quedan en la lista, en su mismo lugar, con el estado “Completada”.' },
        { t: 'p', x: 'El semáforo es un indicador de tiempos y no genera plata. La **recompensa es para todo el equipo**: se paga cuando se completa la producción propuesta para el día.' }
      ]
    },
    {
      id: 'semaforo',
      titulo: 'Semáforo de rendimiento',
      para: TODOS,
      bloques: [
        { t: 'p', x: 'Cada vez que se cierra una etapa, el sistema compara el **tiempo real** que informó el empleado con el **tiempo estimado** por el administrador:' },
        {
          t: 'tabla',
          cab: ['Color', 'Significado'],
          filas: [
            ['🟢 Verde', 'Terminó más rápido de lo esperado.'],
            ['🟡 Amarillo', 'Terminó dentro del tiempo esperado.'],
            ['🔴 Rojo', 'Tardó más de lo esperado.']
          ]
        },
        { t: 'p', x: 'El semáforo es **solo un indicador de tiempos**: sirve para ver cómo viene el trabajo y ajustar las estimaciones. **No genera plata** para nadie en particular.' },
        { t: 'nota', x: 'La recompensa es **una sola por día y para todo el equipo**: se paga cuando el taller completa la producción propuesta para el día.' }
      ]
    },
    {
      id: 'recompensas',
      titulo: 'Recompensa del equipo',
      para: GESTION,
      bloques: [
        { t: 'p', x: 'Todo el taller trabaja como **un único equipo**. La recompensa es **un solo monto por día**, nunca por empleado, y se paga por **completar la producción propuesta** para la jornada.' },
        { t: 'h', x: 'Cómo se calcula' },
        {
          t: 'tabla',
          cab: ['Dato', 'De dónde sale'],
          filas: [
            ['Objetivo', 'La suma de los objetivos diarios activos por producto, pasados a horas: cantidad × horas-hombre de cada producto. Se definen en Producción diaria.'],
            ['Producido', 'Las unidades registradas ese día de cada producto multiplicadas por sus horas-hombre. Cuenta cualquier producto, tenga o no objetivo propio.'],
            ['Resultado', 'Cumplido si lo producido alcanza o supera el objetivo.'],
            ['Recompensa', 'Objetivo × valor de la hora-hombre × % de premio, si el día se cumplió. Si no, es $0.']
          ]
        },
        { t: 'p', x: '**Ejemplo.** Los objetivos diarios son 4 sillas de 4 horas-hombre (16 hs) y 2 mesitas de 6 horas-hombre (12 hs): el objetivo del equipo es de 28 horas. Si ese día se producen 28 horas o más, con un valor de $2.500 la hora-hombre y 100 % de premio la recompensa es **$70.000**. Si se producen 26, faltaron 2 horas y la recompensa es $0.' },
        {
          t: 'ul',
          x: [
            '**Producir de más no aumenta la recompensa**: se paga siempre el objetivo completo.',
            'La comparación es por el **total de horas**, no producto por producto: hacer más de un producto compensa haber hecho menos de otro.',
            'Sin objetivos diarios activos el objetivo es 0 y **no se paga** recompensa.'
          ]
        },
        { t: 'aviso', x: 'Un producto sin horas-hombre cargadas suma 0 horas, tanto en el objetivo como en lo producido (la pantalla lo avisa). Completá ese dato en Productos.' },
        { t: 'h', x: 'Ver el resultado de un día' },
        { t: 'p', x: 'Entrá a **Recompensas** y elegí el **Día** arriba a la derecha (por defecto, hoy). Las tarjetas muestran el objetivo, lo producido, el resultado y la recompensa, con la cuenta que la explica. Debajo hay dos tablas: el **objetivo** del día (cada producto con su cantidad, sus horas y cuánto vale) y la **producción** del día pasada a horas.' },
        { t: 'img', src: 'recompensas.png', pie: 'Recompensas: resultado del día, detalle del objetivo y de la producción.' },
        { t: 'nota', x: 'El objetivo no se carga en esta pantalla: sale de los objetivos diarios por producto de **Producción diaria**.' },
        { t: 'h', x: 'Valor de la hora-hombre y % de premio' },
        { t: 'p', x: 'En **“Cómo se calcula la recompensa”** se define cuánto vale cada hora-hombre del objetivo y qué porcentaje se paga (de 0 a 100; 100 paga todo el valor). Al tocar **“Guardar parámetros”** los valores nuevos **rigen desde hoy**: los días anteriores conservan los que tenían. Cada cambio queda anotado en un historial.' },
        { t: 'h', x: 'Historial de días' },
        { t: 'p', x: 'Lista cada día con producción cargada: objetivo, producido, si se cumplió o cuántas horas faltaron, y la recompensa. Tocá un día para ver su desglose arriba.' },
        { t: 'img', src: 'recompensas-historial.png', pie: 'Parámetros del cálculo e historial de días.' },
        { t: 'nota', x: 'El día de hoy se vuelve a calcular cada vez que cambia su producción, un objetivo o las horas-hombre de un producto. Los **días anteriores ya cargados conservan el objetivo** con el que se calcularon: editar un objetivo después no los modifica.' },
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
            '**Recompensas pagadas**: la recompensa del equipo de cada día (más los bonos individuales del sistema anterior, si los hubo). Se cuenta como gasto.',
            '**Rendimiento de empleados**: etapas completadas, promedio por etapa y reparto del semáforo.'
          ]
        },
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
        { t: 'h', x: 'Costos y semáforo' },
        {
          t: 'ul',
          x: [
            '**Costo por hora de mano de obra**: se multiplica por las horas-hombre de cada producto para calcular su costo.',
            '**Tolerancia del semáforo** (0,1 equivale a 10 %): el margen alrededor del tiempo estimado que se considera “dentro de lo esperado”. El valor de la hora-hombre y el % de premio se cambian en Recompensas.'
          ]
        },
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
            ['La recompensa del día da $0', 'Revisá en Producción diaria que haya objetivos diarios activos por producto, que esté cargada la producción de ese día y que los productos tengan horas-hombre. Solo paga si lo producido alcanza el objetivo.'],
            ['Un producto no suma horas al objetivo o a lo producido', 'No tiene horas-hombre cargadas. Completalas en Productos y volvé a registrar su producción de ese día.'],
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
            ['Etapa / tarea', 'Cada paso de la fabricación (corte, soldadura, pintura…).'],
            ['Horas-hombre', 'Horas de trabajo de una persona necesarias para fabricar una unidad. Se usan para el costo, para el objetivo del equipo y para medir lo producido.'],
            ['Semáforo', 'Comparación entre el tiempo real y el estimado de una etapa. Es un indicador: no genera plata.'],
            ['Objetivo del equipo', 'Producción propuesta para el día, en horas-hombre: la suma de los objetivos diarios activos por producto.'],
            ['Recompensa del equipo', 'Premio en dinero, uno por día para todo el taller, cuando se completa el objetivo del equipo.'],
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
