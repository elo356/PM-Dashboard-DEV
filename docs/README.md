# PM Dashboard Documentation

Documentacion general del proyecto `PM-Dashboard` y punto de entrada para la documentacion individual por modulo.

## 1. Resumen

Este repositorio contiene una aplicacion web para `Nerion by Valarik` con dos partes principales:

- Frontend en `React + Vite`
- Backend API en `Express + Firebase Admin + Stripe`

La app permite:

- Registro, login, verificacion de email y recuperacion de password
- Acceso protegido al dashboard
- Consulta de tabla de mercado por timeframe
- Vista individual por simbolo con graficas y comparativa por timeframe
- Gestion de suscripciones con Stripe
- Gestion de perfil del usuario
- Panel de administracion para cuentas
- Visualizacion de textos legales

## 2. Arquitectura General

### Frontend

- Entry point: `src/main.jsx`
- Layout global: `src/components/AppLayout.jsx`
- Tema global: `src/theme/theme-context.jsx`
- Rutas protegidas: `src/routes/protectedRoute.jsx`
- Paginas principales:
  - `src/pages/landing.jsx`
  - `src/pages/checkEmail.jsx`
  - `src/pages/dashboard.jsx`
  - `src/pages/SymbolDashboard.jsx`
  - `src/pages/settingsPanel.jsx`
  - `src/pages/adminPanel.jsx`

### Backend

- Servidor principal: `index.js`
- Responsabilidades:
  - autenticacion con Firebase Admin
  - integracion con Stripe
  - proxy hacia API externa de market data
  - lectura y escritura en Firestore
  - endpoints de usuario y admin

### Servicios externos

- Firebase Auth
- Firestore
- Stripe
- API de market data configurada por `MARKET_DATA_API` o `DATA_API_BASE`
- Servicio publico de IP en signup: `https://api64.ipify.org`

## 3. Flujo General de la Aplicacion

1. El usuario entra a `/`, `/login` o `/signup`.
2. `landing.jsx` maneja login o registro.
3. En signup se crea el usuario en Firebase Auth y luego su documento en Firestore.
4. Si el email no esta verificado, el flujo redirige a `/check-email`.
5. Si el email ya esta verificado, entra a `/dashboard`.
6. `dashboard.jsx` consulta `/api/me` y `/api/billing/subscription`.
7. Si tiene acceso, carga la tabla de mercado desde `/api/market/table`.
8. Al seleccionar un simbolo, entra a `/symbol/:symbol`.
9. El backend tambien expone operaciones de billing y administracion.

## 4. Estructura de Carpetas

```text
.
├── index.js
├── package.json
├── vite.config.js
├── src
│   ├── components
│   ├── firebase
│   ├── legal
│   ├── pages
│   ├── routes
│   ├── theme
│   └── main.jsx
└── docs
    ├── README.md
    └── modules
```

## 5. Variables y Configuracion

### Frontend

- `VITE_LIVE_API`
  - Base URL del servicio de market data usado por dashboard y symbol view.

### Backend

- `PORT`
- `CLIENT_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRICE_MONTHLY`
- `PRICE_3MONTHS`
- `PRICE_YEARLY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `MARKET_DATA_API`
- `DATA_API_BASE`

## 6. Modulos Documentados

- [Frontend Architecture](./modules/frontend-architecture.md)
- [Backend API](./modules/backend-api.md)
- [Authentication and Users](./modules/auth-and-users.md)
- [Billing and Subscriptions](./modules/billing-and-subscriptions.md)
- [Dashboard and Market Data](./modules/dashboard-and-market-data.md)
- [Admin and Operations](./modules/admin-and-operations.md)
- [Legal, Theme and Shared UI](./modules/legal-theme-and-ui.md)

## 7. Estado Actual y Notas Importantes

- El backend implementa endpoints admin para `disable`, `enable`, `freepass/grant` y `freepass/revoke`.
- `adminPanel.jsx` tambien intenta usar un endpoint de cambio de `access_level`, pero ese endpoint no existe hoy en `index.js`.
- La tabla de mercado del dashboard usa el backend interno `/api/market/table`.
- La vista por simbolo consume directamente la API externa de market data en lugar del backend interno.
- Existe una carpeta `dist/` generada de build. No debe usarse como fuente de verdad para documentacion ni cambios.

## 8. Recomendacion de Uso de Esta Documentacion

1. Leer este archivo primero.
2. Entrar al documento individual del area que vayas a modificar.
3. Verificar si el modulo depende de Firebase, Stripe o market data antes de tocarlo.
4. Si el cambio toca frontend y backend, revisar al menos:
   - `Frontend Architecture`
   - `Backend API`
   - `Authentication and Users`

## Nota 
- Use AI para generar esta documentacion