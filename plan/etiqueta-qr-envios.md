# Flexya · Etiqueta con QR por envío (escaneo del mensajero y del superadmin)

> Plan de diseño. Fecha: 19/11/2026. Estado: pendiente de aprobación (aún no implementado).

## Contexto
El dueño quiere que, al crear un envío, el cliente obtenga un **código QR** que identifique ese envío, y que el **mensajero o el superadmin lo escaneen** para saber de quién es y ver sus datos. Pidió analizar si es posible, si ese es el uso real en la industria y cómo mejorarlo para que sea aplicable de verdad.

Estado del proyecto: la app es hoy una **maqueta** (Angular 22, datos en `localStorage`, sin backend; backend Spring Boot + PostgreSQL pendiente) desplegada en Vercel. El rediseño visual está hecho (la fase 7 de pulido queda para el final).

## Veredicto: sí es posible y sí es el uso real, con un ajuste de concepto
**Es el patrón estándar de la última milla.** Mercado Envíos Flex imprime la etiqueta con QR, el vendedor la pega en el paquete y el repartidor la escanea con la app para retirar y marcar entregado ("el QR manda"). Plataformas como Track-POD o Locus usan el escaneo de códigos (1D/2D, GS1-128) como prueba de entrega, junto con foto, firma, OTP y geoposición.

**Ajuste de concepto:** el QR no "guarda los datos" del envío; es la **llave** que los abre. Contiene solo un identificador (sin datos personales) y los datos se consultan al escanear, con sesión y permisos por rol. Así se protege la privacidad y los datos nunca quedan desactualizados. La etiqueta impresa lleva además el texto legible (número, destinatario, zona) como respaldo.

**Limitación honesta de la maqueta:** como los datos viven en el navegador de cada persona, un QR escaneado en el celular del mensajero no encuentra un envío creado en la computadora del cliente. Con backend el mismo QR funciona entre dispositivos sin cambiar la etiqueta. En esta etapa se demuestra completo en un mismo navegador/dispositivo.

## Decisiones tomadas (respondidas por el usuario)
1. **Alcance:** maqueta funcional (todo lo que se puede mostrar hoy; listo para conectar al backend).
2. **Al escanear:** ficha del envío + **solo la acción que corresponde** al rol y estado, **con confirmación**; nunca cambia el estado automáticamente.
3. **Contenido del QR:** enlace corto con **código opaco** no adivinable (no el número `LF-10001`).

## Diseño

### 1. Código y modelo
- Nuevo campo `Envio.codigo`: 8 caracteres base32 sin ambiguos (sin 0/O/1/I), generado con `crypto.getRandomValues` en `DataService.crearEnvio/crearRetiro` (`core/services/data.service.ts`, ids en línea ~84), con chequeo de unicidad.
- El QR contiene `https://<dominio>/e/<codigo>` (nivel de corrección M). `LF-10001` sigue siendo el número legible y de búsqueda humana.
- Migración del esquema (`core/services/almacenamiento.ts`, subir `VERSION_ESQUEMA` 7→8): asignar `codigo` a envíos existentes. Se reutiliza el patrón de migraciones ya existente.
- Retiros con varios destinatarios: **una etiqueta por envío**, con `retiroId` (R-xxxxx) y "n de N" impresos. Sin QR de retiro propio en esta etapa.
- Historial de escaneos barato y de valor: registrar `{fecha, usuarioId, rol, resultado, acción}` (también los intentos rechazados) junto al historial del envío (`HitoEnvio`).

### 2. Ruta de escaneo y retorno tras login
- Nueva ruta protegida `/e/:codigo` en `app.routes.ts`.
- Hoy **no existe `returnUrl`**: `core/guards/auth.guards.ts` redirige a login y pierde el destino, y la ruta `**` también. Hay que implementar el retorno (guard + `features/auth/login.ts`) para que escanear sin sesión lleve a login y vuelva a la ficha.

### 3. Resolución por rol (componente `features/escaneo/envio-escaneado.ts`)
- Nuevo `DataService.envioPorCodigo(user, codigo)`, basado en la lógica de visibilidad de `enviosDe` (cliente: los suyos; mensajero: los asignados; admin: todos salvo Borrador). No distingue "no existe" de "no es tuyo".
- **Mensajero:** ficha (destinatario, dirección, estado, retiro) y acción contextual: Retiro asignado → *Retiré*; Retirado → *Salir a entregar* / *Entregué en depósito*; En reparto → *Entregado* / *Incidencia*. Usa `AccionesEnvio` (`core/services/envio-acciones.ts`) y `AlertService`, que ya piden confirmación. Si no es suyo: "Este paquete no está asignado a vos".
- **Superadmin:** ficha completa con historial y acciones Recepcionar / Asignar según estado.
- **Cliente:** ficha de solo lectura de sus envíos.
- **Requisito previo de seguridad:** `DataService.entregar` (línea ~513) no valida nada (ni estado, ni mensajero, ni rol) y `reportarIncidencia` no valida quién actúa; hoy el permiso vive solo en la UI. Agregar validaciones de estado, rol y pertenencia en el servicio antes de habilitar el escaneo.

