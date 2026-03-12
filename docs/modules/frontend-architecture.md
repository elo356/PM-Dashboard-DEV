# Frontend Architecture

## Resumen

El frontend esta construido con `React 19`, `react-router-dom`, `Vite` y CSS modular por pagina/componente.

## Entry Point

- Archivo: `src/main.jsx`
- Responsabilidades:
  - monta `ReactDOM.createRoot`
  - envuelve la app con `ThemeProvider`
  - configura `BrowserRouter`
  - declara rutas publicas y protegidas

## Layout Global

- Archivo: `src/components/AppLayout.jsx`
- Inserta:
  - contenido principal via `Outlet`
  - footer global via `AppFooter`

## Rutas

- `/` -> `Landing`
- `/login` -> `Landing`
- `/signup` -> `Landing`
- `/check-email` -> `CheckEmail`
- `/dashboard` -> `ProtectedRoute(Dashboard)`
- `/symbol/:symbol` -> `ProtectedRoute(SymbolDashboard)`

## Paginas Principales

### `src/pages/landing.jsx`

- Maneja login y signup en la misma pantalla.
- Ejecuta:
  - `login`
  - `signup`
  - `recoverPassword`
  - `createUserProfile`
- Guarda aceptacion legal al crear usuario.
- Muestra demo estatica de simbolos y metrics.

### `src/pages/checkEmail.jsx`

- Revisa si el usuario ya verifico su email.
- Permite reenviar email de verificacion.
- Si verifica correctamente, actualiza estado en Firestore y redirige al dashboard.

### `src/pages/dashboard.jsx`

- Pagina principal autenticada.
- Controla:
  - navegacion interna entre Market, Pro, Settings y Admin
  - consulta de perfil
  - consulta de subscription
  - carga de tabla de mercado
  - filtros por timeframe, top e industry
  - auto-refresh de mercado

### `src/pages/SymbolDashboard.jsx`

- Vista detallada para un simbolo especifico.
- Carga datos por timeframe.
- Presenta comparativa lateral y chart principal.

### `src/pages/settingsPanel.jsx`

- Panel de perfil del usuario.
- Permite actualizar datos del perfil.
- Permite abrir el portal de Stripe.
- Permite eliminar la cuenta.

### `src/pages/adminPanel.jsx`

- Panel de administracion.
- Lista usuarios desde Firestore via backend.
- Permite deshabilitar/habilitar cuentas y dar/quitar `free_pass`.

## Componentes Principales

### `src/pages/MetricsTable.jsx`

- Tabla central del dashboard.
- Responsabilidades:
  - render de columnas del ranking
  - ordenamiento multi-columna
  - filtros por columna
  - popovers y dropdowns portalizados
  - navegacion al Symbol Dashboard

### `src/components/ChartGLLine.jsx`

- Chart WebGL con `regl`.
- Dibuja series de Flow y Trend.
- Soporta zoom, pan y hover.
- Filtra datos a horario regular NY.

### `src/components/ChartGLMetrics.jsx`

- Reexporta o encapsula la grafica metrica usada por `SymbolDashboard`.
- Depende del flujo principal de `ChartGLLine.jsx`.

### `src/components/ThemeToggle.jsx`

- Cambia entre tema claro y oscuro.

### `src/components/LegalModal.jsx`

- Renderiza Terms, Privacy y Disclaimer.
- Usa HTML embebido desde `src/legal/legalContent.js`.

## Estado Global Ligero

- No hay Redux ni Zustand.
- El estado vive principalmente en componentes de pagina.
- El contexto compartido principal es el tema:
  - `src/theme/theme-context.jsx`

## Estilos

- Cada pagina/componente importante tiene su CSS dedicado.
- Archivos principales:
  - `src/theme.css`
  - `src/pages/dashboard.css`
  - `src/pages/landing.css`
  - `src/pages/MetricsTable.css`
  - `src/pages/SymbolDashboard.css`
  - `src/pages/settingsPanel.css`
  - `src/pages/auth.css`

## Riesgos o Particularidades

- Hay bastante logica de negocio dentro de componentes grandes como `dashboard.jsx` y `MetricsTable.jsx`.
- `SymbolDashboard.jsx` consume la API externa directamente, no el backend del repo.
- Varias utilidades de formato estan duplicadas entre componentes.

