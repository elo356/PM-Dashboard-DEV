# Legal, Theme and Shared UI

## Resumen

Este modulo cubre tema visual, footer, modal legal y contenido legal centralizado.

## Tema

Archivos:

- `src/theme/theme-context.jsx`
- `src/theme.css`
- `src/components/ThemeToggle.jsx`

## Responsabilidades

- manejar modo claro/oscuro
- exponer contexto global de tema
- renderizar boton de cambio de tema

## Legal

Archivos:

- `src/components/LegalModal.jsx`
- `src/legal/legalContent.js`

## Contenido Legal Disponible

- `Terms and Conditions`
- `Privacy Policy`
- `Disclaimer`

## Versionado Legal

Definido en:

- `LEGAL_VERSIONS`

Valores actuales en codigo:

- `terms: 2026-03-01`
- `privacy: 2026-03-01`

## Uso en UI

- `landing.jsx` abre modal legal
- `dashboard.jsx` abre modal legal
- `SymbolDashboard.jsx` abre modal legal
- `signup` registra aceptacion legal en Firestore

## Footer Global

Archivo:

- `src/components/AppFooter.jsx`

## Responsabilidades del Footer

- mostrar branding de Valarik
- exponer accesos legales
- mantener pie global del sitio

## Notas

- El contenido legal esta embebido como strings HTML.
- `LegalModal.jsx` usa `dangerouslySetInnerHTML`.
- Cualquier cambio legal debe tocar tanto texto como versionado si aplica.