### 4. Etiqueta imprimible
- Componente `shared/ui/etiqueta-envio.ts`: QR (SVG), `LF-xxxxx`, retiroId, destinatario, dirección/zona, remitente, fecha y código legible de respaldo.
- Formatos: **10×15 cm (A6)** para térmica y **A4 con 2×2**; estilos `@media print` con `@page` y ocultando shell/barras; impresión con `window.print()` (hoy no existe nada de impresión en el proyecto).
- Puntos de entrada: (a) tras crear el envío, modal "Envío creado" con las etiquetas e **Imprimir todas** (enganche en `features/envios/crear-envio.ts:40-46`; no aplica a borradores); (b) botón **Imprimir etiqueta** en el footer de `features/envios/envio-detalle-modal.ts` (línea ~153, hoy solo "Cerrar"); (c) acción en `shared/ui/envios-table.ts` (junto a "Ver detalle") y en las tarjetas.

### 5. Pantalla de escaneo
- `features/escaneo/escaner.ts` + `shared/util/escaner.ts`: cámara con `getUserMedia({ facingMode: 'environment' })`; `BarcodeDetector` nativo si existe y, si no (iOS Safari), polyfill `barcode-detector` cargado **bajo demanda**; ingreso manual del código (también sirve para pistolas lectoras tipo teclado); manejo de permiso denegado, sin cámara, linterna, vibración al leer.
- Al leer, se extrae el código de la URL, se normaliza y se navega a `/e/:codigo`.
- Acceso: mensajero → 5.º ítem **Escanear** (`qr-code-scan`) en `layout/shell.ts` (tiene 4, cabe sin "Más"); admin → botón en la barra superior (ya usa "Más").
- **Despliegue:** `vercel.json` línea 11 tiene `Permissions-Policy: camera=()` que **bloquea la cámara** en producción → cambiar a `camera=(self)`.

### 6. Dependencias y presupuesto
- `qrcode` (1.5.4, MIT, ~135 kB sin comprimir) y `barcode-detector` (3.2.4, MIT, usa zxing-wasm). Ambas **se cargan de forma diferida** (lazy): el bundle inicial está en ~775 kB y el límite configurado es 800 kB.

## Orden de trabajo
1. Modelo y servicio: `codigo`, migración 7→8, `envioPorCodigo`, validaciones de transición en `DataService`, historial de escaneos.
2. Utilidades: `shared/util/codigo-envio.ts` (generar/normalizar/construir y parsear URL) y `shared/util/qr.ts`.
3. `returnUrl` + ruta `/e/:codigo` + resolutor `envio-escaneado.ts` con la lógica por rol.
4. Etiqueta, estilos de impresión, modal tras crear el envío, botones en detalle y tabla/tarjeta, "Imprimir todas".
5. Escáner (cámara + fallback + manual), acceso en el menú por rol y `vercel.json`.
6. Etapa 2 opcional dentro de la maqueta: **escaneo continuo por retiro** (el mensajero escanea los paquetes de un retiro con progreso "3 de 5"; resuelve que `retirar` actúe sobre todo el `retiroId`).

## Archivos críticos
- Modificar: `core/models/index.ts`, `core/services/data.service.ts`, `core/services/almacenamiento.ts`, `core/services/envio-acciones.ts`, `core/guards/auth.guards.ts`, `features/auth/login.ts`, `app.routes.ts`, `features/envios/crear-envio.ts`, `features/envios/envio-detalle-modal.ts`, `shared/ui/envios-table.ts`, `layout/shell.ts`, `vercel.json`, `package.json`, estilos de impresión.
- Nuevos: `shared/util/{codigo-envio,qr,escaner}.ts`, `shared/ui/etiqueta-envio.ts`, `features/envios/etiquetas-modal.ts`, `features/escaneo/{escaner,envio-escaneado}.ts` y sus `.spec.ts`.
- Reutilizar: `AccionesEnvio`, `AlertService`, `EnvioDetalleModal`, `DataService.enviosDe` (base de `envioPorCodigo`), el patrón de migraciones de `almacenamiento.ts`, `shared/util/contacto.ts` como modelo de utilidades, el patrón de modales ng-bootstrap con clase `fx-modal` (hoja inferior en teléfono ya resuelta).

## Verificación
- `ng build` sin avisos (vigilar el presupuesto inicial) y `ng test` en verde. Pruebas nuevas (Vitest): código (formato, alfabeto sin ambiguos, unicidad, migración de datos viejos); parseo de URL / código manual / `LF-xxxxx`; `envioPorCodigo` por rol y código inexistente; validaciones de transición (incluye `entregar` sin precondiciones); `/e/:codigo` sin sesión → login → vuelve; resolutor (acción por estado, "no te pertenece", nunca cambia estado sin confirmar); etiqueta (QR, ID, destinatario, retiroId; "Imprimir todas" genera N); escáner con `BarcodeDetector`, cámara y `window.print` simulados.
- Manual en `localhost:4200` (la cámara funciona en localhost aunque no sea HTTPS): crear un envío como cliente → ver etiquetas → imprimir (vista previa A6 y A4) → entrar como mensajero/admin en el mismo navegador → escanear/ingresar el código → ver la ficha y la acción con confirmación.
- En Vercel (HTTPS) probar la cámara en un teléfono real, y en iPhone confirmar el fallback.

## Fuera de alcance (Fase 2, con backend)
Resolución por `GET /envios/codigo/{codigo}` con autorización en el servidor, transiciones validadas y registro de escaneos en servidor (la etiqueta y el enlace no cambian); prueba de entrega con OTP del destinatario y luego foto/firma; geoposición al escanear; PWA instalable / enlace directo al escáner.
