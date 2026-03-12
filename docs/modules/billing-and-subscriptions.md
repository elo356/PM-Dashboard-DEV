# Billing and Subscriptions

## Resumen

El billing usa `Stripe Checkout`, `Stripe Billing Portal` y webhooks para persistir el estado en Firestore.

## Flujo Principal

### Compra

1. El usuario entra a la seccion `Pro` del dashboard.
2. El frontend llama `POST /api/checkout`.
3. El backend crea o reutiliza `stripe_customer_id`.
4. Stripe Checkout redirige al usuario.
5. El webhook `checkout.session.completed` persiste:
   - `stripe_customer_id`
   - `stripe_subscription_id`
   - `subscription_status`
   - `subscription_end`

### Sincronizacion post-checkout

- `POST /api/billing/sync-checkout`
- Se usa para sincronizar el estado del checkout despues del redirect.

### Consulta de estado

- `GET /api/billing/subscription`
- Se usa para:
  - habilitar acceso premium
  - mostrar estado de renovacion
  - controlar botones del panel Pro

### Portal

- `POST /api/billing/portal`
- Abre el customer portal de Stripe

### Facturas

- `GET /api/billing/invoices`

### Auto-renew

- `POST /api/billing/auto-renew`
- Cambia `cancel_at_period_end`

## Planes

Definidos por variables de entorno:

- `PRICE_MONTHLY`
- `PRICE_3MONTHS`
- `PRICE_YEARLY`

Valores de `plan` aceptados:

- `monthly`
- `3months`
- `yearly`

## Frontend Relacionado

### `src/pages/dashboard.jsx`

- Carga subscription actual
- Renderiza paywall o acceso
- Permite abrir checkout
- Permite abrir portal
- Permite encender/apagar auto-renew

### `src/pages/settingsPanel.jsx`

- Abre el portal de billing desde settings

## Free Pass

Existe una ruta especial:

- Si `users.free_pass === true`, `/api/billing/subscription` responde con acceso permitido aunque no haya Stripe activo.

Esto impacta:

- acceso al dashboard premium
- estado funcional del usuario

## Webhooks Stripe Soportados

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Riesgos o Notas

- Si falla el webhook, el estado en Firestore puede quedar desincronizado.
- El backend intenta recuperar la mejor subscription si no tiene `stripe_subscription_id`.
- No hay capa de reintentos ni job de reconciliacion persistente.

