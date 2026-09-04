# App Reporte de Despachos — Sucden (v2: diseño renovado + edición)

## Qué cambió en esta versión

- **Login rediseñado**: logo real de S&D Sucden, reloj en vivo (fecha y hora), spinner de carga en los botones, look más "futurista" (gradientes navy/índigo).
- **Registro con Política de Tratamiento de Datos**: para solicitar acceso ahora es obligatorio marcar la casilla de aceptación. Puedes leer el texto completo tocando el enlace — está basado en la Ley 1581 de 2012 (habeas data Colombia). **Recomendación:** haz que un abogado o el área de cumplimiento de Sucden revise ese texto antes de usarlo en producción; lo que incluí es un texto estándar de referencia, no asesoría legal.
- **Pantalla "hub" después del login**: dos tarjetas grandes — **Datos Andes** y **Datos Orquídea** — cada una mostrando cuántos reportes tiene guardados. Al tocar una, entras a esa sección.
- **Banner "Estás trabajando en"**: dentro de cada sección, siempre ves con letra grande y clara en qué tabla se está guardando la información.
- **Edición de reportes**: dentro de "Registros guardados", cada reporte tiene un botón **"Editar este reporte"** que carga los datos en el formulario para corregirlos y guardar los cambios.
- **Todo responsive**: se ajusta automáticamente entre celular y PC (el hub pasa de 1 a 2 columnas en pantallas anchas, por ejemplo).

Los datos de conexión (Sheet, carpeta de Drive, URL del backend) ya están puestos — son los mismos de la versión anterior.

---

## Paso 1 — Actualizar el backend

1. Abre tu Google Sheet → **Extensiones → Apps Script**.
2. Reemplaza todo el contenido por el nuevo `Code.gs`.
3. Si ya habías ejecutado `configurarAdminInicial()` antes y tu cuenta admin ya existe, **no la vuelvas a ejecutar** (o no pasa nada, simplemente te avisará "El admin ya existe"). Si es la primera vez, recuerda reemplazar `CEDULA_ADMIN` por tu número real antes de ejecutarla.
4. Ve a **Implementar → Administrar implementaciones → editar (ícono de lápiz) → Nueva versión → Implementar**. La URL sigue siendo la misma.

---

## Paso 2 — Subir el frontend

1. Sube `index.html` y `app.js` a tu repositorio de GitHub, reemplazando los anteriores.
2. GitHub Pages se actualiza solo en 1-2 minutos.

---

## Notas sobre el diseño

- El logo va incrustado directamente en el HTML (no es un archivo aparte), así que no tienes que subir ninguna imagen adicional al repositorio.
- Los conteos de reportes en el hub se cargan automáticamente al iniciar sesión; si tienes muchísimos reportes, ese primer cálculo puede tardar unos segundos.
- La edición de reportes actualiza los campos de texto (fecha, placa, lotes, responsable) y permite agregar imágenes adicionales nuevas. El "Documento anexo" original no se reemplaza al editar — si necesitas cambiar ese archivo específico, dímelo y agrego esa opción.

## Seguridad (recordatorio)

- Las claves siguen guardándose cifradas (SHA-256), nunca en texto plano.
- `Code.gs` no se sube a GitHub — solo vive en Apps Script.
- Cambia la clave `1103` del admin por una más robusta apenas puedas.
