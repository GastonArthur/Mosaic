# Mosaico web · Vercel + Supabase + Kick

Versión independiente del .exe. Hasta 12 reproductores abiertos de Kick/TikTok, tarjetas persistidas en este navegador por usuario, cuentas de Kick vinculadas por OAuth y envío manual de mensajes como la cuenta seleccionada. No modifica las sesiones del escritorio.

## Publicar

1. Creá un proyecto en Supabase. En **SQL Editor**, ejecutá `supabase.sql` una sola vez. Usa tablas nuevas `mw_*`; no toca las tablas del programa.
2. En **Authentication → Users**, creá tu usuario con email/contraseña y confirmalo. Es el acceso privado a Mosaico, separado de las cuentas de Kick. Desactivá registros públicos si será solo para vos.
3. Subí **solo esta carpeta `web`** a un repositorio privado de GitHub e importalo en Vercel. Framework: **Vite**; build: `npm run build`; salida: `dist`; Node: 22 o superior. Si el repo incluye la carpeta padre, Root Directory debe ser `web`. No subas ejecutables, cookies, perfiles ni `.env`.
4. En una aplicación de desarrollador de Kick, configurá el redirect URI exacto: `https://TU-DOMINIO/api/action?action=callback`. Usá el dominio estable de producción, no un dominio de preview cambiante.
5. En Vercel → Settings → Environment Variables, cargá las variables de `.env.example`:
   - `APP_URL`: origen HTTPS de la web, sin rutas.
   - `SUPABASE_URL`: URL de tu proyecto.
   - `SUPABASE_ANON_KEY`: clave pública anon o publishable.
   - `SUPABASE_SERVICE_ROLE_KEY`: clave privada service-role; solo backend.
   - `KICK_CLIENT_ID` y `KICK_CLIENT_SECRET`: de tu aplicación Kick.
   - `TOKEN_ENCRYPTION_KEY`: clave AES de 32 bytes codificada en base64. Generala con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Guardala de forma segura: cambiarla hace ilegibles las conexiones existentes y requiere reconectarlas.
6. Hacé **Redeploy**, entrá con tu usuario de Supabase y pulsá **Conectar cuenta** en una tarjeta. Autorizá acceso a perfil, canales y envío de mensajes en Kick. Para vincular otra cuenta, cambiá de usuario en Kick antes de autorizarla. La misma cuenta se actualiza en lugar de duplicarse.
7. Seleccioná la cuenta en la tarjeta, abrí un canal de Kick y enviá un mensaje manual para verificar que aparece con el usuario correcto.

También podés publicar desde esta carpeta con `npx vercel` y después `npx vercel --prod`, con una sesión Vercel autorizada. Nunca pegues claves privadas en el chat ni en archivos públicos.

## Uso y límites reales

- **Abrir en todas** cambia el enlace de las tarjetas; **Agregar pestaña** usa ese enlace. No hay agrupación ni suspensión automática. Los iframes se cargan con un pequeño desfase.
- Kick: canal o enlace `https://kick.com/canal`. TikTok: enlace completo `https://www.tiktok.com/@usuario/video/ID` (o una publicación de fotos). Para enlaces cortos vm/vt, abrilos en TikTok y copiá el enlace completo.
- Los videos son reproductores oficiales, no navegadores independientes. Los tokens de las cuentas nunca se inyectan en el reproductor. El botón Enviar usa la API oficial por separado.
- Cada tarjeta permite programar un mensaje con intervalo de 5 a 86400 segundos. Se inicia explícitamente, espera el primer intervalo, se pausa al cambiar cuenta/canal, perder internet, recargar o recibir un error; no reintenta envíos inciertos. Mantener la página abierta; los temporizadores pueden retrasarse en segundo plano. Una tarjeta no puede activar su temporizador en dos pestañas del mismo navegador.
- Tamaños Normal, Compacto y Mini: cambian solo CSS, conservando todos los videos.
- **Seguir en Kick** abre el canal para seguirlo desde la sesión de Kick del navegador (no la cuenta API seleccionada). El chat oficial de Kick se integra debajo de cada video, usando `/popout/CANAL/chat`, con altura ajustable y recarga independiente. El chat incrustado usa la sesión de Kick del navegador; para enviar con una cuenta vinculada a Mosaico, usar el formulario propio de la tarjeta. No se comparten tokens con el iframe ni se cambian las conexiones. No hay seguimiento por API.
- Esta actualización no requiere SQL, nuevas variables ni volver a vincular cuentas.
- Kick/TikTok pueden denegar contenido, pedir login o impedir autoplay. Play, sonido y pantalla completa están dentro del reproductor. El enlace **Abrir en origen** permite comprobar el contenido.
- La reproducción sigue consumiendo recursos de tu PC. No promete menor consumo ni acceso a videos privados.
- Las tarjetas se guardan por usuario en localStorage; las cuentas se guardan cifradas en Supabase. No existe migración automática de las sesiones del .exe.
- Desvincular elimina la autorización almacenada en esta web. Para revocar también el permiso en Kick, usá sus ajustes de aplicaciones autorizadas.
- Cuando un envío no se confirma, revisá Kick antes de repetir. No hay reintentos automáticos de mensajes.

## Seguridad y funcionamiento

Supabase Auth valida al usuario en cada petición. El cliente no tiene permisos para leer tablas privadas. El servidor filtra cada operación por el usuario autenticado. Los tokens se cifran con AES-256-GCM y se vinculan al propietario mediante AAD; la clave vive en Vercel. OAuth usa PKCE, state de un solo uso y cookie HttpOnly/Secure ligada al navegador. El lease en Postgres evita renovaciones y envíos concurrentes de una cuenta. Una clave por intento evita reprocesar la misma solicitud. No se guardan contraseñas de Kick.

Las filas `mw_receipts` se pueden limpiar cuando tengan más de 30 días para controlar el crecimiento; al limpiarlas se elimina su protección histórica contra duplicados. Las filas OAuth vencidas no se aceptan y se reemplazan al conectar nuevamente.

## Desarrollo y comprobaciones

`npm ci`, `npm test`, `npm run build`. Para probar también `/api/action`, usá `npx vercel dev`; `npm run dev` sirve solo la interfaz. Las variables privadas se cargan en el entorno del servidor, nunca con prefijo VITE_.

Las pruebas automatizadas simulan Kick y Supabase; no envían mensajes reales. La validación final de OAuth, SQL y envío requiere tus proyectos configurados y autorización de tus cuentas.

Fuentes: https://docs.kick.com/apis/chat · https://docs.kick.com/getting-started/generating-tokens-oauth2-flow · https://help.kick.com/en/articles/8010826-how-to-embed-your-kick-livestream · https://developers.tiktok.com/docs/en/embed-player
