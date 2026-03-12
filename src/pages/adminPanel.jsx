import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getAuth } from "firebase/auth";

async function api(path, opts = {}) {
  const auth = getAuth();
  const u = auth.currentUser;
  if (!u) throw new Error("No authenticated user");

  // Force refresh (helps after role updates)
  const token = await u.getIdToken(true);

  const r = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  // Read as text to capture non-JSON errors too
  const text = await r.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!r.ok) {
    const msg = data?.error || data?.message || data?.raw || `HTTP ${r.status}`;
    throw new Error(`${msg} (HTTP ${r.status})`);
  }
  return data;
}

function Badge({ tone = "neutral", children }) {
  const style = useMemo(() => {
    const base = {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 12,
      lineHeight: "18px",
      border: "1px solid rgba(255,255,255,.12)",
      background: "rgba(255,255,255,.06)",
      color: "rgba(255,255,255,.9)",
      whiteSpace: "nowrap",
    };

    const tones = {
      neutral: {},
      success: { background: "rgba(34,197,94,.12)", borderColor: "rgba(34,197,94,.25)" },
      danger: { background: "rgba(239,68,68,.12)", borderColor: "rgba(239,68,68,.25)" },
      info: { background: "rgba(59,130,246,.12)", borderColor: "rgba(59,130,246,.25)" },
      warning: { background: "rgba(245,158,11,.12)", borderColor: "rgba(245,158,11,.25)" },
    };

    return { ...base, ...(tones[tone] || tones.neutral) };
  }, [tone]);

  return <span style={style}>{children}</span>;
}

function Btn({ variant = "primary", disabled, onClick, children, title, style }) {
  const base = {
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 14,
    border: "1px solid rgba(255,255,255,.12)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    background: "rgba(255,255,255,.10)",
    color: "white",
    userSelect: "none",
  };

  const variants = {
    primary: {},
    ghost: { background: "transparent" },
  };

  return (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      style={{ ...base, ...(variants[variant] || {}), ...(style || {}) }}
    >
      {children}
    </button>
  );
}

function MenuItem({ tone = "neutral", disabled, onClick, children }) {
  return (
    <button
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 10px",
        borderRadius: 10,
        border: "1px solid transparent",
        background: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        color: "rgba(255,255,255,.92)",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ color: tone === "danger" ? "rgba(255,255,255,.95)" : undefined }}>
        {children}
      </span>
    </button>
  );
}

function hasData(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return v;
  if (typeof v === "object") {
    if (typeof v.toDate === "function") return true; // Firestore Timestamp
    if ("seconds" in v || "_seconds" in v) return true;
  }
  return true;
}

function parseMaybeBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(s)) return true;
    if (["false", "0", "no", "n"].includes(s)) return false;
  }
  return null;
}

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyUid, setBusyUid] = useState(null);
  const [error, setError] = useState("");

  // menu state (portal)
  const [openMenuUid, setOpenMenuUid] = useState(null);
  const [menuPos, setMenuPos] = useState(null); // { top, left }
  const menuRef = useRef(null);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/admin/users", { method: "GET", headers: {} });
      setUsers(data.users || []);
    } catch (e) {
      setError(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // Close menu on outside click / ESC
  useEffect(() => {
    function onDocDown(e) {
      if (!openMenuUid) return;
      if (e.key === "Escape") {
        setOpenMenuUid(null);
        return;
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuUid(null);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onDocDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onDocDown);
    };
  }, [openMenuUid]);

  // Reposition menu on scroll/resize while open
  useEffect(() => {
    function reposition() {
      // If you want perfect tracking, we’d store anchor rect each time.
      // For now: keep current position (good enough).
      // You can enhance later if needed.
    }
    if (!openMenuUid) return;
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [openMenuUid]);

  async function runAction(uid, fn, confirmText) {
    setError("");
    if (confirmText) {
      const ok = window.confirm(confirmText);
      if (!ok) return;
    }
    setBusyUid(uid);
    try {
      await fn();
      await loadUsers();
      setOpenMenuUid(null);
    } catch (e) {
      setError(e?.message || "Action failed");
    } finally {
      setBusyUid(null);
    }
  }

  const myUid = useMemo(() => {
    try {
      return getAuth().currentUser?.uid || null;
    } catch {
      return null;
    }
  }, []);

  // Account enable/disable
  const disableAccount = (uid) =>
    api(`/api/admin/users/${uid}/disable`, { method: "POST", body: JSON.stringify({}) });

  const enableAccount = (uid) =>
    api(`/api/admin/users/${uid}/enable`, { method: "POST", body: JSON.stringify({}) });

  // Moderators (legacy free_pass endpoints)
  const grantModerator = (uid) =>
    api(`/api/admin/users/${uid}/freepass/grant`, { method: "POST", body: JSON.stringify({}) });

  const revokeModerator = (uid) =>
    api(`/api/admin/users/${uid}/freepass/revoke`, { method: "POST", body: JSON.stringify({}) });

  // Admin access via access_level (matches Dashboard logic)
  // Needs backend: POST /api/admin/users/:uid/access-level  body: { access_level }
  const setAccessLevel = (uid, access_level) =>
    api(`/api/admin/users/${uid}/access-level`, {
      method: "POST",
      body: JSON.stringify({ access_level }),
    });

  function openMenuFor(uid, btnEl) {
    const rect = btnEl.getBoundingClientRect();
    const menuWidth = 280;

    const top = rect.bottom + 8 + window.scrollY;

    // Prefer align-right with the button, clamp into viewport
    let left = rect.right - menuWidth + window.scrollX;
    const pad = 12;
    const maxLeft = window.scrollX + window.innerWidth - menuWidth - pad;
    const minLeft = window.scrollX + pad;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    setOpenMenuUid(uid);
    setMenuPos({ top, left });
  }

  return (
    <section
      className="card"
      style={{
        padding: 18,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,.10)",
        background: "rgba(255,255,255,.04)",
        minHeight: "80vh", // 👈 alarga el card (cámbialo a gusto)
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 0.2 }}>Admin Panel</h2>
          <p style={{ margin: "6px 0 0", opacity: 0.8, fontSize: 13 }}>
            Manage accounts, moderators, and admin access.
          </p>
        </div>

        <Btn variant="ghost" onClick={loadUsers} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Btn>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,.25)",
            background: "rgba(239,68,68,.10)",
          }}
        >
          <span style={{ fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* Wrapper keeps horizontal scroll, but menu is portal so it won't clip anyway */}
      <div
        style={{
          marginTop: 14,
          overflowX: "auto",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,.10)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,.04)" }}>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12, opacity: 0.8 }}>User</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12, opacity: 0.8 }}>Access level</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12, opacity: 0.8 }}>Status</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12, opacity: 0.8 }}>Moderators</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12, opacity: 0.8 }}>Admin</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12, opacity: 0.8 }}>Terms</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12, opacity: 0.8 }}>Privacy</th>
              <th style={{ textAlign: "right", padding: 12, fontSize: 12, opacity: 0.8 }}>Manage</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => {
              const uid = u.id;
              const isBusy = busyUid === uid;

              const disabled = !!u.disabled;

              // Compatibility while backend still returns free_pass
              const isModerator = !!(u.moderator ?? u.moderators ?? u.free_pass);

              // Dashboard: access_level === "admin"
              const isAdmin = u.access_level === "admin";

              const termsExplicit = parseMaybeBool(u.termsAccepted ?? u.terms_accepted ?? u.accepted_terms);
              const privacyExplicit = parseMaybeBool(u.privacyAccepted ?? u.privacy_accepted ?? u.accepted_privacy);

              const termsAccepted = termsExplicit !== null
                ? termsExplicit
                : (
                  hasData(u.terms_accepted_at) ||
                  hasData(u.acceptedAt) ||
                  hasData(u.termsVersion) ||
                  hasData(u.terms_version)
                );

              const privacyAccepted = privacyExplicit !== null
                ? privacyExplicit
                : (
                  hasData(u.privacy_accepted_at) ||
                  hasData(u.acceptedAt) ||
                  hasData(u.privacyVersion) ||
                  hasData(u.privacy_version)
                );

              const isSelf = myUid && myUid === uid;

              return (
                <tr key={uid} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 14 }}>{u.email || uid}</span>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>{uid}</span>
                    </div>
                  </td>

                  <td style={{ padding: 12 }}>
                    <Badge tone="info">{u.access_level || "user"}</Badge>
                  </td>

                  <td style={{ padding: 12 }}>
                    {disabled ? <Badge tone="danger">Disabled</Badge> : <Badge tone="success">Active</Badge>}
                  </td>

                  <td style={{ padding: 12 }}>
                    {isModerator ? <Badge tone="warning">Yes</Badge> : <Badge tone="neutral">No</Badge>}
                  </td>

                  <td style={{ padding: 12 }}>
                    {isAdmin ? <Badge tone="danger">Yes</Badge> : <Badge tone="neutral">No</Badge>}
                  </td>

                  <td style={{ padding: 12 }}>
                    {termsAccepted ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>}
                  </td>

                  <td style={{ padding: 12 }}>
                    {privacyAccepted ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>}
                  </td>

                  <td style={{ padding: 12, textAlign: "right" }}>
                    <Btn
                      disabled={loading}
                      onClick={(e) => {
                        const next = openMenuUid === uid ? null : uid;
                        if (!next) {
                          setOpenMenuUid(null);
                          return;
                        }
                        openMenuFor(uid, e.currentTarget);
                      }}
                      style={{ padding: "8px 10px" }}
                      title="Open actions"
                    >
                      {isBusy ? "Working…" : "Manage ▾"}
                    </Btn>
                  </td>

                  {/* Portal menu rendered outside table to avoid clipping */}
                  {openMenuUid === uid && menuPos
                    ? createPortal(
                        <div
                          ref={menuRef}
                          style={{
                            position: "absolute",
                            top: menuPos.top,
                            left: menuPos.left,
                            width: 280,
                            zIndex: 9999,
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,.12)",
                            background: "rgba(18,18,22,.98)",
                            boxShadow: "0 18px 50px rgba(0,0,0,.45)",
                            padding: 8,
                          }}
                        >
                          <div style={{ padding: "8px 10px 6px", opacity: 0.8, fontSize: 12 }}>
                            Actions for{" "}
                            <span style={{ opacity: 0.95 }}>{u.email || uid}</span>
                          </div>

                          {/* Account */}
                          {disabled ? (
                            <MenuItem
                              disabled={isBusy}
                              onClick={() =>
                                runAction(uid, () => enableAccount(uid), "Enable this account again?")
                              }
                            >
                              ✅ Enable account
                            </MenuItem>
                          ) : (
                            <MenuItem
                              tone="danger"
                              disabled={isBusy}
                              onClick={() =>
                                runAction(
                                  uid,
                                  () => disableAccount(uid),
                                  "Disable this account? The user will be blocked from accessing the app."
                                )
                              }
                            >
                              ⛔ Disable account
                            </MenuItem>
                          )}

                          <div
                            style={{
                              height: 1,
                              background: "rgba(255,255,255,.10)",
                              margin: "8px 6px",
                            }}
                          />

                          {/* Moderator */}
                          {isModerator ? (
                            <MenuItem
                              disabled={isBusy}
                              onClick={() =>
                                runAction(uid, () => revokeModerator(uid), "Revoke moderator privileges?")
                              }
                            >
                              🔧 Revoke moderator
                            </MenuItem>
                          ) : (
                            <MenuItem
                              disabled={isBusy}
                              onClick={() =>
                                runAction(uid, () => grantModerator(uid), "Grant moderator privileges?")
                              }
                            >
                              🔧 Grant moderator
                            </MenuItem>
                          )}

                          <div
                            style={{
                              height: 1,
                              background: "rgba(255,255,255,.10)",
                              margin: "8px 6px",
                            }}
                          />

                        

                         
                        </div>,
                        document.body
                      )
                    : null}
                </tr>
              );
            })}

            {!loading && users.length === 0 && (
              <tr>
                <td style={{ padding: 14, opacity: 0.8 }} colSpan={8}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>


    </section>
  );
}
