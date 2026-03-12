import { fetchJsonStrict } from "../utils/fetchJsonStrict.js";

const MARKET_DAILY_TFS = new Set(["1D", "1W", "1M", "1Y"]);
const MARKET_TFS = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "6h", "12h", "1D", "1W", "1M", "1Y"]);

function toFiniteNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeTf(tf, fallback = "1m") {
  const value = String(tf || fallback).trim();
  return MARKET_TFS.has(value) ? value : fallback;
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

function adaptMarketRow(row) {
  const liquidityFootprint = row?.liquidityFootprint ?? row?.ptfav ?? null;
  const flowPct = row?.flowPct ?? row?.flowPctTotal ?? null;
  const trendAcceleration = row?.trendAcceleration ?? row?.momScore ?? null;

  return {
    ...row,
    symbol: normalizeSymbol(row?.symbol),
    rankFlow: row?.rankFlow ?? row?.rank ?? row?.Rank ?? null,
    companyName: row?.companyName ?? row?.company_name ?? null,
    industry: row?.industry ?? null,
    liquidityFootprint,
    flowPct,
    trendAcceleration,
    ptfav: liquidityFootprint,
    flowPctTotal: flowPct,
    momScore: trendAcceleration,
    targetWt: row?.targetWt ?? null,
    trend_dir: toFiniteNum(row?.trend_dir),
    staleSymbol: row?.staleSymbol ?? false,
    isPartial: row?.isPartial ?? false,
    ageSec: toFiniteNum(row?.ageSec),
    lastKey: toFiniteNum(row?.lastKey),
  };
}

function adaptMarketRows(rows) {
  return (rows || []).map(adaptMarketRow);
}

function getTableUrl(marketDataApi, tf, top) {
  const qs = new URLSearchParams({ tf, top: String(top) });
  const isHist = MARKET_DAILY_TFS.has(tf);

  return {
    isHist,
    url: isHist
      ? `${marketDataApi}/hist/table?${qs.toString()}`
      : `${marketDataApi}/realtime/live/table2?${qs.toString()}`,
  };
}

export function createMarketGateway({ marketDataApi }) {
  async function fetchTableRows(tf, top) {
    const normalizedTf = normalizeTf(tf, "1m");
    const normalizedTop = clampInt(top, 1, 208, 50);
    const { isHist, url } = getTableUrl(marketDataApi, normalizedTf, normalizedTop);
    const payload = await fetchJsonStrict(url);
    const rawRows = isHist
      ? (Array.isArray(payload.top) ? payload.top : [])
      : (Array.isArray(payload.top) ? payload.top : (Array.isArray(payload.rows) ? payload.rows : []));

    return {
      tf: normalizedTf,
      top: normalizedTop,
      source: isHist ? "hist" : "live",
      rows: adaptMarketRows(rawRows),
      payload,
    };
  }

  async function fetchSymbolSummary(tf, symbol) {
    const normalizedTf = normalizeTf(tf, "1h");
    const normalizedSymbol = normalizeSymbol(symbol);
    const qs = new URLSearchParams({ tf: normalizedTf, symbol: normalizedSymbol });

    try {
      const summary = await fetchJsonStrict(`${marketDataApi}/symbol/summary?${qs.toString()}`);
      return {
        symbol: normalizedSymbol,
        tf: normalizedTf,
        source: "summary",
        symbolData: adaptMarketRow(summary),
      };
    } catch (error) {
      const table = await fetchTableRows(normalizedTf, 208);
      const symbolData = table.rows.find((row) => row.symbol === normalizedSymbol) || null;
      if (!symbolData) throw error;

      return {
        symbol: normalizedSymbol,
        tf: normalizedTf,
        source: table.source,
        symbolData,
      };
    }
  }

  async function fetchChartBars(query) {
    const symbol = normalizeSymbol(query.symbol);
    const tf = normalizeTf(query.tf, "1m");
    const qs = new URLSearchParams({ symbol, tf });

    for (const key of ["from_ms", "to_ms", "limit", "px", "bars_needed"]) {
      if (query[key] != null) qs.set(key, String(query[key]));
    }

    const payload = await fetchJsonStrict(`${marketDataApi}/chart/bars?${qs.toString()}`);
    return { ...payload, ok: true, symbol, tf };
  }

  async function fetchFlowTrend(query) {
    const symbol = normalizeSymbol(query.symbol);
    const tf = normalizeTf(query.tf, "1m");
    const barsNeeded = clampInt(query.bars_needed, 1, 5000, 400);
    const qs = new URLSearchParams({
      symbol,
      tf,
      bars_needed: String(barsNeeded),
    });

    const payload = await fetchJsonStrict(`${marketDataApi}/chart/flow-trend?${qs.toString()}`);
    return { ...payload, ok: true, symbol, tf };
  }

  return {
    normalizeSymbol,
    normalizeTf,
    clampInt,
    fetchTableRows,
    fetchSymbolSummary,
    fetchChartBars,
    fetchFlowTrend,
  };
}
