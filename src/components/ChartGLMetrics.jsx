import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import createREGL from "regl";

const NY_TZ = "America/New_York";

const CONFIG = {
  AXIS_LEFT_W: 72,
  AXIS_BOTTOM_H: 28,
  DEFAULT_HEIGHT: 520,
  MAX_ZOOM_X: 20 * 365 * 24 * 3600 * 1000,
  MIN_ZOOM_X: 60_000,
  ZOOM_SPEED: 0.0015,
  HOVER_SEARCH_RADIUS: 40,
  Y_ZOOM_MIN: 0.2,
  Y_ZOOM_MAX: 12,
  COLORS: {
    flow: [0.35, 0.82, 0.95, 1.0],
    mom: [0.95, 0.78, 0.35, 1.0],
    grid: [0.35, 0.42, 0.60, 0.20],
    crosshair: [0.92, 0.94, 0.98, 0.55],
    background: [0.06, 0.09, 0.16, 1],
  },
};

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function isFiniteNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtTimeNY(ms) {
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

function fmtAxisTimeNY(ms, tf) {
  const d = new Date(ms);
  const options =
    tf === "1D" || tf === "1W" || tf === "1M" || tf === "1Y"
      ? {
          timeZone: NY_TZ,
          month: "2-digit",
          day: "2-digit",
          year: "2-digit",
        }
      : {
          timeZone: NY_TZ,
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        };
  return d.toLocaleString("en-US", options);
}

function fmtValue(v) {
  if (!isFiniteNum(v)) return "—";
  return v.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function timeTicksFromPoints(tArr, fromMs, toMs, count = 6) {
  const visible = [];
  for (let i = 0; i < tArr.length; i++) {
    const t = tArr[i];
    if (t >= fromMs && t <= toMs) visible.push(t);
  }

  if (!visible.length) return [];
  if (visible.length <= count) return visible;

  const out = [];
  const lastIdx = visible.length - 1;
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / (count - 1)) * lastIdx);
    const t = visible[idx];
    if (out[out.length - 1] !== t) out.push(t);
  }

  if (out[0] !== visible[0]) out[0] = visible[0];
  if (out[out.length - 1] !== visible[lastIdx]) out[out.length - 1] = visible[lastIdx];
  return out;
}

function yTicks(y0, y1, count = 6) {
  const out = [];
  const span = Math.max(1e-9, y1 - y0);
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    out.push(y0 + (1 - u) * span);
  }
  return out;
}

