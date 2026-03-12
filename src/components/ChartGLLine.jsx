import { useEffect, useMemo, useRef, useState } from "react";
import createREGL from "regl";

const NY_TZ = "America/New_York";

/* =========================
   Utils
   ========================= */
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function fmtPct(x) {
  if (!Number.isFinite(x)) return "-";
  const ax = Math.abs(x);
  const dp = ax >= 100 ? 0 : ax >= 10 ? 1 : 2;
  return `${x.toFixed(dp)}%`;
}

function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    timeZone: NY_TZ,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function timeTicks(fromMs, toMs, count = 6) {
  const out = [];
  const span = Math.max(1, toMs - fromMs);
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    out.push(fromMs + u * span);
  }
  return out;
}

function yTicks(y0, y1, count = 6) {
  const out = [];
  const span = Math.max(1e-9, y1 - y0);
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    out.push(y1 - u * span);
  }
  return out;
}

function isRegularNY(ms) {
  const d = new Date(ms);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const wk = parts.find(p => p.type === "weekday")?.value || "";
  if (wk === "Sat" || wk === "Sun") return false;

  const hh = Number(parts.find(p => p.type === "hour")?.value || "0");
  const mm = Number(parts.find(p => p.type === "minute")?.value || "0");
  const mins = hh * 60 + mm;

  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return mins >= open && mins < close;
}

function computeVisibleY(t, a, b, fromMs, toMs) {
  let mn = Infinity, mx = -Infinity;

  for (let i = 0; i < t.length; i++) {
    const ti = t[i];
    if (ti < fromMs || ti > toMs) continue;

    const va = a ? a[i] : null;
    const vb = b ? b[i] : null;

    if (Number.isFinite(va)) { mn = Math.min(mn, va); mx = Math.max(mx, va); }
    if (Number.isFinite(vb)) { mn = Math.min(mn, vb); mx = Math.max(mx, vb); }
  }

  if (!Number.isFinite(mn) || !Number.isFinite(mx)) { mn = -1; mx = 1; }
  if (mn === mx) { mn -= 1; mx += 1; }

  const pad = (mx - mn) * 0.08 || 1;
  return { y0: mn - pad, y1: mx + pad };
}

async function fetchJson(url, { signal } = {}) {
  const r = await fetch(url, { signal });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); }
  catch { throw new Error(`Non-JSON (${r.status}) ${url}: ${text.slice(0, 220)}`); }
  if (!r.ok || j?.ok === false) {
    const e = new Error(j?.error || j?.message || `HTTP ${r.status}`);
    e.http = r.status;
    throw e;
  }
  return j;
}

/** fallback: usa bars.c para inventar flow/trend (solo para validar render) */
function barsToMetrics(jBars) {
  const t = jBars.t || [];
  const c = jBars.c || [];
  const n = Math.min(t.length, c.length);

  const flow = new Array(n).fill(null);
  const trend = new Array(n).fill(null);

  for (let i = 1; i < n; i++) {
    const p0 = c[i - 1], p1 = c[i];
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || p0 === 0) continue;
    flow[i] = ((p1 - p0) / Math.abs(p0)) * 100;
  }
  for (let i = 2; i < n; i++) {
    if (!Number.isFinite(flow[i]) || !Number.isFinite(flow[i - 1])) continue;
    trend[i] = flow[i] - flow[i - 1];
  }

  return {
    ok: true,
    symbol: jBars.symbol,
    tf_used: jBars.tf_used,
    source: jBars.source,
    stale: jBars.stale,
    lastKey: jBars.lastKey || (t.length ? t[t.length - 1] : null),
    t, flow, trend,
    note: "fallback_from_bars",
  };
}

/** viewport default */
function defaultWindowMs(tf) {
  const m = {
    "1m": 6 * 60 * 60 * 1000,
    "5m": 24 * 60 * 60 * 1000,
    "15m": 3 * 24 * 60 * 60 * 1000,
    "30m": 5 * 24 * 60 * 60 * 1000,
    "1h": 14 * 24 * 60 * 60 * 1000,
    "4h": 60 * 24 * 60 * 60 * 1000,
    "6h": 90 * 24 * 60 * 60 * 1000,
    "12h": 140 * 24 * 60 * 60 * 1000,
    "1D": 365 * 24 * 60 * 60 * 1000,
    "1W": 3 * 365 * 24 * 60 * 60 * 1000,
    "1M": 6 * 365 * 24 * 60 * 60 * 1000,
    "1Y": 15 * 365 * 24 * 60 * 60 * 1000,
  };
  return m[tf] ?? (14 * 24 * 60 * 60 * 1000);
}

