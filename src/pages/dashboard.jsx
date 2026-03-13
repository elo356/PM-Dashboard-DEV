// Dashboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { logout, watchAuth } from "../firebase/auth";
import { useNavigate } from "react-router-dom";
import "./dashboard.css";
import SettingsPanel from "./settingsPanel";
import AdminPanel from "./adminPanel";
import { getAuth } from "firebase/auth";
import MetricsTable from "./MetricsTable";
import ThemeToggle from "../components/ThemeToggle";
import LegalModal from "../components/LegalModal";
import logoN from "../../Nerion_Logo_EXPORT_NOBG.svg";
import logoFull from "../../logo completo nerion.svg";
import { adaptMarketRows } from "../utils/marketRowAdapters";

const TF_OPTIONS = [
  "1m", "5m", "15m", "30m",
  "1h", "4h", "6h", "12h",
  "1D", "1W", "1M", "1Y",
];

const DAILY_TFS = new Set(["1D", "1W", "1M", "1Y"]);
const TOP_OPTIONS = [5, 10, 20, 50, 100, "all"];

function NavIcon({ kind }) {
  if (kind === "market") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18V6M10 18v-7M16 18v-4M22 18v-9" />
      </svg>
    );
  }
  if (kind === "pro") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.4 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
      </svg>
    );
  }
  if (kind === "admin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.2 1.6 2.8-.3.9 2.7 2.4 1.5-1 2.6 1 2.6-2.4 1.5-.9 2.7-2.8-.3L12 21l-2.2-1.6-2.8.3-.9-2.7L3.7 15.5l1-2.6-1-2.6L6.1 8.8l.9-2.7 2.8.3z" />
        <path d="M12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z" />
      </svg>
    );
  }
  if (kind === "profile") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7 4 12l5 5M4 12h16" />
    </svg>
  );
}

