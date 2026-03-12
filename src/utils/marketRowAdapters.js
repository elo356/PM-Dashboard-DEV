function toFiniteNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeSignal(value) {
  const signal = String(value ?? "").trim().toUpperCase();
  if (signal === "BUY") return "BULLISH";
  if (signal === "SELL" || signal === "ROTATE") return "BEARISH";
  if (signal === "HOLD") return "NEUTRAL";
  return signal || "NEUTRAL";
}

export function adaptMarketRow(row) {
  const liquidityFootprint = row?.liquidityFootprint ?? row?.ptfav ?? null;
  const flowPct = row?.flowPct ?? row?.flowPctTotal ?? null;
  const trendAcceleration = row?.trendAcceleration ?? row?.momScore ?? null;
  const rankFlow = row?.rankFlow ?? row?.rank ?? row?.Rank ?? null;
  const ptfav = liquidityFootprint ?? null;
  const flowPctTotal = flowPct ?? null;
  const momScore = trendAcceleration ?? null;
  const dptfav = toFiniteNum(row?.dptfav ?? row?.dPTFAV ?? row?.deltaPTFAV);

  return {
    ...row,
    symbol: normalizeSymbol(row?.symbol),
    signal: normalizeSignal(row?.signal),
    rankFlow,
    companyName: row?.companyName ?? row?.company_name ?? null,
    industry: row?.industry ?? null,
    liquidityFootprint,
    flowPct,
    trendAcceleration,
    ptfav,
    flowPctTotal,
    momScore,
    dptfav,
    dptfavPct: ptfav != null && ptfav !== 0 && dptfav != null ? dptfav / ptfav : null,
    targetWt: row?.targetWt ?? null,
    trend_dir: row?.trend_dir ?? null,
    isPartial: row?.isPartial ?? null,
    staleSymbol: row?.staleSymbol ?? null,
    ageSec: row?.ageSec ?? null,
    lastKey: row?.lastKey ?? null,
  };
}

export function adaptMarketRows(rows) {
  return Array.isArray(rows) ? rows.map(adaptMarketRow) : [];
}
