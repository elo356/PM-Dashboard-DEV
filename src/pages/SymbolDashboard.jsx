import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import "./SymbolDashboard.css";
import ChartGLMetrics from "../components/ChartGLMetrics";
import LegalModal from "../components/LegalModal";
import { adaptMarketRow } from "../utils/marketRowAdapters";
const TF_OPTIONS = ["1m", "5m", "15m", "30m", "1h", "4h", "6h", "12h", "1D", "1W", "1M", "1Y"];

/* ===== helpers ===== */
function toNum(x) {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;

  const s = String(x).trim();
  if (!s || s === "-" || s === "—") return null;

  const cleaned = s
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pctAutoNum(x) {
  const n = toNum(x);
  if (n == null) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n;
}

function fmtPctAuto(x, dp = 2) {
  const v = pctAutoNum(x);
  if (v == null) return "-";
  return `${v.toFixed(dp)}%`;
}

function signalLabel(raw) {
  const s = String(raw ?? "").toUpperCase();
  if (s === "BUY") return "BULLISH";
  if (s === "SELL" || s === "ROTATE") return "BEARISH";
  if (s === "HOLD") return "NEUTRAL";
  return s || "NEUTRAL";
}
function signalClass(raw) {
  const s = signalLabel(raw);
  if (s === "BULLISH") return "sigBull";
  if (s === "BEARISH") return "sigBear";
  return "sigNeut";
}
function signClass(n) {
  const v = toNum(n);
  if (v == null) return "isNA";
  if (v > 0) return "isPos";
  if (v < 0) return "isNeg";
  return "isZero";
}

async function fetchJsonSafe(url, { signal } = {}) {
  const r = await fetch(url, { signal });
  const text = await r.text();

  let j;
  try {
    j = JSON.parse(text);
  } catch {
    const snip = text.slice(0, 180).replace(/\s+/g, " ");
    throw new Error(`Non-JSON response (${r.status}). URL=${url}. Body="${snip}"`);
  }

  if (!r.ok || j?.ok === false) {
    throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  }
  return j;
}

async function loadTimeframe(tf, symbol, signal) {
  const qs = new URLSearchParams({ tf });
  const url = `/api/market/symbol/${encodeURIComponent(symbol)}?${qs.toString()}`;
  const j = await fetchJsonSafe(url, { signal });
  const row = j?.symbolData ? adaptMarketRow(j.symbolData) : null;

  return {
    tf,
    source: j?.source ?? null,
    row,
    ok: true,
    err: "",
    fetchedAt: Date.now(),
  };
}

/* =========================
   Right: Quick compare TFs (same symbol)
   ========================= */
function QuickCompareTF({ items, tf, setTf }) {
  return (
    <div className="qcCard">
      <div className="qcTop">
        <div className="qcTitle">Symbol Data</div>
        <div className="qcHint"></div>
      </div>

      <div className="qcCols">
        <span>TF</span>
        <span>Regime</span>
        <span className="num">Flow</span>
        <span className="num">Trend</span>
      </div>

      <div className="qcList">
        {items.map((it) => {
          const row = it.row;
          const active = it.tf === tf;
          return (
            <button
              key={it.tf}
              type="button"
              className={"qcRow2 " + (active ? "isOn" : "") + (!row ? " isOff" : "")}
              onClick={() => setTf(it.tf)}
              title={row ? "Select timeframe" : "No data"}
            >
              <div className="qcTf">
                {it.tf}
              </div>

              <div className="qcSigCell">
                {row ? (
                  <span className={"qcSigPill " + signalClass(row.signal)}>{signalLabel(row.signal)}</span>
                ) : (
                  <span className="qcDash">—</span>
                )}
              </div>

              <div className={"qcNum num " + signClass(pctAutoNum(row?.flowPct))}>
                {row ? fmtPctAuto(row.flowPct) : "—"}
              </div>

              <div className={"qcNum num " + signClass(pctAutoNum(row?.trendAcceleration))}>
                {row ? fmtPctAuto(row.trendAcceleration) : "—"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================
   Line chart base (SVG)
   ========================= */
function LineChart({
  title,
  subtitle,
  labels,
  series, // [{ name, values[], cls }]
  selectedLabel,
}) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const W = 980;
  const H = 300;
  const pad = 22;
  const yPadLeft = 64;
  const xPadBottom = 28;

  // flatten values for y scale
  const all = [];
  for (const s of series) {
    for (const v of s.values) if (v != null) all.push(v);
  }

  const has = all.length >= 2;
  const ymin = has ? Math.min(...all) : -1;
  const ymax = has ? Math.max(...all) : 1;
  const span = Math.max(1e-9, ymax - ymin);

  const n = Math.max(1, labels.length);
  const xForIdx = (i) => yPadLeft + (i * (W - yPadLeft - pad)) / Math.max(1, n - 1);
  const yForVal = (v) => pad + (H - pad - xPadBottom - pad) * (1 - (v - ymin) / span);
  const yTickVal = (k) => ymax - ((ymax - ymin) * k) / 4;
  const fmtTick = (v) => `${v.toFixed(2)}%`;

  const y0 = ymin < 0 && ymax > 0 ? yForVal(0) : null;

  const makePath = (values) => {
    const pts = values
      .map((v, i) => (v == null ? null : [xForIdx(i), yForVal(v)]))
      .filter(Boolean);

    if (pts.length < 2) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
  };

  const selIdx = selectedLabel ? labels.findIndex((x) => x === selectedLabel) : -1;
  const selX = selIdx >= 0 ? xForIdx(selIdx) : null;
  const hoverX = hoverIdx != null ? xForIdx(hoverIdx) : null;

  const hoverRows =
    hoverIdx == null
      ? []
      : series.map((s) => ({
          name: s.name,
          cls: s.cls || "",
          value: s.values[hoverIdx],
        }));

  const tipW = 170;
  const tipH = 22 + hoverRows.length * 16;
  const tipX =
    hoverX == null
      ? 0
      : Math.min(W - tipW - pad, Math.max(yPadLeft, hoverX + 10));
  const tipY = pad + 8;

  return (
    <div className="lcCard">
      <div className="lcTop">
        <div>
          <div className="lcTitle">{title}</div>
          {subtitle && <div className="lcSub">{subtitle}</div>}
        </div>
      </div>

      {!has ? (
        <div className="lcEmpty"></div>
      ) : (
        <svg
          className="lcSvg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * W;
            const idx = Math.round(((x - yPadLeft) / Math.max(1, W - yPadLeft - pad)) * Math.max(1, n - 1));
            const clamped = Math.max(0, Math.min(n - 1, idx));
            setHoverIdx(clamped);
          }}
        >
          {/* grid */}
          {Array.from({ length: 5 }).map((_, k) => {
            const y = pad + (k * (H - pad - xPadBottom - pad)) / 4;
            return <line key={k} x1={yPadLeft} y1={y} x2={W - pad} y2={y} className="lcGrid" />;
          })}

          {/* y-axis labels */}
          {Array.from({ length: 5 }).map((_, k) => {
            const y = pad + (k * (H - pad - xPadBottom - pad)) / 4;
            return (
              <text key={`yl-${k}`} x={yPadLeft - 8} y={y + 4} className="lcYLbl">
                {fmtTick(yTickVal(k))}
              </text>
            );
          })}

          {/* zero line */}
          {y0 != null && <line x1={yPadLeft} y1={y0} x2={W - pad} y2={y0} className="lcZero" />}

          {/* selected TF vertical marker */}
          {selX != null && <line x1={selX} y1={pad} x2={selX} y2={H - xPadBottom} className="lcSel" />}
          {hoverX != null && <line x1={hoverX} y1={pad} x2={hoverX} y2={H - xPadBottom} className="lcHover" />}

          {/* series paths */}
          {series.map((s) => {
            const d = makePath(s.values);
            if (!d) return null;
            return <path key={s.name} d={d} className={"lcLine " + (s.cls || "")} />;
          })}

          {/* dots for each series */}
          {series.map((s) =>
            s.values.map((v, i) =>
              v == null ? null : (
                <circle
                  key={`${s.name}-${labels[i]}`}
                  cx={xForIdx(i)}
                  cy={yForVal(v)}
                  r={hoverIdx === i ? 5.2 : labels[i] === selectedLabel ? 4.6 : 3.2}
                  className={
                    "lcDot " +
                    (s.cls || "") +
                    (labels[i] === selectedLabel ? " isSel" : "") +
                    (hoverIdx === i ? " isHover" : "")
                  }
                />
              )
            )
          )}

          {/* x-axis labels inside chart */}
          {labels.map((l, i) => (
            <text
              key={`xl-${l}`}
              x={xForIdx(i)}
              y={H - 8}
              className={"lcXLbl " + (l === selectedLabel ? "isSel" : "")}
            >
              {l}
            </text>
          ))}

          {/* hover tooltip */}
          {hoverIdx != null && (
            <g className="lcTip">
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="10" className="lcTipBox" />
              <text x={tipX + 10} y={tipY + 15} className="lcTipTitle">
                TF: {labels[hoverIdx]}
              </text>
              {hoverRows.map((r, i) => (
                <text key={`${r.name}-${i}`} x={tipX + 10} y={tipY + 32 + i * 15} className={"lcTipVal " + r.cls}>
                  {r.name}: {r.value == null ? "—" : `${r.value.toFixed(2)}%`}
                </text>
              ))}
            </g>
          )}
        </svg>
      )}

      {series.length > 1 && (
        <div className="lcLegend">
          {series.map((s) => (
            <div key={s.name} className="lcLegItem">
              <span className={"lcSwatch " + (s.cls || "")} />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================
   Single chart: Flow + Trend visibility
   ========================= */
function FlowTrendLine({
  items,
  tfSelected,
  showFlow,
  setShowFlow,
  showTrend,
  setShowTrend,
}) {
  const labels = [...TF_OPTIONS].reverse();
  const flowVals = labels.map((t) => {
    const it = items.find((x) => x.tf === t);
    const r = it?.row;
    return r ? pctAutoNum(r.flowPct) : null;
  });
  const trendVals = labels.map((t) => {
    const it = items.find((x) => x.tf === t);
    const r = it?.row;
    return r ? pctAutoNum(r.trendAcceleration) : null;
  });

  const series = [];
  if (showFlow) series.push({ name: "Flow%", values: flowVals, cls: "sA" });
  if (showTrend) series.push({ name: "Trend", values: trendVals, cls: "sB" });

  return (
    <div>
      <div className="chartPicker">
        <div className="chartPickerTitle"></div>
        <div className="chartPickerRight">
          <label className="chartCheck">
            <input
              type="checkbox"
              checked={showFlow}
              onChange={(e) => setShowFlow(e.target.checked)}
            />
            <span>Flow%</span>
          </label>

          <label className="chartCheck">
            <input
              type="checkbox"
              checked={showTrend}
              onChange={(e) => setShowTrend(e.target.checked)}
            />
            <span>Trend</span>
          </label>
        </div>
      </div>

      {series.length === 0 ? (
        <div className="lcCard">
          <div className="lcEmpty">Enable at least one series.</div>
        </div>
      ) : (
        <LineChart
          title="Data Chart"
          subtitle=""
          labels={labels}
          selectedLabel={tfSelected}
          series={series}
        />
      )}
    </div>
  );
}

/* =========================
   PAGE
   ========================= */
export default function SymbolDashboard() {
  const { symbol } = useParams();
  const loc = useLocation();
  const symbolUp = String(symbol ?? "").toUpperCase();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tf, setTf] = useState("1h");
  const [legalOpen, setLegalOpen] = useState("");

  function openCookieSettings() {
    const cookiebot = window?.Cookiebot;
    if (cookiebot && typeof cookiebot.renew === "function") {
      cookiebot.renew();
      return;
    }
    alert("Cookie preferences are not available right now. Please reload and try again.");
  }

  const reqIdRef = useRef(0);
  const inflightRef = useRef(null);

  useEffect(() => {
    async function run({ silent = false } = {}) {
      if (!silent) setLoading(true);
      setError("");

      if (inflightRef.current) {
        try {
          inflightRef.current.abort();
        } catch {
          // Ignore abort races during fast timeframe switches.
        }
      }

      const myReqId = ++reqIdRef.current;
      const ctrl = new AbortController();
      inflightRef.current = ctrl;

      try {
        const results = await Promise.all(
          TF_OPTIONS.map(async (t) => {
            try {
              return await loadTimeframe(t, symbolUp, ctrl.signal);
            } catch (e) {
              return {
                tf: t,
                source: null,
                row: null,
                ok: false,
                err: e?.message || "Error",
                fetchedAt: Date.now(),
              };
            }
          })
        );

        if (myReqId !== reqIdRef.current) return;
        setItems(results);

        if (!results.some((x) => x.ok)) setError("Loading...");

        // auto pick tf if current has no row
        const cur = results.find((x) => x.tf === tf);
        if (!cur?.row) {
          const first = results.find((x) => x.ok && x.row);
          if (first?.tf) setTf(first.tf);
        }
      } finally {
        if (myReqId === reqIdRef.current) {
          if (!silent) setLoading(false);
          inflightRef.current = null;
        }
      }
    }

    run({ silent: false });
    const id = setInterval(() => {
      run({ silent: true });
    }, 2_000);

    return () => {
      clearInterval(id);
      if (inflightRef.current) {
        try {
          inflightRef.current.abort();
        } catch {
          // Ignore abort races during unmount.
        }
      }
    };
  }, [symbolUp, tf]);

  const fallbackRow = loc.state?.row ?? null;
  const firstRow = useMemo(() => items.find((x) => x.row)?.row ?? null, [items]);
  const headerRow = firstRow || fallbackRow;

  const company = headerRow?.companyName || "-";
  const industry = headerRow?.industry || "-";

  return (
    <div className="sdPage">
      <div className="sdTop">
        <button
          className="sdBack"
          onClick={() => {
            window.location.replace(`/dashboard?from=symbol&t=${Date.now()}`);
          }}
          type="button"
        >
          ←
        </button>

        <div className="sdHdrMid">
          <div className="sdSym">{symbolUp || "-"}</div>

          {industry !== "-" && <span className="sdPill">{industry}</span>}
        </div>

        <div className="sdHdrRight">
          <div className="sdCo">{company}</div>
 
        </div>
      </div>

      {error && <div className="sdBanner sdErr">{error}</div>}

      {loading ? (
        <div className="sdLoading">
          <div className="sdSpin" />
          <div>
            <div className="sdLoadT">Loading…</div>
            <div className="sdLoadS">LIVE + HIST</div>
          </div>
        </div>
      ) : (
        <>
    

          <div className="sdMain">


<div className="sdLeft">
  <ChartGLMetrics
    apiBase="/api/market"
    symbol={symbolUp}
    tf={tf}
    height={520}
    autoRefreshMs={2_000}
  />
</div>

            <div className="sdRight">
              <QuickCompareTF items={items} tf={tf} setTf={setTf} />
            </div>
          </div>
        </>
      )}

      <footer className="sdFooter" aria-label="Legal and company info">
        <div className="sdFooterLinks">
          <button type="button" className="sdFooterBtn" onClick={() => setLegalOpen("terms")}>
            Terms
          </button>
          <button type="button" className="sdFooterBtn" onClick={() => setLegalOpen("privacy")}>
            Privacy
          </button>
          <button type="button" className="sdFooterBtn" onClick={openCookieSettings}>
            Cookies
          </button>
          <button type="button" className="sdFooterBtn" onClick={() => setLegalOpen("disclaimer")}>
            Disclaimer
          </button>
        </div>
        <div className="sdFooterPowered">
          Powered by <b>Valarik</b>
        </div>
        <div className="sdFooterCopyright">© 2026 Valarik LLC. All rights reserved.</div>
      </footer>

      <LegalModal kind={legalOpen} onClose={() => setLegalOpen("")} />
    </div>
  );
}
