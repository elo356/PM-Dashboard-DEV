import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import "./settingsPanel.css";

async function authedFetch(url, options = {}) {
  const user = getAuth().currentUser;
  if (!user) throw new Error("No auth");

  const token = await user.getIdToken();
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  return fetch(url, { ...options, headers });
}

function Chip({ tone = "neutral", children }) {
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
      color: "rgba(255,255,255,.92)",
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

export default function SettingsPanel({ onLogout }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [saving, setSaving] = useState(false);

  // form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  // UI messages
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const subTone = useMemo(() => {
    const s = String(me?.subscription_status || "inactive").toLowerCase();
    if (s === "active" || s === "trialing") return "success";
    if (s === "past_due" || s === "unpaid") return "warning";
    if (s === "canceled" || s === "incomplete" || s === "inactive") return "danger";
    return "neutral";
  }, [me]);

  async function loadMe() {
    setLoading(true);
    setErr("");
    setOkMsg("");
    try {
      const res = await authedFetch("/api/me");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load profile");

      setMe(data);

      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setPhone(data.phone || "");
    } catch (e) {
      console.error(e);
      setMe(null);
      setErr(e?.message || "Could not load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function onSaveProfile() {
    setErr("");
    setOkMsg("");
    try {
      setSaving(true);
      const res = await authedFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save changes");

      await loadMe();
      setOkMsg("Saved.");
    } catch (e) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onOpenBillingPortal() {
    setErr("");
    setOkMsg("");
    try {
      const res = await authedFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not open billing portal");
      if (!data?.url) throw new Error("Missing billing portal URL");
      window.location.href = data.url;
    } catch (e) {
      setErr(e?.message || "Error");
    }
  }

  async function onDeleteAccount() {
    const ok = confirm("Delete your account? This cannot be undone.");
    if (!ok) return;

    setErr("");
    setOkMsg("");

    try {
      setSaving(true);
      const res = await authedFetch("/api/me", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not delete account");

      window.location.href = "/login";
    } catch (e) {
      setErr(e?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  function fmtDate(x) {
    if (!x) return null;
    const d = new Date(x);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString();
  }

  if (loading) {
    return (
      <section className="card">
        <h2 style={{ margin: 0 }}>Settings</h2>
        <p style={{ opacity: 0.8, marginTop: 8 }}>Loading…</p>
      </section>
    );
  }

  if (!me) {
    return (
      <section className="card">
        <h2 style={{ margin: 0 }}>Settings</h2>
        <p style={{ opacity: 0.8, marginTop: 8 }}>{err || "Could not load your profile."}</p>
        <button className="btnPrimary" onClick={loadMe} style={{ marginTop: 10 }}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="card settingsCard">
      <div className="settingsTop">
        <div>
          <h2 className="settingsTitle">Settings</h2>
          <p className="settingsSubtitle">Update your profile and manage billing.</p>
        </div>

        <div className="settingsChips">
          <Chip tone="info">{String(me.access_level || "user").toUpperCase()}</Chip>
          <Chip tone={subTone}>{String(me.subscription_status || "inactive").toUpperCase()}</Chip>
        </div>
      </div>

      {(err || okMsg) && (
        <div className={"settingsBanner " + (err ? "is-error" : "is-ok")}>
          <span>{err || okMsg}</span>
        </div>
      )}

      {/* Profile */}
      <div className="settingsSection">
        <div className="settingsSectionHead">
          <h3>Profile</h3>
          <span>{me.email || ""}</span>
        </div>

        <div className="settingsStack">
          <label className="settingsField">
            <span className="settingsLabel">First name</span>
            <input className="inputModern" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>

          <label className="settingsField">
            <span className="settingsLabel">Last name</span>
            <input className="inputModern" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>

        </div>

        <div className="settingsActions">
          <button className="btnPrimary" onClick={onSaveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>

          <button className="btnGhost" onClick={loadMe} disabled={saving}>
            Refresh
          </button>
        </div>
      </div>

      {/* Billing */}
      <div className="settingsSection">
        <h3 className="settingsH3">Billing</h3>

        <div className="settingsBillingRow">
          <div>
            Status: <b>{me.subscription_status || "inactive"}</b>
            {me.subscription_end ? (
              <>
                {" "}
                • Renews/ends: <b>{fmtDate(me.subscription_end)}</b>
              </>
            ) : null}
          </div>
        </div>

        <div className="settingsActions">
          <button className="btnPrimary" onClick={onOpenBillingPortal} disabled={saving}>
            Manage subscription
          </button>
        </div>

        <p className="hint" style={{ marginTop: 10 }}>
          * This opens the Stripe customer portal.
        </p>
      </div>

      {/* Logout (para mobile) */}
      <div className="settingsSection">
        <h3 className="settingsH3">Session</h3>
        <div className="settingsActions">
          <button className="btnGhost" onClick={onLogout} disabled={saving}>
            Logout
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="settingsDanger">
        <h3>Danger zone</h3>
        <p>Permanently delete your account and all associated data.</p>

        <div className="settingsActions">
          <button className="btnDanger" onClick={onDeleteAccount} disabled={saving}>
            {saving ? "Processing…" : "Delete account"}
          </button>
        </div>
      </div>
    </section>
  );
}