function clampInt(x, lo, hi, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

export default function Dashboard() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("—");
  const [active, setActive] = useState("home");

  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingMe, setLoadingMe] = useState(true);

  // subscription/billing state
  const [sub, setSub] = useState(null);
  const [loadingSub, setLoadingSub] = useState(false);
  const [loadingSubInfo, setLoadingSubInfo] = useState(false);
  const [loadingAutoRenew, setLoadingAutoRenew] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  // table UI state
  const [tf, setTf] = useState("1m");
  const [top, setTop] = useState(50);
  const [rows, setRows] = useState([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableErr, setTableErr] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  //  industry filter state (lives here, because dropdown is here)
  const [industryQ, setIndustryQ] = useState("");

  // debug
  const [lastRaw, setLastRaw] = useState(null);
  const [lastUrl, setLastUrl] = useState("");

  const hasAccess = !!sub?.hasSubscription;
  const [sort, setSort] = useState(null);
  const [legalOpen, setLegalOpen] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    document.body.classList.add("is-dashboard");
    return () => {
      document.body.classList.remove("is-dashboard");
    };
  }, []);

  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const uiRows = useMemo(() => {
    return adaptMarketRows(rows).map((r) => ({
      ...r,
      pctChg: r.pctChg ?? r.pct ?? r.pct_change ?? null,
      d5: r.d5 ?? null,
      d20: r.d20 ?? null,
      m1: r.m1 ?? null,
      m6: r.m6 ?? null,
      ytd: r.ytd ?? null,
      signal: r.signal ?? "NEUTRAL",
      symbol: r.symbol || "-",
    }));
  }, [rows]);

  //  industry options from uiRows
  const industryOptions = useMemo(() => {
    const set = new Set();
    for (const r of uiRows) {
      const ind = String(r.industry ?? "").trim();
      if (ind) set.add(ind);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [uiRows]);

  // Anti-freeze
  const inflightRef = useRef(null);
  const reqIdRef = useRef(0);

  function abortInflight() {
    try {
      inflightRef.current?.abort();
    } catch {}
    inflightRef.current = null;
  }

  useEffect(() => {
    const unsub = watchAuth(async (u) => {
      if (!u) {
        setEmail("");
        setFullName("—");
        setIsAdmin(false);
        setLoadingMe(false);
        nav("/login");
        return;
      }

      setEmail(u.email || "");

      const dn = (u.displayName || "").trim();
      setFullName(dn ? dn : (u.email || "—"));

      try {
        setLoadingMe(true);
        const t = await u.getIdToken();

        const r = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${t}` },
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Failed /api/me");

        setIsAdmin(data?.access_level === "admin");

        const apiName =
          `${(data?.first_name || "").trim()} ${(data?.last_name || "").trim()}`.trim();
        if (apiName) setFullName(apiName);
      } catch (e) {
        console.error("Could not load /api/me:", e);
        setIsAdmin(false);
      } finally {
        setLoadingMe(false);
      }
    });

    return () => unsub();
  }, [nav]);

  async function loadSubscription() {
    setLoadingSubInfo(true);
    try {
      const u = getAuth().currentUser;
      if (!u) throw new Error("No user");
      const t = await u.getIdToken();
      const r = await fetch("/api/billing/subscription", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await r.json();
      setSub(data);
    } catch (e) {
      console.error(e);
      setSub({ hasSubscription: false });
    } finally {
      setLoadingSubInfo(false);
    }
  }

  useEffect(() => { loadSubscription(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    if (success === "1") {
      setActive("billing");
      let tries = 0;
      const t = setInterval(async () => {
        tries++;
        await loadSubscription();
        if (tries >= 10) clearInterval(t);
      }, 1000);
      return () => clearInterval(t);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromPortal = params.get("portal");
    if (fromPortal === "1") {
      setActive("billing");
      loadSubscription();
    }
  }, []);

  useEffect(() => {
    if (active === "billing") loadSubscription();
  }, [active]);

  function fmtUnix(ts) {
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleString();
  }

  async function setAutoRenew(enabled) {
    setLoadingAutoRenew(true);
    try {
      const u = getAuth().currentUser;
      if (!u) throw new Error("No user");
      const t = await u.getIdToken();

      const r = await fetch("/api/billing/auto-renew", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ enabled }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Could not change auto-renew");
      await loadSubscription();
    } catch (e) {
      alert(e.message || "Error");
    } finally {
      setLoadingAutoRenew(false);
    }
  }

  async function openPortal() {
    setLoadingPortal(true);
    try {
      const u = getAuth().currentUser;
      if (!u) throw new Error("No user");
      const t = await u.getIdToken();

      const r = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Could not open portal");
      window.location.href = data.url;
    } catch (e) {
      alert(e.message || "Error");
    } finally {
      setLoadingPortal(false);
    }
  }

  async function onLogout() {
    await logout();
    nav("/login");
  }

  async function onSubscribe(plan) {
    try {
      setLoadingSub(true);

      const u = getAuth().currentUser;
      if (!u) throw new Error("No user");
      const t = await u.getIdToken();

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) throw new Error("Could not create Stripe session");
      const data = await res.json();
      if (!data?.url) throw new Error("Missing Checkout URL");

      window.location.href = data.url;
    } catch (e) {
      alert(e.message || "Subscription error");
    } finally {
      setLoadingSub(false);
    }
  }

  async function loadTable({ tfVal = tf, topVal = top } = {}) {
    if (active !== "home") return;
    if (!hasAccess) return;

    abortInflight();

    const myReqId = ++reqIdRef.current;
    const ctrl = new AbortController();
    inflightRef.current = ctrl;

    const timeoutMs = 6500;
    const timeout = setTimeout(() => {
      try { ctrl.abort(); } catch {}
    }, timeoutMs);

    setLoadingTable(true);
    setTableErr("");

    try {
      const topSafe = clampInt(topVal, 1, 1000, 50);
      const qs = new URLSearchParams({ tf: tfVal, top: String(topSafe) });
      const url = `/api/market/table?${qs.toString()}`;

      setLastUrl(url);

      const j = await fetchJsonSafe(url, { signal: ctrl.signal });

      if (myReqId !== reqIdRef.current) return;
      const list = Array.isArray(j.rows) ? j.rows : [];

      setLastRaw(j);
      setRows(list);
      setLastUpdate(Date.now());
    } catch (e) {
      if (myReqId !== reqIdRef.current) return;

      // no borres datos si fue buffering
      if (e?.name !== "AbortError") {
        setRows([]);
        setLastRaw(null);
      }

      if (e?.name === "AbortError") {
        setTableErr("Buffering...");
      } else {
        setTableErr(e?.message || "Error");
      }
    } finally {
      clearTimeout(timeout);
      if (myReqId === reqIdRef.current) {
        setLoadingTable(false);
        inflightRef.current = null;
      }
    }
  }

  useEffect(() => {
    if (active !== "home") return;
    if (!hasAccess) return;

    loadTable({ tfVal: tf, topVal: top });
    return () => abortInflight();
    // eslint-disable-next-line react-hooks/exhaustive-dep
  }, [active, hasAccess, tf, top]);

  useEffect(() => {
    if (active !== "home") return;
    if (!hasAccess) return;
    if (!autoRefresh) return;

    const id = setInterval(() => {
      loadTable({ tfVal: tf, topVal: top });
    }, 10_000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hasAccess, autoRefresh, tf, top]);

  function onExportJson() {
    if (!lastRaw) {
      alert("No JSON loaded yet.");
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      tf,
      top,
      source: DAILY_TFS.has(tf) ? "hist" : "live",
      url: lastUrl,
      raw: lastRaw,
      tableRows: rows,
    };

    const safeTf = tf.replace("/", "-");
    downloadJson(`cache-${DAILY_TFS.has(tf) ? "hist" : "live"}-${safeTf}.json`, payload);
  }

  function openCookieSettings() {
    const cookiebot = window?.Cookiebot;
    if (cookiebot && typeof cookiebot.renew === "function") {
      cookiebot.renew();
      return;
    }
    alert("Cookie preferences are not available right now. Please reload and try again.");
  }

  const showLegalDoc = legalOpen === "terms" || legalOpen === "privacy";
  const mobileNavItems = [
    { key: "home", label: "Market", kind: "market" },
    { key: "billing", label: "Pro", kind: "pro" },
    ...((!loadingMe && isAdmin) ? [{ key: "admin", label: "Admin", kind: "admin" }] : []),
    { key: "settings", label: "Profile", kind: "profile" },
  ];
  const activeMobileIndex = Math.max(
    0,
    mobileNavItems.findIndex((item) => item.key === active),
  );
  const activeMobileCenterRaw = ((activeMobileIndex + 0.5) / mobileNavItems.length) * 100;
  const activeMobileCenterSafe = Math.max(16, Math.min(84, activeMobileCenterRaw));
  const activeMobileCenter = `${activeMobileCenterSafe}%`;

  return (
    <div className="dash">
      {loadingSub && (
        <>
          <div className="topLoader" aria-hidden="true">
            <div className="topLoader__bar" />
          </div>

          <div className="dashOverlay" role="status" aria-live="polite">
            <div className="dashOverlay__box">
              <div className="spinner" aria-hidden="true" />
              <div>
                <div className="dashOverlay__title">Opening Stripe…</div>
                <div className="dashOverlay__sub">Do not close this tab.</div>
              </div>
            </div>
          </div>
        </>
      )}

      <aside className={"dash__sidebar " + (isSidebarOpen ? "is-open" : "is-collapsed")}>
        <div className="dash__sidebarTop">
          <div className="dash__brand">
            {isSidebarOpen ? (
              <img src={logoFull} alt="Nerion" className="dash__brandFull" />
            ) : (
              <img src={logoN} alt="Nerion logo" className="dash__brandLogo" />
            )}
          </div>
          <div className="dash__sidebarActions">
            <button
              type="button"
              className="dash__sidebarCtrl"
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              onClick={() => setIsSidebarOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {isSidebarOpen ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}
              </svg>
            </button>
          </div>
        </div>

        <nav className="dash__nav">
          <button
            className={"dash__link " + (active === "home" ? "is-active" : "")}
            onClick={() => setActive("home")}
            disabled={loadingSub}
            title="Market Overview"
          >
            <span className="dash__linkRow">
              <span className="dash__linkMain">
                <span className="dash__linkIcon" aria-hidden="true"><NavIcon kind="market" /></span>
                <span className="dash__linkTxt">Market Overview</span>
              </span>
            </span>
          </button>

          <button
            className={"dash__link " + (active === "billing" ? "is-active" : "")}
            onClick={() => setActive("billing")}
            disabled={loadingSub}
            title="Pro"
          >
            <span className="dash__linkRow">
              <span className="dash__linkMain">
                <span className="dash__linkIcon" aria-hidden="true"><NavIcon kind="pro" /></span>
                <span className="dash__linkTxt">Pro</span>
              </span>
              <span className="dash__crown" aria-hidden="true">PRO</span>
            </span>
          </button>

          {!loadingMe && isAdmin && (
            <button
              className={"dash__link " + (active === "admin" ? "is-active" : "")}
              onClick={() => setActive("admin")}
              disabled={loadingSub}
              title="Admin Panel"
            >
              <span className="dash__linkRow">
                <span className="dash__linkMain">
                  <span className="dash__linkIcon" aria-hidden="true"><NavIcon kind="admin" /></span>
                  <span className="dash__linkTxt">Admin Panel</span>
                </span>
              </span>
            </button>
          )}
        </nav>

        <div className="dash__bottom">
          <button
            className={"dash__link dash__link--secondary " + (active === "settings" ? "is-active" : "")}
            onClick={() => setActive("settings")}
            disabled={loadingSub}
            title="Profile"
          >
            <span className="dash__linkRow">
              <span className="dash__linkMain">
                <span className="dash__linkIcon" aria-hidden="true"><NavIcon kind="profile" /></span>
                <span className="dash__linkTxt">Profile</span>
              </span>
            </span>
          </button>

          <div className="dash__user">
            <div className="dash__userLabel">Logged in as:</div>
            <div className="dash__userEmail">{fullName}</div>
          </div>

          <button className="dash__logout" onClick={onLogout} disabled={loadingSub} title="Logout">
            <span className="dash__linkMain">
              {!isSidebarOpen && (
                <span className="dash__linkIcon" aria-hidden="true"><NavIcon kind="logout" /></span>
              )}
              <span className="dash__linkTxt">Logout</span>
            </span>
          </button>

          <div className="dash__legalLinks" aria-label="Legal links">
            <button
              type="button"
              className="dash__legalBtn"
              onClick={() => setLegalOpen("terms")}
            >
              Terms
            </button>
            <button
              type="button"
              className="dash__legalBtn"
              onClick={() => setLegalOpen("privacy")}
            >
              Privacy
            </button>
            <button
              type="button"
              className="dash__legalBtn"
              onClick={openCookieSettings}
            >
              Cookies
            </button>
            <button
              type="button"
              className="dash__legalBtn"
              onClick={() => setLegalOpen("disclaimer")}
            >
              Disclaimer
            </button>
          </div>

          <div className="dash__powered" aria-label="Powered by Valarik">
            <div className="dash__poweredBrand">
              Powered by <b>Valarik</b>
            </div>
            <div className="dash__copyright">© 2026 Valarik LLC. All rights reserved.</div>
          </div>
        </div>
      </aside>

      <main className="dash__main">
        {active === "home" && (
          <section className="homeStack">
            <div className="homeCard homeCard--header">
              <header className="panelHeader panelHeader--home">
                <div className="panelHeader__titleRow">
                  <h2 className="panelTitle">Market Overview</h2>
                  <div className="panelHeader__right">
                    <ThemeToggle className="panelThemeToggle" disabled={loadingSub} />
                  </div>
                </div>
                <div className="panelHeader__meta panelHeader__meta--homeBottom">
                  {lastUpdate ? `Last update: ${new Date(lastUpdate).toLocaleTimeString()}` : "—"}
                </div>

                {loadingSubInfo ? (
                  <p className="panelNote">Loading access…</p>
                ) : !hasAccess ? (
                  <div className="panelPaywall">
                    <p className="panelNote">
                      🔒 <b>Subscribe to get access</b> to the dashboard.
                    </p>

                    <div className="panelActions">
                      <button className="btnPrimary" onClick={() => setActive("billing")} disabled={loadingSub}>
                        View plans
                      </button>

                      <button className="btnPrimary" onClick={() => onSubscribe("monthly")} disabled={loadingSub}>
                        {loadingSub ? "Opening Checkout…" : "Subscribe (Monthly)"}
                      </button>
                    </div>

                    <p className="hint">* After payment, come back here and it will unlock automatically.</p>
                  </div>
                ) : (
                  <>
                    <div className="controlsRowWrap">
                      <div className="controlsRow">
                        <div className="field">
                          <div className="fieldLabel">Timeframe</div>
                          <select value={tf} onChange={(e) => setTf(e.target.value)} className="selectModern">
                            {TF_OPTIONS.map((x) => (
                              <option key={x} value={x}>{x}</option>
                            ))}
                          </select>
                        </div>

                        <div className="field">
                          <div className="fieldLabel">Rows</div>
                          <select
                            value={top === 208 ? "all" : top}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTop(v === "all" ? 208 : clampInt(v, 1, 208, 50));
                            }}
                            className="selectModern"
                          >
                            {TOP_OPTIONS.map((n) => (
                              <option key={String(n)} value={String(n)}>
                                {n === "all" ? "All" : n}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/*ndustry dropdown al lado de Rows */}
                        <div className="field field--industry">
                          <div className="fieldLabel">Industry</div>
                          <select
                            value={industryQ}
                            onChange={(e) => setIndustryQ(e.target.value)}
                            className="selectModern"
                          >
                            <option value="">All</option>
                            {industryOptions.map((ind) => (
                              <option key={ind} value={ind}>{ind}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {tableErr && <p className="panelError">Error: {tableErr}</p>}

                  </>
                )}
              </header>
            </div>

            <div className="homeCard homeCard--table">
              <div className="panelBody">
                {!hasAccess ? null : uiRows.length === 0 ? (
                  <div className="panelEmpty">
                    {loadingTable ? "Loading…" : "No data received yet"}
                  </div>
                ) : (
                  <MetricsTable
                    rows={uiRows}
                    sort={sort}
                    setSort={setSort}
                    industryQ={industryQ}
                    setIndustryQ={setIndustryQ}
                    industryOptions={industryOptions}
                  />
                )}
              </div>
            </div>
          </section>
        )}

        {active === "billing" && (
          <section className="panel">
            <header className="panelHeader">
              <div className="panelHeader__titleRow">
                <h2 className="panelTitle">Pro</h2>
                <div className="panelHeader__meta">
                  {loadingSubInfo ? "Loading…" : (sub?.hasSubscription ? "Active" : "Inactive")}
                </div>
              </div>

              {loadingSubInfo ? (
                <p className="panelNote">Loading subscription…</p>
              ) : sub?.hasSubscription ? (
                <>
                  <div className="proGrid">
                    <div className="proCard">
                      <div className="proLabel">Status</div>
                      <div className="proValue">{sub.status || "active"}</div>
                    </div>

                    <div className="proCard">
                      <div className="proLabel">Renews / ends</div>
                      <div className="proValue">{fmtUnix(sub.current_period_end)}</div>
                    </div>

                    <div className="proCard">
                      <div className="proLabel">Auto-renew</div>
                      <div className="proValue">
                        {sub.cancel_at_period_end ? "OFF (cancels at period end)" : "ON"}
                      </div>
                    </div>
                  </div>

                  <div className="proActions">
                    <button
                      className="btnPrimary"
                      onClick={() => setAutoRenew(sub.cancel_at_period_end)}
                      disabled={loadingAutoRenew}
                    >
                      {loadingAutoRenew
                        ? "Updating…"
                        : sub.cancel_at_period_end
                          ? "Turn on auto-renew"
                          : "Turn off auto-renew"}
                    </button>

                    <button className="btnPrimary" onClick={openPortal} disabled={loadingPortal}>
                      {loadingPortal ? "Opening…" : "Manage in Stripe"}
                    </button>

                    <button className="btnGhost" onClick={loadSubscription}>
                      Refresh
                    </button>
                  </div>

                  <p className="hint">* Stripe portal: update card, cancel, invoices, etc.</p>
                </>
              ) : (
                <>
                  <p className="panelNote">Unlock full access with Pro.</p>

                  <div className="pricingGrid">
                    <div className="pricingCard">
                      <div className="pricingHeader">
                        <div className="pricingName">Monthly</div>
                        <div className="pricingPrice">
                          $150<span>/mo</span>
                        </div>
                      </div>

                      <ul className="pricingFeatures">
                        <li>Full dashboard access</li>
                        <li>All timeframes</li>
                        <li>Live updates</li>
                      </ul>

                      <button
                        className="btnPrimary pricingBtn"
                        onClick={() => onSubscribe("monthly")}
                        disabled={loadingSub}
                      >
                        {loadingSub ? "Opening…" : "Start Monthly"}
                      </button>
                    </div>

                    <div className="pricingCard pricingCard--highlight">
                      <div className="pricingBadge">Best Value</div>

                      <div className="pricingHeader">
                        <div className="pricingName">3 Months</div>
                        <div className="pricingPrice">
                          $390<span>/3mo</span>
                        </div>
                      </div>

                      <ul className="pricingFeatures">
                        <li>Full dashboard access</li>
                        <li>All timeframes</li>
                        <li>Live updates</li>
                      </ul>

                      <button
                        className="btnPrimary pricingBtn"
                        onClick={() => onSubscribe("3months")}
                        disabled={loadingSub}
                      >
                        {loadingSub ? "Opening…" : "Start 3 Months"}
                      </button>
                    </div>

                    <div className="pricingCard">
                      <div className="pricingHeader">
                        <div className="pricingName">Yearly</div>
                        <div className="pricingPrice">
                          $1500<span>/yr</span>
                        </div>
                      </div>

                      <ul className="pricingFeatures">
                        <li>Full dashboard access</li>
                        <li>All timeframes</li>
                        <li>Live updates</li>
                      </ul>

                      <button
                        className="btnPrimary pricingBtn"
                        onClick={() => onSubscribe("yearly")}
                        disabled={loadingSub}
                      >
                        {loadingSub ? "Opening…" : "Start Yearly"}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btnGhost" onClick={loadSubscription} disabled={loadingSub}>
                      Refresh
                    </button>
                  </div>

                  <p className="hint">Secure payments powered by Stripe.</p>
                </>
              )}
            </header>

            <div className="panelBody">
              <div className="panelEmpty" style={{ paddingTop: 0 }} />
            </div>
          </section>
        )}

        {active === "settings" && (
          <SettingsPanel
            onLogout={onLogout}
            fullName={fullName}
            email={email}
          />
        )}

        {active === "admin" && isAdmin && <AdminPanel />}

        <footer className="dashMobileFooter" aria-label="Legal and company information">
          <div className="dashMobileFooter__legalLinks">
            <button
              type="button"
              className="dashMobileFooter__legalBtn"
              onClick={() => setLegalOpen("terms")}
            >
              Terms
            </button>
            <button
              type="button"
              className="dashMobileFooter__legalBtn"
              onClick={() => setLegalOpen("privacy")}
            >
              Privacy
            </button>
            <button
              type="button"
              className="dashMobileFooter__legalBtn"
              onClick={openCookieSettings}
            >
              Cookies
            </button>
            <button
              type="button"
              className="dashMobileFooter__legalBtn"
              onClick={() => setLegalOpen("disclaimer")}
            >
              Disclaimer
            </button>
          </div>
          <div className="dashMobileFooter__poweredBrand">
            Powered by <b>Valarik</b>
          </div>
          <div className="dashMobileFooter__copyright">© 2026 Valarik LLC. All rights reserved.</div>
        </footer>
      </main>

      <nav className="mnav" aria-label="Mobile navigation">
        <div className="mnav__row">
          <span
            className="mnav__curve"
            style={{ left: activeMobileCenter }}
            aria-hidden="true"
          />
          {mobileNavItems.map((item) => (
            <button
              key={item.key}
              className={"mnav__btn " + (active === item.key ? "is-active" : "")}
              onClick={() => setActive(item.key)}
              disabled={loadingSub}
            >
              <span className="mnav__ico" aria-hidden="true"><NavIcon kind={item.kind} /></span>
              <span className="mnav__txt">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {(showLegalDoc || legalOpen === "disclaimer") && (
        <LegalModal kind={legalOpen} onClose={() => setLegalOpen("")} />
      )}

    </div>
  );
}
