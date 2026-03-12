# Authentication and Users

## Resumen

La autenticacion usa `Firebase Auth` en frontend y `Firebase Admin` en backend.

## Frontend Auth Layer

Archivo principal:

- `src/firebase/auth.js`

Funciones expuestas:

- `watchAuth(callback)`
- `signup(email, password)`
- `login(email, password)`
- `logout()`
- `recoverPassword(email)`

## Comportamiento de Auth

### Signup

1. `createUserWithEmailAndPassword`
2. `sendEmailVerification`
3. `landing.jsx` crea perfil en Firestore con `createUserProfile`
4. redirige a `/check-email`

### Login

1. `signInWithEmailAndPassword`
2. si `emailVerified` es `false`, cierra sesion
3. lanza error `auth/email-not-verified`
4. el frontend redirige a `/check-email`

### Recovery

- `sendPasswordResetEmail`

## Perfil de Usuario en Firestore

Archivo:

- `src/firebase/user.js`

Funcion principal:

- `createUserProfile`

Campos iniciales:

- `id`
- `email`
- `first_name`
- `last_name`
- `phone`
- `access_level: "user"`
- `subscription_status: "inactive"`
- `stripe_customer_id: null`
- `stripe_subscription_id: null`
- `account_verified: false`
- `Legal`
- `terms_accepted_at`
- `privacy_accepted_at`
- `terms_version`
- `privacy_version`

## Vistas Relacionadas

### `src/pages/landing.jsx`

- maneja formulario de login/signup
- valida aceptacion legal
- crea perfil inicial

### `src/pages/checkEmail.jsx`

- confirma si el usuario ya verifico
- permite reenviar email de verificacion

### `src/routes/protectedRoute.jsx`

- bloquea acceso a rutas privadas si no hay usuario autenticado
- si el usuario no ha verificado email, lo redirige

### `src/pages/settingsPanel.jsx`

- consulta `/api/me`
- actualiza perfil via `PATCH /api/me`
- elimina cuenta via `DELETE /api/me`

## Integracion Backend

El backend valida tokens con:

- `requireAuth`

Y luego obtiene el documento del usuario desde:

- `db.collection("users").doc(uid)`

## Riesgos o Notas

- La verificacion de email es obligatoria para iniciar sesion.
- El borrado de cuenta es permanente desde frontend.
- Hay mezcla de nombres en ingles y espanol en mensajes y campos.
- `account_verified` y la verificacion real de Firebase pueden divergir si no se mantienen sincronizados.