function computeVisibleY(tArr, seriesList, fromMs, toMs) {
  let mn = Infinity;
  let mx = -Infinity;

  for (let i = 0; i < tArr.length; i++) {
    const ti = tArr[i];
    if (ti < fromMs || ti > toMs) continue;

    for (const s of seriesList) {
      const v = s.values[i];
      if (!isFiniteNum(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }

  if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
    mn = 0;
    mx = 1;
  }
  if (mn === mx) {
    mn -= 1;
    mx += 1;
  }

  const pad = (mx - mn) * 0.08 || 1;
  return { y0: mn - pad, y1: mx + pad };
}

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
  return m[tf] ?? 14 * 24 * 60 * 60 * 1000;
}

async function fetchFlowTrend({ apiBase, symbol, tf, barsNeeded, signal }) {
  const qs = new URLSearchParams({
    symbol,
    tf,
    bars_needed: String(barsNeeded),
  });

  const url = `${apiBase}/chart/flow-trend?${qs.toString()}`;
  const r = await fetch(url, { signal });
  const text = await r.text();

  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON (${r.status}) ${url}: ${text.slice(0, 220)}`);
  }

  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  if (!Array.isArray(j.points) || j.points.length === 0) throw new Error("No data: empty points[]");

  return j;
}

function useViewport({ symbol, tf }) {
  const [viewport, setViewportState] = useState(() => {
    const toMs = Date.now();
    const fromMs = toMs - defaultWindowMs(tf);
    return { fromMs, toMs };
  });

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const setViewport = useCallback((nextOrUpdater) => {
    setViewportState((prev) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      if (!next || (next.fromMs === prev.fromMs && next.toMs === prev.toMs)) return prev;

      setHistory((old) => {
        const cut = old.slice(0, historyIndexRef.current + 1);
        const pushed = [...cut, next].slice(-50);
        const nextIdx = pushed.length - 1;
        historyIndexRef.current = nextIdx;
        setHistoryIndex(nextIdx);
        return pushed;
      });

      return next;
    });
  }, []);

  const hardResetViewport = useCallback(() => {
    const toMs = Date.now();
    const fromMs = toMs - defaultWindowMs(tf);
    const next = { fromMs, toMs };
    setViewportState(next);
    setHistory([next]);
    setHistoryIndex(0);
    historyIndexRef.current = 0;
  }, [tf]);

  useEffect(() => {
    const toMs = Date.now();
    const fromMs = toMs - defaultWindowMs(tf);
    const next = { fromMs, toMs };
    setViewportState(next);
    setHistory([next]);
    setHistoryIndex(0);
    historyIndexRef.current = 0;
  }, [symbol, tf]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const nextIdx = historyIndexRef.current - 1;
    historyIndexRef.current = nextIdx;
    setHistoryIndex(nextIdx);
    setViewportState(history[nextIdx]);
  }, [history]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= history.length - 1) return;
    const nextIdx = historyIndexRef.current + 1;
    historyIndexRef.current = nextIdx;
    setHistoryIndex(nextIdx);
    setViewportState(history[nextIdx]);
  }, [history]);

  return {
    viewport,
    setViewport,
    resetViewport: hardResetViewport,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex >= 0 && historyIndex < history.length - 1,
  };
}

function useKeyboardShortcuts({ onReset, onUndo, onRedo, canUndo, canRedo }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) onRedo();
        } else {
          if (canUndo) onUndo();
        }
        return;
      }

      if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        onReset();
        return;
      }

      if (e.key === "Escape") {
        onReset();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onReset, onUndo, onRedo, canUndo, canRedo]);
}

export default function ChartGLMetrics({
  apiBase,
  symbol,
  tf,
  height = CONFIG.DEFAULT_HEIGHT,
  barsNeeded = 400,
  autoRefreshMs = 10_000,
  defaultShowFlow = true,
  defaultShowMom = true,
  onError = null,
  onDataLoad = null,
}) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const reglRef = useRef(null);

  const [err, setErr] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [meta, setMeta] = useState(null);

  const [showFlow, setShowFlow] = useState(defaultShowFlow);
  const [showMom, setShowMom] = useState(defaultShowMom);

  const [data, setData] = useState(null);
  const [yZoom, setYZoom] = useState(1);
  const [yPanOffset, setYPanOffset] = useState(0);

  const anchoredRef = useRef({ key: null, did: false });
  const dragRef = useRef(null);
  const abortRef = useRef(null);
  const rafFetchRef = useRef(0);

  const [hover, setHover] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [liveFollow, setLiveFollow] = useState(true);

  const { viewport, setViewport, resetViewport, undo, redo, canUndo, canRedo } = useViewport({ symbol, tf });

  useEffect(() => {
    if (err && onError) onError(err);
  }, [err, onError]);

  useEffect(() => {
    if (data && meta && onDataLoad) onDataLoad({ data, meta, symbol, tf });
  }, [data, meta, symbol, tf, onDataLoad]);

  useEffect(() => {
    if (!Number.isFinite(autoRefreshMs) || autoRefreshMs <= 0) return;
    const id = setInterval(() => setRefreshTick((x) => x + 1), autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs]);

  useKeyboardShortcuts({
    onReset: () => {
      resetViewport();
      setYZoom(1);
      setYPanOffset(0);
      setLiveFollow(true);
      setHover(null);
    },
    onUndo: undo,
    onRedo: redo,
    canUndo,
    canRedo,
  });

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
      regl = createREGL({ canvas, attributes: { antialias: true, alpha: true } });
    } catch (e) {
      setErr(e?.message || "WebGL init failed");
      return;
    }
    reglRef.current = regl;

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      try {
        regl.destroy();
      } catch {}
      reglRef.current = null;
    };
  }, []);

  useEffect(() => {
    setYZoom(1);
    setYPanOffset(0);
    anchoredRef.current = { key: `${symbol}|${tf}`, did: false };
    setLiveFollow(true);
  }, [symbol, tf]);

  const calibrateCenter = useCallback(() => {
    if (!data?.t?.length) return;
    const lastKey = Number(data.lastKey ?? data.t[data.t.length - 1]);
    if (!Number.isFinite(lastKey)) return;

    const span = Math.max(1, viewport.toMs - viewport.fromMs);
    const half = span / 2;

    setViewport({ fromMs: lastKey - half, toMs: lastKey + half });
    setLiveFollow(true);
    setHover(null);
  }, [data, viewport.fromMs, viewport.toMs, setViewport]);

  const resetViewAll = useCallback(() => {
    resetViewport();
    setYZoom(1);
    setYPanOffset(0);
    setLiveFollow(true);
    setHover(null);
  }, [resetViewport]);

  useEffect(() => {
    if (!apiBase || !symbol || !tf) return;

    setIsLoading(true);
    setErr("");

    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (rafFetchRef.current) cancelAnimationFrame(rafFetchRef.current);

    rafFetchRef.current = requestAnimationFrame(async () => {
      try {
        const j = await fetchFlowTrend({
          apiBase,
          symbol,
          tf,
          barsNeeded,
          signal: ctrl.signal,
        });

        const pts = j.points;
        const t = new Float64Array(pts.length);
        const flow = new Float32Array(pts.length);
        const trend = new Float32Array(pts.length);

        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const time = Number(p.t ?? p.time);
          const flowValue = Number(p.flow);
          const trendValue = Number(p.trend);

          t[i] = Number.isFinite(time) ? time : 0;
          flow[i] = Number.isFinite(flowValue) ? flowValue : Number.NaN;
          trend[i] = Number.isFinite(trendValue) ? trendValue : Number.NaN;
        }

        const lastKeyValue = Number(j.lastKey);
        const lastKey = Number.isFinite(lastKeyValue) ? lastKeyValue : t[t.length - 1];

        setMeta(j);
        setData({ t, flow, trend, lastKey });

        if (Number.isFinite(lastKey)) {
          const myKey = `${symbol}|${tf}`;
          if (anchoredRef.current.key !== myKey) {
            anchoredRef.current = { key: myKey, did: false };
          }

          if (!anchoredRef.current.did) {
            const span = defaultWindowMs(tf);
            setViewport((vp) => {
              if (vp.toMs > lastKey + 60_000) {
                anchoredRef.current.did = true;
                return { fromMs: lastKey - span, toMs: lastKey };
              }
              anchoredRef.current.did = true;
              return vp;
            });
          } else if (liveFollow) {
            setViewport((vp) => {
              const span = Math.max(1, vp.toMs - vp.fromMs);
              return { fromMs: lastKey - span, toMs: lastKey };
            });
          }
        }
      } catch (e) {
        if (String(e?.name) === "AbortError") return;
        setErr(e?.message || "Fetch error");
      } finally {
        setIsLoading(false);
      }
    });

    return () => {
      if (rafFetchRef.current) cancelAnimationFrame(rafFetchRef.current);
      try {
        ctrl.abort();
      } catch {}
    };
  }, [apiBase, symbol, tf, barsNeeded, refreshTick, setViewport, liveFollow]);

  const seriesList = useMemo(() => {
    if (!data) return [];
    const out = [];
    if (showFlow) out.push({ name: "Flow", values: data.flow, kind: "flow" });
    if (showMom) out.push({ name: "Trend", values: data.trend, kind: "mom" });
    return out;
  }, [data, showFlow, showMom]);

  const yRangeRaw = useMemo(() => {
    if (!data || !seriesList.length) return { y0: 0, y1: 1 };
    return computeVisibleY(data.t, seriesList, viewport.fromMs, viewport.toMs);
  }, [data, seriesList, viewport.fromMs, viewport.toMs]);

  const yRange = useMemo(() => {
    const c = (yRangeRaw.y0 + yRangeRaw.y1) * 0.5;
    const half = Math.max(1e-9, (yRangeRaw.y1 - yRangeRaw.y0) * 0.5 * yZoom);
    return { y0: c - half + yPanOffset, y1: c + half + yPanOffset };
  }, [yRangeRaw.y0, yRangeRaw.y1, yZoom, yPanOffset]);

  const xTickMs = useMemo(() => {
    if (!data?.t) return [];
    return timeTicksFromPoints(data.t, viewport.fromMs, viewport.toMs, 6);
  }, [data, viewport.fromMs, viewport.toMs]);
  const yTickVals = useMemo(() => yTicks(yRange.y0, yRange.y1, 6), [yRange.y0, yRange.y1]);

  const zoomLevel = useMemo(() => {
    const currentSpan = viewport.toMs - viewport.fromMs;
    const defaultSpan = defaultWindowMs(tf);
    return Math.round((defaultSpan / currentSpan) * 100);
  }, [viewport.fromMs, viewport.toMs, tf]);

  useEffect(() => {
    const regl = reglRef.current;
    const canvas = canvasRef.current;
    if (!regl || !canvas || !data) return;

    const tArr = data.t;
    const spanT = Math.max(1, viewport.toMs - viewport.fromMs);
    const spanY = Math.max(1e-9, yRange.y1 - yRange.y0);

    const gridVerts = [];
    for (const y of yTickVals) {
      const yN = ((y - yRange.y0) / spanY) * 2 - 1;
      gridVerts.push(-1, yN, 1, yN);
    }
    for (const x of xTickMs) {
      const xN = ((x - viewport.fromMs) / spanT) * 2 - 1;
      gridVerts.push(xN, -1, xN, 1);
    }
    const gbuf = regl.buffer(new Float32Array(gridVerts));

    const drawGrid = regl({
      vert: "precision highp float; attribute vec2 position; void main(){ gl_Position=vec4(position,0.0,1.0); }",
      frag: `precision highp float; void main(){ gl_FragColor=vec4(${CONFIG.COLORS.grid.join(",")}); }`,
      attributes: { position: { buffer: gbuf, stride: 8, offset: 0 } },
      primitive: "lines",
      count: gridVerts.length / 2,
    });

    const seriesBuffers = [];
    for (const s of seriesList) {
      const verts = [];
      for (let i = 0; i < tArr.length; i++) {
        const ti = tArr[i];
        if (ti < viewport.fromMs || ti > viewport.toMs) continue;

        const v = s.values[i];
        if (!isFiniteNum(v)) continue;

        const xN = ((ti - viewport.fromMs) / spanT) * 2 - 1;
        const yN = ((v - yRange.y0) / spanY) * 2 - 1;
        verts.push(xN, yN);
      }
      seriesBuffers.push({
        kind: s.kind,
        count: verts.length / 2,
        buf: regl.buffer(new Float32Array(verts)),
      });
    }

    const drawLine = (color) =>
      regl({
        vert: "precision highp float; attribute vec2 position; void main(){ gl_Position=vec4(position,0.0,1.0); }",
        frag: "precision highp float; uniform vec4 uColor; void main(){ gl_FragColor=uColor; }",
        attributes: { position: regl.prop("position") },
        uniforms: { uColor: color },
        primitive: "line strip",
        count: regl.prop("count"),
      });

    const lineFlow = drawLine(CONFIG.COLORS.flow);
    const lineMom = drawLine(CONFIG.COLORS.mom);

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
      frag: `precision highp float; void main(){ gl_FragColor=vec4(${CONFIG.COLORS.crosshair.join(",")}); }`,
      attributes: { position: [-1, 0, 1, 0] },
      primitive: "lines",
      count: 2,
      uniforms: { a: regl.prop("a") },
    });

    const drawPoint = regl({
      vert: `
        precision highp float;
        attribute vec2 position;
        uniform float uPointSize;
        void main(){
          gl_Position = vec4(position, 0.0, 1.0);
          gl_PointSize = uPointSize;
        }
      `,
      frag: `
        precision highp float;
        void main(){
          vec2 c = gl_PointCoord - vec2(0.5);
          if (dot(c, c) > 0.25) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, 0.95);
        }
      `,
      attributes: { position: regl.prop("position") },
      uniforms: { uPointSize: regl.prop("pointSize") },
      primitive: "points",
      count: 1,
    });

    const frame = regl.frame(() => {
      regl.clear({ color: CONFIG.COLORS.background, depth: 1 });
      drawGrid();

      for (const sb of seriesBuffers) {
        if (sb.count < 2) continue;
        const props = { position: { buffer: sb.buf, stride: 8, offset: 0 }, count: sb.count };
        if (sb.kind === "flow") lineFlow(props);
        if (sb.kind === "mom") lineMom(props);
      }

      if (hover?.mouseNdcX != null) drawCross({ a: [hover.mouseNdcX, -1, hover.mouseNdcX, 1] });
      if (hover?.mouseNdcY != null) drawCross({ a: [-1, hover.mouseNdcY, 1, hover.mouseNdcY] });
      if (hover?.pointNdcX != null && hover?.pointNdcY != null) {
        drawPoint({ position: [hover.pointNdcX, hover.pointNdcY], pointSize: 8 });
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
      try {
        gbuf.destroy();
        for (const sb of seriesBuffers) sb.buf.destroy();
      } catch {}
    };
  }, [data, seriesList, viewport.fromMs, viewport.toMs, yRange.y0, yRange.y1, xTickMs, yTickVals, hover]);

  const onWheel = useCallback(
    (e) => {
      if (!data) return;
      e.preventDefault();
      setLiveFollow(false);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const xPx = e.clientX - rect.left;

      const span = Math.max(1, viewport.toMs - viewport.fromMs);
      const msPerPx = span / Math.max(1, rect.width);

      if (e.shiftKey) {
        const deltaMs = e.deltaY * msPerPx;
        setViewport((vp) => ({ fromMs: vp.fromMs + deltaMs, toMs: vp.toMs + deltaMs }));
        return;
      }

      const anchorMs = viewport.fromMs + xPx * msPerPx;
      const k = Math.exp(e.deltaY * CONFIG.ZOOM_SPEED);
      const newSpan = clamp(span * k, CONFIG.MIN_ZOOM_X, CONFIG.MAX_ZOOM_X);

      const leftRatio = (anchorMs - viewport.fromMs) / span;
      const newFrom = anchorMs - leftRatio * newSpan;
      const newTo = newFrom + newSpan;

      setViewport({ fromMs: newFrom, toMs: newTo });
    },
    [data, viewport.fromMs, viewport.toMs, setViewport]
  );

  const onPointerDown = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.preventDefault();
      setLiveFollow(false);
      canvas.setPointerCapture?.(e.pointerId);

      const rect = canvas.getBoundingClientRect();
      dragRef.current = {
        mode: "pan",
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        startFrom: viewport.fromMs,
        startTo: viewport.toMs,
        startYPanOffset: yPanOffset,
        startY0: yRange.y0,
        startY1: yRange.y1,
      };
    },
    [viewport.fromMs, viewport.toMs, yPanOffset, yRange.y0, yRange.y1]
  );

  const onYAxisPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      setLiveFollow(false);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragRef.current = {
        mode: "yscale",
        startClientY: e.clientY,
        startYZoom: yZoom,
      };
    },
    [yZoom]
  );

  const onXAxisPointerDown = useCallback(
    (e) => {
      const root = rootRef.current;
      if (!root) return;
      e.preventDefault();
      setLiveFollow(false);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const rect = root.getBoundingClientRect();
      const plotW = Math.max(1, rect.width - CONFIG.AXIS_LEFT_W);
      const xPx = clamp(e.clientX - rect.left - CONFIG.AXIS_LEFT_W, 0, plotW);
      dragRef.current = {
        mode: "xscale",
        startClientX: e.clientX,
        startSpan: Math.max(1, viewport.toMs - viewport.fromMs),
        leftRatio: xPx / plotW,
        anchorMs: viewport.fromMs + (xPx / plotW) * Math.max(1, viewport.toMs - viewport.fromMs),
      };
    },
    [viewport.fromMs, viewport.toMs]
  );

  const onPointerMove = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas || !data) return;

      const rect = canvas.getBoundingClientRect();
      const xPx = clamp(e.clientX - rect.left, 0, rect.width);
      const yPx = clamp(e.clientY - rect.top, 0, rect.height);

      const spanT = Math.max(1, viewport.toMs - viewport.fromMs);
      const msPerPx = spanT / Math.max(1, rect.width);

      if (dragRef.current?.mode === "yscale") {
        const dy = e.clientY - dragRef.current.startClientY;
        const k = Math.exp(dy * 0.01);
        setYZoom(clamp(dragRef.current.startYZoom * k, CONFIG.Y_ZOOM_MIN, CONFIG.Y_ZOOM_MAX));
        return;
      }

      if (dragRef.current?.mode === "xscale") {
        const dx = e.clientX - dragRef.current.startClientX;
        const k = Math.exp(-dx * 0.01);
        const newSpan = clamp(dragRef.current.startSpan * k, CONFIG.MIN_ZOOM_X, CONFIG.MAX_ZOOM_X);
        const newFrom = dragRef.current.anchorMs - dragRef.current.leftRatio * newSpan;
        setViewport({ fromMs: newFrom, toMs: newFrom + newSpan });
        return;
      }

      if (dragRef.current?.mode === "pan") {
        const dx = xPx - dragRef.current.startX;
        const dy = yPx - dragRef.current.startY;
        const deltaMs = dx * msPerPx;
        const spanYData = Math.max(1e-9, dragRef.current.startY1 - dragRef.current.startY0);
        const deltaYValue = dy * (spanYData / Math.max(1, rect.height));
        setViewport({
          fromMs: dragRef.current.startFrom - deltaMs,
          toMs: dragRef.current.startTo - deltaMs,
        });
        setYPanOffset(dragRef.current.startYPanOffset + deltaYValue);
        return;
      }

      const tAtCursor = viewport.fromMs + xPx * msPerPx;
      const tArr = data.t;
      const n = tArr.length;

      const u = (tAtCursor - viewport.fromMs) / Math.max(1, viewport.toMs - viewport.fromMs);
      const i0 = Math.round(clamp(u, 0, 1) * (n - 1));
      let bestI = i0;
      let bestD = Math.abs(tArr[i0] - tAtCursor);

      const a = Math.max(0, i0 - CONFIG.HOVER_SEARCH_RADIUS);
      const b = Math.min(n - 1, i0 + CONFIG.HOVER_SEARCH_RADIUS);
      for (let i = a; i <= b; i++) {
        const d = Math.abs(tArr[i] - tAtCursor);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }

      const tt = tArr[bestI];
      const flowV = data.flow ? data.flow[bestI] : null;
      const trendV = data.trend ? data.trend[bestI] : null;

      const preferredSeries =
        showFlow && data.flow
          ? data.flow
          : showMom && data.trend
            ? data.trend
            : data.flow || data.trend;

      const interpolateSeriesAtTime = (values, tMs) => {
        if (!values || n < 1) return null;
        if (n === 1) return isFiniteNum(values[0]) ? values[0] : null;

        let left = 0;
        let right = n - 1;

        while (left <= right) {
          const mid = (left + right) >> 1;
          const tm = tArr[mid];
          if (tm < tMs) left = mid + 1;
          else right = mid - 1;
        }

        const i1 = clamp(left, 0, n - 1);
        const i0b = clamp(i1 - 1, 0, n - 1);
        const t0 = tArr[i0b];
        const t1 = tArr[i1];
        const v0 = values[i0b];
        const v1 = values[i1];

        if (isFiniteNum(v0) && isFiniteNum(v1) && t1 !== t0) {
          const uT = (tMs - t0) / (t1 - t0);
          return v0 + (v1 - v0) * clamp(uT, 0, 1);
        }

        if (isFiniteNum(v0)) return v0;
        if (isFiniteNum(v1)) return v1;
        return null;
      };

      const lineY = interpolateSeriesAtTime(preferredSeries, tAtCursor);
      const mouseNdcX = (xPx / Math.max(1, rect.width)) * 2 - 1;
      const mouseNdcY = 1 - (yPx / Math.max(1, rect.height)) * 2;
      const pointNdcX = mouseNdcX;
      const spanY = Math.max(1e-9, yRange.y1 - yRange.y0);
      const pointNdcY = lineY == null ? mouseNdcY : ((lineY - yRange.y0) / spanY) * 2 - 1;

      setHover({
        xPx,
        yPx,
        t: tt,
        flow: flowV,
        trend: trendV,
        mouseNdcX,
        mouseNdcY,
        pointNdcX,
        pointNdcY,
      });
    },
    [data, viewport.fromMs, viewport.toMs, yRange.y0, yRange.y1, showFlow, showMom, setViewport]
  );

  const onPointerUp = useCallback((e) => {
    dragRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {}
  }, []);

  const tip = useMemo(() => {
    if (!hover) return null;
    return {
      time: fmtTimeNY(hover.t),
      flow: isFiniteNum(hover.flow) ? fmtValue(hover.flow) : "—",
      trend: isFiniteNum(hover.trend) ? fmtValue(hover.trend) : "—",
      xPx: hover.xPx,
      yPx: hover.yPx,
    };
  }, [hover]);

  const hasFlow = !!data?.flow;
  const hasMom = !!data?.trend;

  return (
    <div
      ref={rootRef}
      style={{
        width: "100%",
        height,
        position: "relative",
        borderRadius: 14,
        overflow: "hidden",
        userSelect: "none",
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="application"
      aria-label={`Chart for ${symbol} ${tf}`}
    >
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 8,
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "8px 12px",
          borderRadius: 12,
          background: "rgba(0,0,0,.5)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#fff",
          fontSize: 12,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showFlow} onChange={(e) => setShowFlow(e.target.checked)} disabled={!hasFlow} />
          <span style={{ opacity: hasFlow ? 1 : 0.4 }}>Flow</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showMom} onChange={(e) => setShowMom(e.target.checked)} disabled={!hasMom} />
          <span style={{ opacity: hasMom ? 1 : 0.4 }}>Trend</span>
        </label>
      </div>

      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 7,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div
          style={{
            padding: "6px 10px",
            background: "rgba(0,0,0,.5)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 11,
            display: "flex",
            gap: 4,
            alignItems: "center",
          }}
        >
          <span style={{ opacity: 0.7 }}>Zoom:</span>
          <span style={{ fontWeight: 600 }}>{zoomLevel}%</span>
        </div>

        <div
          style={{
            padding: "6px 10px",
            background: "rgba(0,0,0,.5)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {symbol} · {tf} · {meta?.source || "—"} {meta?.stale && <span style={{ color: "#f59e0b", marginLeft: 4 }}>STALE</span>}
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={calibrateCenter}
            disabled={!data?.t?.length}
            style={{
              padding: "6px 10px",
              background: "rgba(0,0,0,.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: data?.t?.length ? "#fff" : "rgba(255,255,255,0.3)",
              borderRadius: 8,
              fontSize: 11,
              cursor: data?.t?.length ? "pointer" : "not-allowed",
            }}
            title="Center and recalibrate"
          >
            Calibrar
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            style={{
              padding: "6px 10px",
              background: "rgba(0,0,0,.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: canUndo ? "#fff" : "rgba(255,255,255,0.3)",
              borderRadius: 8,
              fontSize: 11,
              cursor: canUndo ? "pointer" : "not-allowed",
            }}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            style={{
              padding: "6px 10px",
              background: "rgba(0,0,0,.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: canRedo ? "#fff" : "rgba(255,255,255,0.3)",
              borderRadius: 8,
              fontSize: 11,
              cursor: canRedo ? "pointer" : "not-allowed",
            }}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷
          </button>
          <button
            onClick={resetViewAll}
            style={{
              padding: "6px 10px",
              background: "rgba(0,0,0,.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              borderRadius: 8,
              fontSize: 11,
              cursor: "pointer",
            }}
            title="Reset (R or Esc)"
          >
            ↺
          </button>
          <button
            onClick={() => setLiveFollow((v) => !v)}
            style={{
              padding: "6px 10px",
              background: "rgba(0,0,0,.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: liveFollow ? "#34d399" : "#fff",
              borderRadius: 8,
              fontSize: 11,
              cursor: "pointer",
            }}
            title="Toggle live follow"
          >
            LIVE
          </button>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            style={{
              padding: "6px 10px",
              background: "rgba(0,0,0,.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              borderRadius: 8,
              fontSize: 14,
              cursor: "pointer",
            }}
            title="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </div>

      {err && (
        <div
          style={{
            position: "absolute",
            top: 52,
            left: 10,
            zIndex: 9,
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "10px 14px",
            background: "rgba(220, 38, 38, 0.9)",
            color: "#fff",
            borderRadius: 10,
            fontSize: 12,
            maxWidth: "calc(100% - 20px)",
          }}
        >
          <span>⚠ {err}</span>
          <button
            onClick={() => setRefreshTick((v) => v + 1)}
            style={{
              padding: "4px 10px",
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#fff",
              borderRadius: 6,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {isLoading && !data && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 9,
            padding: "16px 24px",
            background: "rgba(0,0,0,.7)",
            color: "#fff",
            borderRadius: 12,
            fontSize: 13,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              border: "2px solid rgba(255,255,255,0.3)",
              borderTop: "2px solid #fff",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <span>Loading data...</span>
        </div>
      )}

      {showShortcuts && (
        <div
          style={{
            position: "absolute",
            top: 60,
            right: 10,
            zIndex: 10,
            padding: "16px",
            background: "rgba(0,0,0,.85)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
            borderRadius: 12,
            fontSize: 12,
            minWidth: 220,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 600, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            Keyboard Shortcuts
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ opacity: 0.7 }}>Zoom</span><span style={{ fontFamily: "monospace" }}>Mouse Wheel</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ opacity: 0.7 }}>Pan</span><span style={{ fontFamily: "monospace" }}>Drag / Shift+Wheel</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ opacity: 0.7 }}>Undo</span><span style={{ fontFamily: "monospace" }}>Ctrl+Z</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ opacity: 0.7 }}>Redo</span><span style={{ fontFamily: "monospace" }}>Ctrl+Shift+Z</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ opacity: 0.7 }}>Reset</span><span style={{ fontFamily: "monospace" }}>R / Esc</span></div>
          </div>
        </div>
      )}

      <div
        onPointerDown={onYAxisPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: CONFIG.AXIS_BOTTOM_H,
          width: CONFIG.AXIS_LEFT_W,
          zIndex: 5,
          pointerEvents: "auto",
          userSelect: "none",
          cursor: "ns-resize",
        }}
      >
        {yTickVals.map((v, i) => {
          const u = i / (yTickVals.length - 1);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                top: `${u * 100}%`,
                transform: "translateY(-50%)",
                width: "100%",
                textAlign: "right",
                paddingRight: 8,
                color: "rgba(230,240,255,.85)",
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {fmtValue(v)}
            </div>
          );
        })}
      </div>

      <div
        onPointerDown={onXAxisPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute",
          left: CONFIG.AXIS_LEFT_W,
          right: 0,
          bottom: 0,
          height: CONFIG.AXIS_BOTTOM_H,
          zIndex: 5,
          pointerEvents: "auto",
          userSelect: "none",
          cursor: "ew-resize",
        }}
      >
        {xTickMs.map((ms, i) => {
          const span = Math.max(1, viewport.toMs - viewport.fromMs);
          const leftPct = ((ms - viewport.fromMs) / span) * 100;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                bottom: 4,
                transform: "translateX(-50%)",
                color: "rgba(230,240,255,.75)",
                fontSize: 11,
                whiteSpace: "nowrap",
                fontWeight: 500,
              }}
            >
              {fmtAxisTimeNY(ms, tf)}
            </div>
          );
        })}
      </div>

      {tip && (
        <div
          style={{
            position: "absolute",
            left: clamp(CONFIG.AXIS_LEFT_W + tip.xPx + 12, CONFIG.AXIS_LEFT_W + 10, CONFIG.AXIS_LEFT_W + 540),
            top: clamp(tip.yPx + 12, 12, height - 140),
            zIndex: 10,
            padding: "12px 14px",
            background: "rgba(0,0,0,.75)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            borderRadius: 12,
            fontSize: 12,
            pointerEvents: "none",
            minWidth: 200,
          }}
        >
          <div style={{ opacity: 0.9, marginBottom: 8, fontWeight: 500 }}>{tip.time}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>Flow:</span><span style={{ fontWeight: 600 }}>{tip.flow}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>Trend:</span><span style={{ fontWeight: 600 }}>{tip.trend}</span></div>
        </div>
      )}

      <div style={{ position: "absolute", left: CONFIG.AXIS_LEFT_W, right: 0, top: 0, bottom: CONFIG.AXIS_BOTTOM_H }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            dragRef.current = null;
            setHover(null);
          }}
        />

        {!showFlow && !showMom && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "rgba(230,240,255,.7)",
              fontSize: 13,
              background: "rgba(0,0,0,0.3)",
            }}
          >
            Enable Flow or Trend to view chart
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
