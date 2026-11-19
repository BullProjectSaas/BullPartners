# MetaFlash — Bull Partners

Gestión de entrega del servicio MetaFlash: panel de Bull Partners + portal privado de cada cliente.

## Stack
- React + Vite, sin backend propio. Router por hash (compatible con GitHub Pages).
- Deploy: `npm run deploy` → `vite build` + `gh-pages -d dist` (rama `gh-pages`).

## Datos (importante)
La v0.1 guarda todo en `localStorage` (modo demo): funciona completa, pero los datos
viven en cada navegador. Toda la lectura/escritura pasa por `src/store.jsx`
(`actions` + `scopeFor` para permisos), así que el paso a Firebase
(Auth + Firestore + Storage) se hace ahí sin tocar las pantallas.

## Accesos demo
| Rol | Email | Contraseña |
|---|---|---|
| Admin | admin@bull.com | admin123 |
| Equipo | sofia@bull.com | equipo123 |
| Cliente | cliente@abc.com | cliente123 |

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