/* =========================
   ChartGLMetrics
   ========================= */
export default function ChartGLMetrics({
  apiBase,
  symbol,
  tf,
  height = 520,
  limit = 20000,
}) {
  const canvasRef = useRef(null);
  const reglRef = useRef(null);

  const [err, setErr] = useState("");
  const [meta, setMeta] = useState(null);

  // series arrays (filtered to regular NY)
  const [data, setData] = useState(null); // {t, flow, trend}

  const [showFlow, setShowFlow] = useState(true);
  const [showTrend, setShowTrend] = useState(true);

  const [viewport, setViewport] = useState(() => {
    const toMs = Date.now();
    const fromMs = toMs - defaultWindowMs(tf);
    return { fromMs, toMs };
  });

  const dragRef = useRef(null);
  const abortRef = useRef(null);
  const rafFetchRef = useRef(0);
  const [hover, setHover] = useState(null);

  // Init regl + resize (igual que tu chart)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.floor(rect.width * dpr));
      canvas.height = Math.max(2, Math.floor(rect.height * dpr));
    };
    resize();

    let regl;
    try {
      regl = createREGL({
        canvas,
        extensions: ["ANGLE_instanced_arrays"],
        attributes: { antialias: true, alpha: true },
      });
    } catch (e) {
      setErr(e?.message || "WebGL init failed");
      return;
    }
    reglRef.current = regl;

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      try { regl.destroy(); } catch {}
      reglRef.current = null;
    };
  }, []);

  // Reset viewport on TF/symbol change
  useEffect(() => {
    const toMs = Date.now();
    const fromMs = toMs - defaultWindowMs(tf);
    setViewport({ fromMs, toMs });
  }, [tf, symbol]);

  // Fetch metrics (try /chart/series then fallback /chart/bars)
  useEffect(() => {
    if (!symbol || !tf || !apiBase) return;

    const canvas = canvasRef.current;
    const px = canvas ? Math.max(150, Math.floor(canvas.getBoundingClientRect().width)) : 1200;

    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (rafFetchRef.current) cancelAnimationFrame(rafFetchRef.current);
    rafFetchRef.current = requestAnimationFrame(async () => {
      try {
        setErr("");

        const qs = new URLSearchParams({
          symbol,
          tf,
          from_ms: String(Math.floor(viewport.fromMs)),
          to_ms: String(Math.floor(viewport.toMs)),
          limit: String(limit),
          px: String(px),
        });

        let j;
        try {
          j = await fetchJson(`${apiBase}/chart/series?${qs.toString()}`, { signal: ctrl.signal });
          // payload esperado:
          // { ok:true, t:[...], flow:[...], trend:[...], lastKey, source, stale }
          if (!Array.isArray(j.t) || !Array.isArray(j.flow) || !Array.isArray(j.trend)) {
            throw new Error("Bad /chart/series payload: expected arrays t, flow, trend");
          }
        } catch (e) {
          if (e?.http !== 404) throw e;
          const jb = await fetchJson(`${apiBase}/chart/bars?${qs.toString()}`, { signal: ctrl.signal });
          j = barsToMetrics(jb);
        }

        const t = [];
        const flow = [];
        const trend = [];

        const n = Math.min(j.t.length, j.flow.length, j.trend.length);
        for (let i = 0; i < n; i++) {
          const ti = j.t[i];
          if (!isRegularNY(ti)) continue;
          t.push(ti);
          flow.push(j.flow[i]);
          trend.push(j.trend[i]);
        }

        if (t.length < 2) {
          // si el filtro dejó vacío, muestra error claro
          setErr("No regular-session NY data in range (9:30–16:00). Try expanding view.");
        }

        const lastKey = Number(j.lastKey || (t.length ? t[t.length - 1] : Date.now()));
        const span = Math.max(60_000, viewport.toMs - viewport.fromMs);
        setViewport({ fromMs: lastKey - span, toMs: lastKey });

        setMeta(j);
        setData({
          t: new Float64Array(t),
          flow: new Float32Array(flow),
          trend: new Float32Array(trend),
        });
      } catch (e) {
        if (String(e?.name) === "AbortError") return;
        setErr(e?.message || "Fetch error");
      }
    });

    return () => {
      if (rafFetchRef.current) cancelAnimationFrame(rafFetchRef.current);
      try { ctrl.abort(); } catch {}
    };
  }, [apiBase, symbol, tf, viewport.fromMs, viewport.toMs, limit]);

  // Axis ticks
  const yRange = useMemo(() => {
    if (!data) return { y0: -1, y1: 1 };
    return computeVisibleY(
      data.t,
      showFlow ? data.flow : null,
      showTrend ? data.trend : null,
      viewport.fromMs,
      viewport.toMs
    );
  }, [data, showFlow, showTrend, viewport.fromMs, viewport.toMs]);

  const yTickVals = useMemo(() => yTicks(yRange.y0, yRange.y1, 6), [yRange.y0, yRange.y1]);
  const xTickVals = useMemo(() => timeTicks(viewport.fromMs, viewport.toMs, 6), [viewport.fromMs, viewport.toMs]);

  // Draw (grid + 2 lines)
  useEffect(() => {
    const regl = reglRef.current;
    const canvas = canvasRef.current;
    if (!regl || !canvas || !data) return;

    const { y0, y1 } = yRange;
    const t = data.t;

    const spanT = Math.max(1, viewport.toMs - viewport.fromMs);
    const spanY = Math.max(1e-9, y1 - y0);

    function buildVerts(values) {
      const verts = [];
      for (let i = 0; i < t.length; i++) {
        const ti = t[i];
        if (ti < viewport.fromMs || ti > viewport.toMs) continue;
        const v = values[i];
        if (!Number.isFinite(v)) continue;
        const xi = ((ti - viewport.fromMs) / spanT) * 2 - 1;
        const yi = ((v - y0) / spanY) * 2 - 1;
        verts.push(xi, yi);
      }
      return verts;
    }

    const flowVerts = showFlow ? buildVerts(data.flow) : [];
    const trendVerts = showTrend ? buildVerts(data.trend) : [];

    const flowBuf = regl.buffer(new Float32Array(flowVerts));
    const trendBuf = regl.buffer(new Float32Array(trendVerts));

    // grid
    const gridVerts = [];
    for (const py of yTickVals) {
      const yN = ((py - y0) / spanY) * 2 - 1;
      gridVerts.push(-1, yN, 1, yN);
    }
    for (const tx of xTickVals) {
      const xN = ((tx - viewport.fromMs) / spanT) * 2 - 1;
      gridVerts.push(xN, -1, xN, 1);
    }
    const gridBuf = regl.buffer(new Float32Array(gridVerts));

    const drawGrid = regl({
      vert: `precision highp float; attribute vec2 position; void main(){ gl_Position=vec4(position,0.0,1.0); }`,
      frag: `precision highp float; void main(){ gl_FragColor=vec4(0.35,0.42,0.60,0.20); }`,
      attributes: { position: { buffer: gridBuf, stride: 8, offset: 0 } },
      primitive: "lines",
      count: gridVerts.length / 2,
    });

    const makeLine = (buf, rgba) =>
      regl({
        vert: `precision highp float; attribute vec2 position; void main(){ gl_Position=vec4(position,0.0,1.0); }`,
        frag: `precision highp float; void main(){ gl_FragColor=vec4(${rgba}); }`,
        attributes: { position: { buffer: buf, stride: 8, offset: 0 } },
        primitive: "line strip",
        count: (buf._buffer?.byteLength || 0) / 8,
      });

    const drawFlow = makeLine(flowBuf, "0.35,0.82,0.95,1.0");
    const drawTrend = makeLine(trendBuf, "0.98,0.70,0.30,1.0");

    const drawCross = regl({
      vert: `
        precision highp float;
        attribute vec2 position;
        uniform vec4 a;
        void main(){
          vec2 p = mix(a.xy, a.zw, position.x);
          gl_Position = vec4(p, 0.0, 1.0);
        }
      `,
      frag: `precision highp float; void main(){ gl_FragColor=vec4(0.92,0.94,0.98,0.55); }`,
      attributes: { position: [-1, 0, 1, 0] },
      primitive: "lines",
      count: 2,
      uniforms: { a: regl.prop("a") },
    });

    const frame = regl.frame(() => {
      regl.clear({ color: [0.06, 0.09, 0.16, 1], depth: 1 });
      drawGrid();

      if (showFlow && flowVerts.length >= 4) drawFlow();
      if (showTrend && trendVerts.length >= 4) drawTrend();

      if (hover?.ndcX != null && hover?.ndcY != null) {
        drawCross({ a: [-1, hover.ndcY, 1, hover.ndcY] });
        drawCross({ a: [hover.ndcX, -1, hover.ndcX, 1] });
      }
    });

    let frameCanceled = false;
    return () => {
      if (!frameCanceled) {
        try {
          frame.cancel();
        } catch {}
        frameCanceled = true;
      }
      try { flowBuf.destroy(); trendBuf.destroy(); gridBuf.destroy(); } catch {}
    };
  }, [data, showFlow, showTrend, viewport.fromMs, viewport.toMs, yRange.y0, yRange.y1, xTickVals, yTickVals, hover]);

  // Interaction: zoom/pan/hover (igual que tu chart)
  const onWheel = (e) => {
    if (!data) return;
    e.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const span = Math.max(1, viewport.toMs - viewport.fromMs);
    const msPerPx = span / Math.max(1, rect.width);

    if (e.shiftKey) {
      const d = e.deltaY * msPerPx;
      setViewport({ fromMs: viewport.fromMs + d, toMs: viewport.toMs + d });
      return;
    }

    const anchorMs = viewport.fromMs + xPx * msPerPx;
    const k = Math.exp(e.deltaY * 0.0015);
    const newSpan = clamp(span * k, 60_000, 10 * 365 * 24 * 3600 * 1000);

    const leftRatio = (anchorMs - viewport.fromMs) / span;
    const newFrom = anchorMs - leftRatio * newSpan;
    setViewport({ fromMs: newFrom, toMs: newFrom + newSpan });
  };

  const onPointerDown = (e) => {
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX - rect.left,
      startFrom: viewport.fromMs,
      startTo: viewport.toMs,
      widthPx: rect.width,
    };
  };

  const onPointerMove = (e) => {
    if (!data) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    const spanT = Math.max(1, viewport.toMs - viewport.fromMs);
    const msPerPx = spanT / Math.max(1, rect.width);
    const tAtCursor = viewport.fromMs + xPx * msPerPx;

    // nearest point scan (ok)
    let bestI = -1, bestD = Infinity;
    for (let i = 0; i < data.t.length; i++) {
      const d = Math.abs(data.t[i] - tAtCursor);
      if (d < bestD) { bestD = d; bestI = i; }
    }

    if (bestI >= 0) {
      const tt = data.t[bestI];
      const fv = data.flow[bestI];
      const tv = data.trend[bestI];

      const yVal = Number.isFinite(fv) ? fv : (Number.isFinite(tv) ? tv : 0);
      const spanY = Math.max(1e-9, yRange.y1 - yRange.y0);

      const ndcX = ((tt - viewport.fromMs) / spanT) * 2 - 1;
      const ndcY = ((yVal - yRange.y0) / spanY) * 2 - 1;

      setHover({ xPx, yPx, t: tt, flow: fv, trend: tv, ndcX, ndcY });
    }

    // drag pan
    if (dragRef.current) {
      const dx = xPx - dragRef.current.startX;
      const deltaMs = dx * msPerPx;
      setViewport({
        fromMs: dragRef.current.startFrom - deltaMs,
        toMs: dragRef.current.startTo - deltaMs,
      });
    }
  };

  const onPointerUp = (e) => {
    dragRef.current = null;
    try { canvasRef.current?.releasePointerCapture?.(e.pointerId); } catch {}
  };

  const resetView = () => {
    const toMs = Date.now();
    const fromMs = toMs - defaultWindowMs(tf);
    setViewport({ fromMs, toMs });
  };

  const tip = useMemo(() => {
    if (!hover) return null;
    return {
      time: fmtTime(hover.t),
      flow: Number.isFinite(hover.flow) ? fmtPct(hover.flow) : "—",
      trend: Number.isFinite(hover.trend) ? fmtPct(hover.trend) : "—",
      xPx: hover.xPx,
      yPx: hover.yPx,
    };
  }, [hover]);

  const AXIS_LEFT_W = 72;
  const AXIS_BOTTOM_H = 26;

  return (
    <div style={{ width: "100%", height, position: "relative", borderRadius: 14, overflow: "hidden" }}>
      {/* TOP ENGINE CONTROLS */}
      <div style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 8,
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "8px 10px",
        background: "rgba(0,0,0,.45)",
        color: "#fff",
        borderRadius: 12,
        fontSize: 12,
      }}>
        <div style={{ fontWeight: 700 }}>{symbol} · {tf}</div>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showFlow} onChange={(e) => setShowFlow(e.target.checked)} />
          <span>Flow</span>
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} />
          <span>Trend</span>
        </label>

        <button
          type="button"
          onClick={resetView}
          style={{
            marginLeft: 6,
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.25)",
            background: "rgba(0,0,0,.25)",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Reset view
        </button>
      </div>

      {/* HUD right */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 7, padding: "6px 10px", background: "rgba(0,0,0,.45)", color: "#fff", borderRadius: 10, fontSize: 12 }}>
        {meta?.source || "—"} {meta?.stale ? "· STALE" : ""} {meta?.note ? `· ${meta.note}` : ""}
      </div>

      {err && (
        <div style={{ position: "absolute", top: 54, left: 10, zIndex: 9, padding: 10, background: "rgba(0,0,0,.70)", color: "#fff", borderRadius: 10 }}>
          {err}
        </div>
      )}

      {/* LEFT Y AXIS */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: AXIS_BOTTOM_H, width: AXIS_LEFT_W, zIndex: 5, pointerEvents: "none" }}>
        {yTickVals.map((v, i) => {
          const u = i / (yTickVals.length - 1);
          return (
            <div key={i} style={{
              position: "absolute",
              left: 0,
              top: `${u * 100}%`,
              transform: "translateY(-50%)",
              width: "100%",
              textAlign: "right",
              paddingRight: 8,
              color: "rgba(230,240,255,.85)",
              fontSize: 11,
            }}>
              {fmtPct(v)}
            </div>
          );
        })}
      </div>

      {/* BOTTOM X AXIS */}
      <div style={{ position: "absolute", left: AXIS_LEFT_W, right: 0, bottom: 0, height: AXIS_BOTTOM_H, zIndex: 5, pointerEvents: "none" }}>
        {xTickVals.map((ms, i) => {
          const u = i / (xTickVals.length - 1);
          return (
            <div key={i} style={{
              position: "absolute",
              left: `${u * 100}%`,
              bottom: 4,
              transform: "translateX(-50%)",
              color: "rgba(230,240,255,.75)",
              fontSize: 11,
              whiteSpace: "nowrap",
            }}>
              {fmtTime(ms)}
            </div>
          );
        })}
      </div>

      {/* TOOLTIP */}
      {tip && (
        <div style={{
          position: "absolute",
          left: clamp(AXIS_LEFT_W + tip.xPx + 12, AXIS_LEFT_W + 10, AXIS_LEFT_W + 520),
          top: clamp(tip.yPx + 12, 10, height - 110),
          zIndex: 10,
          padding: "10px 12px",
          background: "rgba(0,0,0,.65)",
          color: "#fff",
          borderRadius: 12,
          fontSize: 12,
          pointerEvents: "none",
          minWidth: 210,
        }}>
          <div style={{ opacity: 0.9, marginBottom: 6 }}>{tip.time}</div>
          <div>Flow: {tip.flow}</div>
          <div>Trend: {tip.trend}</div>
          <div style={{ opacity: 0.65, marginTop: 6 }}>Wheel: zoom · Shift+Wheel: scroll · Drag: pan</div>
        </div>
      )}

      {/* CANVAS */}
      <div style={{ position: "absolute", left: AXIS_LEFT_W, right: 0, top: 0, bottom: AXIS_BOTTOM_H }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => { dragRef.current = null; setHover(null); }}
        />
      </div>
    </div>
  );
}
