# Backend API

## Resumen

El backend esta concentrado en `index.js` y actua como:

- API propia para frontend
- proxy hacia market data
- capa de autenticacion con Firebase Admin
- integracion de billing con Stripe
- capa admin sobre Firestore

## Stack

- `express`
- `cors`
- `firebase-admin`
- `stripe`
- `dotenv`

## Inicializacion

### Firebase Admin

- Lee `FIREBASE_SERVICE_ACCOUNT_JSON`
- Inicializa `admin.initializeApp`
- Usa:
  - `admin.auth()`
  - `admin.firestore()`

### Stripe

- Usa `STRIPE_SECRET_KEY`
- Version de API configurada: `2024-06-20`

## Middleware y Helpers

### `getBearerToken(req)`

- Extrae token del header `Authorization: Bearer ...`

### `requireAuth`

- Verifica ID token con Firebase Admin
- Inyecta `req.user`

### `requireAdmin`

- Revisa `access_level` del usuario en Firestore
- Solo permite `admin`

### `fetchJsonStrict(url)`

- Hace fetch y valida que la respuesta sea JSON valido y `ok`

### `buildMarketRowsWithStatus(tf, rows)`

- Enriquece filas con `rankStatus`
- Mantiene cache en memoria por `timeframe + symbol`
- Marca direccion del ranking:
  - `up`
  - `down`
  - `flat`

## Endpoints

### Publicos o de integracion

#### `POST /api/stripe/webhook`

- Recibe eventos de Stripe.
- Actualiza Firestore cuando:
  - se completa checkout
  - cambia la suscripcion
  - se elimina la suscripcion

#### `GET /api/market/table`

- Query params:
  - `tf`
  - `top`
- Decide si consulta:
  - `${MARKET_DATA_API}/hist/table`
  - `${MARKET_DATA_API}/realtime/live/table2`
- Devuelve `rows` enriquecidas con `rankStatus`

### Usuario autenticado

#### `GET /api/me`

- Devuelve perfil consolidado del usuario.

#### `PATCH /api/me`

- Actualiza:
  - `first_name`
  - `last_name`
  - `phone`
  - `language`
  - `notify_renewal_days`

#### `DELETE /api/me`

- Borra documento en Firestore
- Borra usuario en Firebase Auth

### Billing

#### `POST /api/checkout`

- Crea sesion de Stripe Checkout para subscription.
- Usa `PRICE_MONTHLY`, `PRICE_3MONTHS` y `PRICE_YEARLY`.

#### `POST /api/billing/sync-checkout`

- Sincroniza sesion de checkout despues del redirect.

#### `POST /api/billing/portal`

- Abre portal del cliente en Stripe.

#### `GET /api/billing/invoices`

- Lista hasta 20 invoices del cliente.

#### `GET /api/billing/subscription`

- Devuelve estado actual de la subscription.
- Si `free_pass === true`, concede acceso como `status: "free"`.

#### `POST /api/billing/auto-renew`

- Enciende o apaga `cancel_at_period_end`.

### Admin

#### `GET /api/admin/users`

- Lista hasta 200 usuarios de Firestore.

#### `POST /api/admin/users/:uid/disable`

- Marca cuenta como deshabilitada.

#### `POST /api/admin/users/:uid/enable`

- Reactiva cuenta deshabilitada.

#### `POST /api/admin/users/:uid/freepass/grant`

- Da acceso por `free_pass`.

#### `POST /api/admin/users/:uid/freepass/revoke`

- Revoca `free_pass`.

## Modelo de Datos Esperado en Firestore

Coleccion principal:

- `users`

Campos observados en el codigo:

- `email`
- `first_name`
- `last_name`
- `phone`
- `access_level`
- `disabled`
- `language`
- `notify_renewal_days`
- `stripe_customer_id`
- `stripe_subscription_id`
- `subscription_status`
- `subscription_end`
- `cancel_at_period_end`
- `free_pass`
- `Legal`
- `terms_accepted_at`
- `privacy_accepted_at`
- `terms_version`
- `privacy_version`

## Limitaciones Actuales

- Toda la API vive en un solo archivo `index.js`.
- No hay separacion por routers, services o controllers.
- `adminPanel.jsx` espera un endpoint para cambiar `access_level`, pero ese endpoint no existe.
- No hay validacion estructurada de payloads con schemas.

