import { z } from "zod";

const TF_VALUES = ["1m", "5m", "15m", "30m", "1h", "4h", "6h", "12h", "1D", "1W", "1M", "1Y"];

export const marketTableQuerySchema = z.object({
  tf: z.enum(TF_VALUES).optional(),
  top: z.coerce.number().int().min(1).max(208).optional(),
});

export const marketSymbolParamsSchema = z.object({
  symbol: z.string().trim().min(1),
});

export const marketSymbolQuerySchema = z.object({
  tf: z.enum(TF_VALUES).optional(),
});

export const marketChartQuerySchema = z.object({
  symbol: z.string().trim().min(1),
  tf: z.enum(TF_VALUES).optional(),
  from_ms: z.coerce.number().int().optional(),
  to_ms: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().positive().optional(),
  px: z.coerce.number().int().positive().optional(),
  bars_needed: z.coerce.number().int().min(1).max(5000).optional(),
});

export function formatZodError(error) {
  return error.issues?.map((issue) => issue.message).join("; ") || "Invalid request";
}
