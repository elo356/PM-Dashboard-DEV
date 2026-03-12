# Admin and Operations

## Resumen

La operacion administrativa actual se centra en manejo de usuarios desde `AdminPanel`.

## Frontend Admin

Archivo:

- `src/pages/adminPanel.jsx`

## Capacidades Actuales

- listar usuarios
- deshabilitar cuenta
- habilitar cuenta
- otorgar `free_pass`
- revocar `free_pass`

## Backend Admin

Rutas implementadas:

- `GET /api/admin/users`
- `POST /api/admin/users/:uid/disable`
- `POST /api/admin/users/:uid/enable`
- `POST /api/admin/users/:uid/freepass/grant`
- `POST /api/admin/users/:uid/freepass/revoke`

## Restriccion de Acceso

El backend usa `requireAdmin`, que valida:

- existencia del perfil en Firestore
- `access_level === "admin"`

## Datos Operativos Relevantes

Campos observados en usuarios:

- `disabled`
- `free_pass`
- `access_level`
- `subscription_status`
- `subscription_end`

## Hallazgo Importante

`src/pages/adminPanel.jsx` declara una accion:

- `POST /api/admin/users/:uid/access-level`

pero ese endpoint no existe actualmente en `index.js`.

Impacto:

- la UI puede sugerir capacidad de cambiar rol admin/user
- el backend no la soporta hoy

## Recomendaciones Tecnicas Futuras

- separar admin routes del archivo `index.js`
- agregar auditoria de acciones admin
- agregar paginacion real a listado de usuarios
- agregar endpoint formal de `access_level`
- agregar proteccion para evitar modificar el propio admin accidentalmente

