import { Router } from "express";
import {
  formatZodError,
  marketChartQuerySchema,
  marketSymbolParamsSchema,
  marketSymbolQuerySchema,
  marketTableQuerySchema,
} from "../utils/marketSchemas.js";

export function createMarketRouter({ marketGateway, buildMarketRowsWithStatus }) {
  const router = Router();

  router.get("/table", async (req, res) => {
    try {
      const parsedQuery = marketTableQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({ ok: false, error: formatZodError(parsedQuery.error) });
      }

      const tf = marketGateway.normalizeTf(parsedQuery.data.tf, "1m");
      const top = marketGateway.clampInt(parsedQuery.data.top, 1, 208, 50);
      const { source, rows } = await marketGateway.fetchTableRows(tf, top);
      const rowsWithStatus = buildMarketRowsWithStatus(tf, rows);

      return res.json({
        ok: true,
        tf,
        source,
        updatedAt: Date.now(),
        stale: false,
        rows: rowsWithStatus,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed market table fetch" });
    }
  });

  router.get("/symbol/:symbol", async (req, res) => {
    try {
      const parsedParams = marketSymbolParamsSchema.safeParse(req.params);
      const parsedQuery = marketSymbolQuerySchema.safeParse(req.query);
      if (!parsedParams.success || !parsedQuery.success) {
        const error = parsedParams.success ? parsedQuery.error : parsedParams.error;
        return res.status(400).json({ ok: false, error: formatZodError(error) });
      }

      const symbol = marketGateway.normalizeSymbol(parsedParams.data.symbol);
      const tf = marketGateway.normalizeTf(parsedQuery.data.tf, "1h");

      if (!symbol) {
        return res.status(400).json({ ok: false, error: "Invalid symbol" });
      }

      const result = await marketGateway.fetchSymbolSummary(tf, symbol);
      if (!result.symbolData) {
        return res.status(404).json({ ok: false, error: "Symbol not found" });
      }

      return res.json({
        ok: true,
        symbol: result.symbol,
        tf: result.tf,
        source: result.source,
        updatedAt: Date.now(),
        symbolData: result.symbolData,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed market symbol fetch" });
    }
  });

  router.get("/chart/bars", async (req, res) => {
    const parsedQuery = marketChartQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ ok: false, error: formatZodError(parsedQuery.error) });
    }

    const symbol = marketGateway.normalizeSymbol(parsedQuery.data.symbol);
    if (!symbol) return res.status(400).json({ ok: false, error: "Invalid symbol" });

    try {
      const payload = await marketGateway.fetchChartBars({ ...parsedQuery.data, symbol });
      return res.json(payload);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Market proxy failed" });
    }
  });

  router.get("/chart/flow-trend", async (req, res) => {
    const parsedQuery = marketChartQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ ok: false, error: formatZodError(parsedQuery.error) });
    }

    const symbol = marketGateway.normalizeSymbol(parsedQuery.data.symbol);
    if (!symbol) return res.status(400).json({ ok: false, error: "Invalid symbol" });

    try {
      const payload = await marketGateway.fetchFlowTrend({ ...parsedQuery.data, symbol });
      return res.json(payload);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Market proxy failed" });
    }
  });

  return router;
}
