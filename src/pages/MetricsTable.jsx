import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./MetricsTable.css";

/* ====== helpers ====== */
function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function fmtInt(x) {
  const n = toNum(x);
  if (n == null) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtDec(x, dp = 6) {
  const n = toNum(x);
  if (n == null) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}
function fmtPct(x, dp = 2) {
  const n = toNum(x);
  if (n == null) return "-";
  return `${n.toFixed(dp)}%`;
}
function normStr(x) {
  return String(x ?? "").trim().toLowerCase();
}
function signClass(n) {
  const v = toNum(n);
  if (v == null) return "isNA";
  if (v > 0) return "isPos";
  if (v < 0) return "isNeg";
  return "isZero";
}

function asValidDate(x) {
  if (x == null) return null;

  if (x instanceof Date) {
    return Number.isNaN(x.getTime()) ? null : x;
  }

  if (typeof x === "number" && Number.isFinite(x)) {
    const ms = x < 1e12 ? x * 1000 : x; // allow unix seconds or millis
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(x).trim();
  if (!s) return null;

  // date-only strings are interpreted in local timezone to avoid off-by-one day
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDaysUntil(x) {
  const target = asValidDate(x);
  if (!target) return "-";

  const today = startOfLocalDay(new Date());
  const targetDay = startOfLocalDay(target);
  const days = Math.round((targetDay.getTime() - today.getTime()) / 86400000);

  if (days === 0) return "Today";
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} left`;
  const abs = Math.abs(days);
  return `${abs} day${abs === 1 ? "" : "s"} ago`;
}

function formatElapsedShort(ts) {
  const t = toNum(ts);
  if (t == null) return "";
  const diffMs = Math.max(0, Date.now() - t);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function firstDefined(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return null;
}

/* ====== columns ====== */
const COLS = [
  { key: "rankFlow", label: "Rank", type: "num", sortable: true, filterable: false },
  { key: "rankStatus", label: "Status", type: "text", sortable: false, filterable: false },
  { key: "symbol", label: "Symbol", type: "text", sortable: true, filterable: true },
  { key: "signal", label: "Regime", type: "text", sortable: true, filterable: true },
  { key: "ptfav", label: "Liquidity Footprint", type: "num", sortable: true, filterable: false },
  { key: "flowPctTotal", label: "Flow%", type: "num", sortable: true, filterable: false },
  { key: "momScore", label: "Trend Acceleration", type: "num", sortable: true, filterable: false },
  { key: "targetWt", label: "WT", type: "num", sortable: true, filterable: false },
];
const SHOW_WT_PREMIUM = false;

/* ====== sort utils ====== */
function compare(a, b, key) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (key === "signal") {
    const rank = (x) => {
      const s = String(x ?? "").toUpperCase();
      if (s === "BULLISH") return 0;
      if (s === "NEUTRAL") return 1;
      if (s === "BEARISH") return 2;
      return 9;
    };
    return rank(a) - rank(b);
  }

  if (typeof a === "string" || typeof b === "string") {
    return String(a).localeCompare(String(b));
  }
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) && !Number.isFinite(nb)) return 0;
  if (!Number.isFinite(na)) return 1;
  if (!Number.isFinite(nb)) return -1;
  return na - nb;
}

function getSortInfo(sort, key) {
  const idx = (sort || []).findIndex((s) => s.key === key);
  if (idx === -1) return null;
  return { order: idx + 1, dir: sort[idx].dir };
}

function sortLabels(key) {
  if (key === "symbol") return { asc: "A → Z", desc: "Z → A" };
  if (key === "signal") return { asc: "BULLISH → NEUTRAL → BEARISH", desc: "BEARISH → NEUTRAL → BULLISH" };
  return { asc: "Min → Max", desc: "Max → Min" };
}

/* ====== Portal dropdown ====== */
function PortalDropdown({ anchorEl, boxRef, onClose, children }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchorEl) return;

    const compute = () => {
      const rect = anchorEl.getBoundingClientRect();
      const width = 280;
      const gap = 8;

      let top = rect.bottom + window.scrollY + gap;
      let left = rect.left + window.scrollX;

      const pad = 10;
      const minLeft = window.scrollX + pad;
      const maxLeft = window.scrollX + window.innerWidth - width - pad;
      left = Math.max(minLeft, Math.min(maxLeft, left));

      const estH = 260;
      const bottomSpace = window.innerHeight - rect.bottom;
      if (bottomSpace < estH + 10) {
        top = rect.top + window.scrollY - estH - gap;
        top = Math.max(window.scrollY + pad, top);
      }

      setPos({ top, left, width });
    };

    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [anchorEl]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    function onDoc(e) {
      if (!anchorEl) return;
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      const inBox = boxRef.current && (path.includes(boxRef.current) || boxRef.current.contains(e.target));
      const inAnchor = path.includes(anchorEl) || anchorEl.contains(e.target);
      if (inBox || inAnchor) return;
      onClose?.();
    }
    document.addEventListener("pointerdown", onDoc, false);
    return () => document.removeEventListener("pointerdown", onDoc, false);
  }, [anchorEl, onClose, boxRef]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={boxRef}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 999999,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

/* ====== PortalPopover (symbol info) ====== */
function PortalPopover({ anchorEl, boxRef, onClose, children }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchorEl) return;

    const compute = () => {
      const rect = anchorEl.getBoundingClientRect();
      const width = 320;
      const gap = 10;

      let top = rect.bottom + window.scrollY + gap;
      let left = rect.left + window.scrollX;

      const pad = 10;
      const minLeft = window.scrollX + pad;
      const maxLeft = window.scrollX + window.innerWidth - width - pad;
      left = Math.max(minLeft, Math.min(maxLeft, left));

      const estH = 210;
      const bottomSpace = window.innerHeight - rect.bottom;
      if (bottomSpace < estH + 10) {
        top = rect.top + window.scrollY - estH - gap;
        top = Math.max(window.scrollY + pad, top);
      }

      setPos({ top, left, width });
    };

    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [anchorEl]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    function onDoc(e) {
      if (!anchorEl) return;
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      const inBox = boxRef.current && (path.includes(boxRef.current) || boxRef.current.contains(e.target));
      const inAnchor = path.includes(anchorEl) || anchorEl.contains(e.target);
      if (inBox || inAnchor) return;
      onClose?.();
    }
    document.addEventListener("pointerdown", onDoc, false);
    return () => document.removeEventListener("pointerdown", onDoc, false);
  }, [anchorEl, onClose, boxRef]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={boxRef}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 999999,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

/* ====== Cell visual ====== */
function CellVisual({ col, row, children, barMaxByKey }) {
  if (col.key === "rankStatus") {
    return (
      <div className="cellWrap">
        <div className="cellContent">{children}</div>
      </div>
    );
  }

  const isBarCol =
    col.key === "dptfavPct" ||
    col.key === "flowPctTotal" ||
    col.key === "targetWt" ||
    col.key === "momScore";

  let numeric = toNum(row?.[col.key]);

  if (col.key === "targetWt") numeric = numeric == null ? null : numeric * 100;
  if (col.key === "flowPctTotal") numeric = numeric == null ? null : (Math.abs(numeric) <= 1.5 ? numeric * 100 : numeric);
  if (col.key === "momScore") numeric = numeric == null ? null : numeric;

  const cls = signClass(numeric);
  const denom = Math.max(1e-9, barMaxByKey?.[col.key] ?? 1);
  const w = !isBarCol || numeric == null ? 0 : Math.min(100, (Math.abs(numeric) / denom) * 100);

  if (col.key === "signal") {
    const raw = String(row?.signal ?? "").toUpperCase();
    const scls = raw === "BULLISH" ? "bullish" : raw === "BEARISH" ? "bearish" : "neutral";
    return (
      <div className={`cellWrap ${scls}`}>
        <div className="cellContent">{children}</div>
      </div>
    );
  }

  return (
    <div className={`cellWrap ${isBarCol ? "hasBar" : ""} ${cls}`}>
      <div className="cellContent">{children}</div>
      {isBarCol && (
        <div className="barTrack" aria-hidden="true">
          <div className="barFill" style={{ width: `${w}%` }} />
        </div>
      )}
    </div>
  );
}

export default function MetricsTable({ rows, sort, setSort, industryQ = "" }) {
  const navigate = useNavigate();

  const [menu, setMenu] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const menuBoxRef = useRef(null);

  // filters
  const [symbolQ, setSymbolQ] = useState("");
  const [regimes, setRegimes] = useState({ BULLISH: true, BEARISH: true, NEUTRAL: true });
  const symbolInputRef = useRef(null);
  const symbolFilterBtnRef = useRef(null);
  const regimeFilterBtnRef = useRef(null);

  // symbol info popover
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoAnchor, setInfoAnchor] = useState(null);
  const infoBoxRef = useRef(null);
  const [infoRow, setInfoRow] = useState(null);
  const rankStateRef = useRef(new Map());
  const [rankStatusBySymbol, setRankStatusBySymbol] = useState({});
  const visibleCols = useMemo(
    () => COLS.filter((c) => SHOW_WT_PREMIUM || c.key !== "targetWt"),
    []
  );
  const visibleColKeys = useMemo(() => new Set(visibleCols.map((c) => c.key)), [visibleCols]);

  function closeMenu() {
    setMenu(null);
    setAnchorEl(null);
  }
  function openMenu(type, key, el) {
    setInfoOpen(false);
    setInfoAnchor(null);
    setInfoRow(null);

    setMenu({ type, key });
    setAnchorEl(el);
  }

  function openInfo(row, el) {
    closeMenu();
    setInfoRow(row);
    setInfoAnchor(el);
    setInfoOpen(true);
  }
  function closeInfo() {
    setInfoOpen(false);
    setInfoAnchor(null);
    setInfoRow(null);
  }

  useEffect(() => {
    if (menu?.type === "filter" && menu?.key === "symbol") {
      setTimeout(() => symbolInputRef.current?.focus(), 0);
    }
  }, [menu]);

  // normalize + computed columns
  const cookedRows = useMemo(() => {
    return (rows || []).map((r, idx) => {
      const ptfav = toNum(r.ptfav);
      const rankFlow = r.rankFlow ?? r.rank ?? r.Rank ?? (idx + 1);
      const dptfav = toNum(r.dptfav ?? r.dPTFAV ?? r.deltaPTFAV);

      let dptfavPct = null;
      if (dptfav != null && ptfav != null && Math.abs(ptfav) > 0) {
        dptfavPct = (dptfav / Math.abs(ptfav)) * 100;
      }

      const eRaw = r.earnings;
      const e = Array.isArray(eRaw) ? (eRaw[0] ?? {}) : (eRaw ?? {});

      const dt = firstDefined(
        e.next_date,
        e.nextDate,
        e.next_earnings_date,
        e.nextEarningsDate,
        e.earnings_date,
        e.earningsDate,
        e.report_date,
        e.reportDate,
        e.date,
        r.next_earnings_date,
        r.nextEarningsDate,
        r.earnings_date,
        r.earningsDate,
        r.report_date,
        r.reportDate,
        r.date,
        e.last_date // fallback
      );

      const epsA = firstDefined(e.eps_actual, e.epsActual, r.eps_actual, r.epsActual);
      const epsE = firstDefined(e.eps_estimate, e.epsEstimate, r.eps_estimate, r.epsEstimate);

      let earningsNext = "-";
      if (dt) {
        const countdown = formatDaysUntil(dt);
        const epsPart =
          epsA != null || epsE != null ? ` | EPS ${epsA ?? "?"} (est ${epsE ?? "?"})` : "";
        earningsNext = `${countdown}${epsPart}`;
      }

      // normalize signal
      let signal = r.signal ?? "HOLD";
      const raw = String(signal).toUpperCase();
      if (raw === "HOLD") signal = "NEUTRAL";
      if (raw === "BUY") signal = "BULLISH";
      if (raw === "SELL") signal = "BEARISH";
      if (raw === "ROTATE") signal = "BEARISH";

      return { ...r, rankFlow, dptfavPct, signal, earningsNext };
    });
  }, [rows]);

  useEffect(() => {
    const now = Date.now();
    const next = {};
    const seen = new Set();
    const memory = rankStateRef.current;

    for (const r of cookedRows) {
      const symbol = String(r?.symbol ?? "").toUpperCase();
      const rank = toNum(r?.rankFlow);
      if (!symbol || rank == null) continue;

      seen.add(symbol);
      const prev = memory.get(symbol);
      if (!prev) {
        const entry = { rank, dir: "flat", changedAt: now };
        memory.set(symbol, entry);
        next[symbol] = entry;
        continue;
      }

      let dir = prev.dir || "flat";
      let changedAt = prev.changedAt || now;
      if (rank < prev.rank) {
        dir = "up";
        changedAt = now;
      } else if (rank > prev.rank) {
        dir = "down";
        changedAt = now;
      }

      const entry = { rank, dir, changedAt };
      memory.set(symbol, entry);
      next[symbol] = entry;
    }

    for (const symbol of Array.from(memory.keys())) {
      if (!seen.has(symbol)) memory.delete(symbol);
    }

    setRankStatusBySymbol(next);
  }, [cookedRows]);

  // filters
  const filteredRows = useMemo(() => {
    const sq = normStr(symbolQ);
    const iq = normStr(industryQ);

    return cookedRows.filter((r) => {
      const sym = normStr(r.symbol);
      const sig = String(r.signal ?? "").toUpperCase();
      const regimeOk = regimes[sig] ?? true;
      const symbolOk = !sq || sym.includes(sq);

      const ind = normStr(r.industry);
      const industryOk = !iq || ind === iq;

      return regimeOk && symbolOk && industryOk;
    });
  }, [cookedRows, symbolQ, regimes, industryQ]);

  // bar scaling
  const barMaxByKey = useMemo(() => {
    const keys = ["dptfavPct", "flowPctTotal", "targetWt", "momScore"];
    const out = { dptfavPct: 1, flowPctTotal: 1, targetWt: 1, momScore: 1 };

    for (const r of filteredRows) {
      for (const k of keys) {
        let v = toNum(r[k]);
        if (k === "targetWt") v = v == null ? null : v;
        if (k === "flowPctTotal") v = v == null ? null : v;
        if (k === "momScore") v = v == null ? null : v;
        if (v == null) continue;
        out[k] = Math.max(out[k], Math.abs(v));
      }
    }

    out.dptfavPct *= 1.1;
    out.flowPctTotal *= 1.1;
    out.targetWt *= 1.1;
    out.momScore *= 1.1;

    return out;
  }, [filteredRows]);

  // multi-sort
  const effectiveSort = useMemo(() => {
    const s = Array.isArray(sort) ? sort : [];
    return s.filter((rule) => visibleColKeys.has(rule.key));
  }, [sort, visibleColKeys]);

  const viewRows = useMemo(() => {
    const s = effectiveSort;
    if (!s.length) return filteredRows;

    const out = filteredRows.slice();
    out.sort((ra, rb) => {
      for (const rule of s) {
        const av = ra?.[rule.key];
        const bv = rb?.[rule.key];
        const c = compare(av, bv, rule.key);
        if (c !== 0) return rule.dir === "asc" ? c : -c;
      }
      return 0;
    });
    return out;
  }, [filteredRows, effectiveSort]);

  function setColSort(key, dirOrNull) {
    setSort((prev) => {
      const cur = Array.isArray(prev) ? prev : [];
      const idx = cur.findIndex((x) => x.key === key);

      if (dirOrNull == null) {
        if (idx === -1) return cur;
        const next = cur.slice();
        next.splice(idx, 1);
        return next;
      }

      if (idx === -1) return [...cur, { key, dir: dirOrNull }];

      const next = cur.slice();
      next[idx] = { key, dir: dirOrNull };
      return next;
    });
  }

  function clearAllSort() {
    setSort([]);
    closeMenu();
  }

  function clearFilters() {
    setSymbolQ("");
    setRegimes({ BULLISH: true, BEARISH: true, NEUTRAL: true });
    closeMenu();
  }

  function renderCell(col, r) {
    const v = r?.[col.key];

    if (col.key === "symbol") {
      return (
        <div className="symCell">
          <span className="symTxt">{v ?? "-"}</span>
          <button
            type="button"
            className="symInfoBtn"
            title="Info"
            onClick={(e) => {
              e.stopPropagation(); // IMPORTANT: evita que navegue por fila
              openInfo(r, e.currentTarget);
            }}
          >
            ⓘ
          </button>
        </div>
      );
    }

    if (col.key === "rankFlow") return fmtInt(v);

    if (col.key === "rankStatus") {
      const symbol = String(r?.symbol ?? "").toUpperCase();
      const serverStatus = r?.rankStatus;
      const s = (serverStatus && typeof serverStatus === "object")
        ? {
            dir: String(serverStatus.dir || "flat"),
            changedAt: toNum(serverStatus.changedAt) ?? Date.now(),
          }
        : (rankStatusBySymbol[symbol] || { dir: "flat", changedAt: Date.now() });
      const since = formatElapsedShort(s.changedAt);
      const txt = s.dir === "up" ? "Rank up" : s.dir === "down" ? "Rank down" : "Rank unchanged";
      const tip = since ? `${txt} · ${since}` : txt;
      return (
        <span className={`rankStatus rankStatus--${s.dir}`} title={tip} aria-label={tip}>
          {s.dir === "flat" ? (
            <span className="rankStatus__flat">—</span>
          ) : (
            <svg className="rankStatus__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.5 3.5 21.5 12 2.5 20.5 8.9 12z" />
            </svg>
          )}
        </span>
      );
    }

    if (col.key === "targetWt") {
      const pct = (toNum(v) ?? null) != null ? toNum(v) * 100 : null;
      return fmtPct(pct, 2);
    }

    if (col.key === "flowPctTotal") {
      const n = toNum(v);
      const pct = n == null ? null : (Math.abs(n) <= 1.5 ? n * 100 : n);
      return fmtPct(pct, 2);
    }

    if (col.key === "momScore") {
      const n = toNum(v);
      const pct = n == null ? null : n;
      return fmtPct(pct, 2);
    }

    if (col.key === "signal") return String(v ?? "-").toUpperCase();
    if (col.key === "dptfavPct") return fmtPct(v, 2);

    if (col.type === "num") {
      if (col.key === "ptfav") return fmtInt(v);
      return fmtDec(v, 6);
    }

    return v ?? "-";
  }

  const activeCol = menu?.key ? visibleCols.find((c) => c.key === menu.key) : null;
  const activeInfo = menu?.key ? getSortInfo(effectiveSort, menu.key) : null;

  // popover info
  const infoCompany = infoRow?.companyName ?? "-";
  const infoIndustry = infoRow?.industry ?? "-";
  const infoEarnings = infoRow?.earningsNext ?? "-";
  const infoSymbol = infoRow?.symbol ?? "-";

  const regimeAllOn = regimes.BULLISH && regimes.BEARISH && regimes.NEUTRAL;

  return (
    <div className="mtWrap">
      {/* UPDATED: always-visible compact filter bar */}
      <div className="mtMobileControls">
        <div className="mtMobileRow">
          <div className="mtMobileSearchWrap">
            <input
              className="mtMobileSearch"
              placeholder="Search symbol…"
              value={symbolQ}
              onChange={(e) => setSymbolQ(e.target.value)}
              inputMode="search"
              autoCapitalize="characters"
            />

            <button
              type="button"
              className="mtMobileClear"
              onClick={() => {
                setSymbolQ("");
                setRegimes({ BULLISH: true, BEARISH: true, NEUTRAL: true });
              }}
              disabled={!symbolQ.trim() && regimeAllOn}
              title="Clear"
            >
              Clear
            </button>
          </div>

          <div className="mtStaticFilterRow">
            {visibleCols.filter((c) => c.key !== "symbol").map((c) => {
              const info = getSortInfo(effectiveSort, c.key);
              const filterOn =
                (c.key === "symbol" && !!symbolQ.trim()) ||
                (c.key === "signal" && !regimeAllOn);

              return (
                <button
                  key={c.key}
                  type="button"
                  className={
                    "mtStaticFilterBtn " +
                    (info || filterOn ? "isOn" : "")
                  }
                  onClick={(e) => {
                    const el = e.currentTarget;
                    if (c.filterable) {
                      if (menu?.type === "filter" && menu?.key === c.key) return closeMenu();
                      openMenu("filter", c.key, el);
                      return;
                    }
                    if (menu?.type === "sort" && menu?.key === c.key) return closeMenu();
                    openMenu("sort", c.key, el);
                  }}
                  title={c.filterable ? `Filter ${c.label}` : `Sort ${c.label}`}
                >
                  <span className="mtStaticFilterLabel">{c.label}</span>
                  <span className="mtStaticFilterIcon">{c.filterable ? "⌕" : "⇅"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mtMobileHint">
          Showing <b>{viewRows.length}</b> / {cookedRows.length}
        </div>
      </div>

      <table className="mtTable">
        <thead>
          <tr>
            {visibleCols.map((c) => {
              const info = getSortInfo(effectiveSort, c.key);
              const isSorted = !!info;

              const filterOn =
                (c.key === "symbol" && !!symbolQ.trim()) ||
                (c.key === "signal" && !(regimes.BULLISH && regimes.BEARISH && regimes.NEUTRAL));

              return (
                <th key={c.key} className={isSorted || filterOn ? "thActive" : ""}>
                  <div className="thInner">
                    <span className="thLabel">{c.label}</span>

                    {info && (
                      <span className="sortBadge" title={`Priority #${info.order}`}>
                        {info.order}
                        {info.dir === "asc" ? "↑" : "↓"}
                      </span>
                    )}

                    <div className="thActions">
                      {c.filterable && (
                        <button
                          className={"iconBtn " + (filterOn ? "isOn" : "")}
                          type="button"
                          title="Filter"
                          onClick={(e) => {
                            const el = e.currentTarget;
                            if (menu?.type === "filter" && menu?.key === c.key) return closeMenu();
                            openMenu("filter", c.key, el);
                          }}
                        >
                          ⌕
                        </button>
                      )}

                      {c.sortable && (
                        <button
                          className={"iconBtn " + (menu?.type === "sort" && menu?.key === c.key ? "isOpen" : "")}
                          type="button"
                          title="Sort"
                          onClick={(e) => {
                            const el = e.currentTarget;
                            if (menu?.type === "sort" && menu?.key === c.key) return closeMenu();
                            openMenu("sort", c.key, el);
                          }}
                        >
                          ⇅
                        </button>
                      )}
                    </div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {viewRows.map((r, i) => (
            <tr
              key={r.symbol ? `${r.symbol}-${i}` : i}
              className="mtRowClickable"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!r?.symbol) return;
                navigate(`/symbol/${encodeURIComponent(r.symbol)}`, { state: { row: r } });
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && r?.symbol) {
                  e.preventDefault();
                  navigate(`/symbol/${encodeURIComponent(r.symbol)}`, { state: { row: r } });
                }
              }}
            >
              {visibleCols.map((c) => (
                <td key={c.key} data-label={c.label}>
                  <CellVisual col={c} row={r} barMaxByKey={barMaxByKey}>
                    {renderCell(c, r)}
                  </CellVisual>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Portal dropdown (sort/filter) */}
      {menu && anchorEl && activeCol && (
        <PortalDropdown anchorEl={anchorEl} boxRef={menuBoxRef} onClose={closeMenu}>
          <div className="menuCard">
            {menu.type === "sort" ? (
              <>
                <div className="menuTop">
                  <div className="menuTitle">
                    Sort: <b>{activeCol.label}</b>
                  </div>
                  <button className="linkBtn" type="button" onClick={clearAllSort}>
                    Clear all
                  </button>
                </div>

                <button
                  className={"menuItem " + (activeInfo?.dir === "asc" ? "isSelected" : "")}
                  onClick={() => {
                    setColSort(activeCol.key, "asc");
                    closeMenu();
                  }}
                  type="button"
                >
                  {sortLabels(activeCol.key).asc} {activeInfo?.dir === "asc" ? "✓" : ""}
                </button>

                <button
                  className={"menuItem " + (activeInfo?.dir === "desc" ? "isSelected" : "")}
                  onClick={() => {
                    setColSort(activeCol.key, "desc");
                    closeMenu();
                  }}
                  type="button"
                >
                  {sortLabels(activeCol.key).desc} {activeInfo?.dir === "desc" ? "✓" : ""}
                </button>

                <button
                  className={"menuItem " + (!activeInfo ? "isSelected" : "")}
                  onClick={() => {
                    setColSort(activeCol.key, null);
                    closeMenu();
                  }}
                  type="button"
                >
                  No sort {!activeInfo ? "✓" : ""}
                </button>
              </>
            ) : (
              <>
                <div className="menuTop">
                  <div className="menuTitle">
                    Filter: <b>{activeCol.label}</b>
                  </div>
                  <button className="linkBtn" type="button" onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>

                {activeCol.key === "symbol" && (
                  <>
                    <input
                      ref={symbolInputRef}
                      className="menuSearch"
                      placeholder="Search symbol…"
                      value={symbolQ}
                      onChange={(e) => setSymbolQ(e.target.value)}
                    />
                    <div className="menuHint">Type to filter symbols (e.g. AAPL, TSLA).</div>
                  </>
                )}

                {activeCol.key === "signal" && (
                  <>
                    <div className="pillRow">
                      {["BULLISH", "BEARISH", "NEUTRAL"].map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={"pill " + (regimes[k] ? "isOn" : "")}
                          onClick={() => setRegimes((p) => ({ ...p, [k]: !p[k] }))}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                    <div className="menuHint">Toggle regimes to show/hide rows.</div>
                  </>
                )}
              </>
            )}
          </div>
        </PortalDropdown>
      )}

      {/* Symbol info popover */}
      {infoOpen && infoAnchor && infoRow && (
        <PortalPopover anchorEl={infoAnchor} boxRef={infoBoxRef} onClose={closeInfo}>
          <div className="infoCard">
            <div className="infoTop">
              <div className="infoSym">{infoSymbol}</div>
              <button className="infoClose" type="button" onClick={closeInfo} title="Close">
                ✕
              </button>
            </div>

            <div className="infoName">{infoCompany}</div>

            <div className="infoRow">
              <div className="infoK">Industry</div>
              <div className="infoV">
                <span className="infoPill">{infoIndustry}</span>
              </div>
            </div>

            <div className="infoRow">
              <div className="infoK">Earnings</div>
              <div className="infoV">{infoEarnings}</div>
            </div>

            <div className="infoHint">Tip: click outside or press Esc.</div>
          </div>
        </PortalPopover>
      )}
    </div>
  );
}
