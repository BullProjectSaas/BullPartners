# MetaFlash — Bull Partners

Gestión de entrega del servicio MetaFlash: panel de Bull Partners + portal privado de cada cliente.

## Stack
- React + Vite, sin backend propio. Router por hash (compatible con GitHub Pages).
- Deploy: `npm run deploy` → `vite build` + `gh-pages -d dist` (rama `gh-pages`).

## Datos
Firebase (`metaflash-bull`): Authentication (email/contraseña) + Firestore en tiempo real.
Permisos en `firestore.rules` (pegarlas en Firebase → Firestore → Reglas → Publicar).
Primer ingreso: "Primera vez (configuración)" en el login crea el admin inicial (una sola vez).
Archivos: sin Storage se guardan en Firestore (imágenes comprimidas; otros hasta ~700 KB). Videos por link.

## Módulos
Dashboard · Clientes y proyectos · Tareas (lista/Kanban, internas o visibles al cliente) ·
Calendario · Portal del cliente · Aprobación de guiones y creatividades (versiones + historial) ·
Reportes (con leído/no leído) · Archivos · Comentarios · Notificaciones · Producción mensual
(anuncios incluidos por cliente, historial por mes, duplicar tareas al mes siguiente).

## Desarrollo
```bash
npm install
npm run dev
```
