# Dashboard and Market Data

## Resumen

Este modulo cubre la tabla principal del mercado y la vista detallada por simbolo.

## Dashboard Principal

Archivo:

- `src/pages/dashboard.jsx`

## Responsabilidades

- cargar perfil del usuario
- detectar si el usuario es admin
- consultar estado de subscription
- solicitar tabla de mercado
- mantener filtros de UI
- controlar refresh automatico

## Timeframes

Opciones observadas:

- `1m`
- `5m`
- `15m`
- `30m`
- `1h`
- `4h`
- `6h`
- `12h`
- `1D`
- `1W`
- `1M`
- `1Y`

Timeframes diarios/historicos:

- `1D`
- `1W`
- `1M`
- `1Y`

## Fuente de Datos del Dashboard

Ruta interna:

- `GET /api/market/table`

El backend decide si consulta:

- `hist/table`
- `realtime/live/table2`

segun el timeframe.

## Tabla de Mercado

Archivos:

- `src/pages/MetricsTable.jsx`
- `src/pages/MetricsTable.css`

## Funciones Principales de la Tabla

- ordenamiento multi-columna
- filtros por simbolo y regime
- vista desktop tipo tabla
- vista mobile tipo cards
- popover de informacion del simbolo
- apertura de vista detallada por simbolo

## Columnas Principales

- `rankFlow`
- `rankStatus`
- `symbol`
- `signal`
- `ptfav`
- `flowPctTotal`
- `momScore`
- `targetWt`

## Enriquecimiento de Datos

`dashboard.jsx` normaliza filas para:

- `pctChg`
- `d5`
- `d20`
- `m1`
- `m6`
- `ytd`
- `momScore`
- `dptfavPct`
- `signal`
- `rankFlow`
- `industry`
- `companyName`

## Vista por Simbolo

Archivo:

- `src/pages/SymbolDashboard.jsx`

## Responsabilidades

- consultar el mismo simbolo en todos los timeframes
- renderizar comparativa lateral
- renderizar chart principal
- mostrar metadata como company name e industry

## Fuente de Datos de Symbol Dashboard

`SymbolDashboard.jsx` consume directamente `VITE_LIVE_API`:

- historico: `/hist/table`
- realtime: `/realtime/live/table2`

Esto es distinto al dashboard general, que pasa por el backend del repo.

## Chart

Archivo:

- `src/components/ChartGLLine.jsx`

## Capacidades del Chart

- render WebGL con `regl`
- lineas de Flow y Trend
- hover con tooltip
- zoom X
- pan
- ajuste de viewport
- filtro a sesion regular de New York

## Riesgos o Notas

- Hay logica duplicada de formateo numerico entre dashboard y symbol dashboard.
- El Symbol Dashboard no reutiliza el backend interno.
- El chart usa una gran cantidad de logica en un solo componente.

