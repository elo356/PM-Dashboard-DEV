import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, recoverPassword, signup, watchAuth } from "../firebase/auth";
import { createUserProfile } from "../firebase/user";
import ThemeToggle from "../components/ThemeToggle";
import LegalModal from "../components/LegalModal";
import { LEGAL_VERSIONS } from "../legal/legalContent";
import logoFull from "../../logo completo nerion.svg";
import "./landing.css";

async function getPublicIp() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);

  try {
    const r = await fetch("https://api64.ipify.org?format=json", { signal: ctrl.signal });
    if (!r.ok) return null;
    const data = await r.json();
    const ip = String(data?.ip || "").trim();
    return ip || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function EyeOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-6 10-6c2.4 0 4.4.8 6 1.9M22 12s-3.6 6-10 6c-2.4 0-4.4-.8-6-1.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m3 3 18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Landing({ initialMode = "login" }) {
  const demoSymbols = ["AAPL", "TSLA", "MSFT"];
  const demoTfs = ["5m", "1h", "1D"];
  const demoData = {
    AAPL: {
      companyName: "Apple Inc.",
      industry: "Technology Hardware",
      byTf: {
        "5m": { rankFlow: 7, signal: "BULLISH", ptfav: "12.4M", flowPctTotal: "+0.41%", momScore: "+0.62%", targetWt: "5.6%" },
        "1h": { rankFlow: 5, signal: "BULLISH", ptfav: "18.1M", flowPctTotal: "+0.92%", momScore: "+0.88%", targetWt: "5.9%" },
        "1D": { rankFlow: 3, signal: "BULLISH", ptfav: "24.7M", flowPctTotal: "+1.38%", momScore: "+1.24%", targetWt: "6.1%" },
      },
    },
    TSLA: {
      companyName: "Tesla Inc.",
      industry: "Automobile Manufacturers",
      byTf: {
        "5m": { rankFlow: 21, signal: "NEUTRAL", ptfav: "10.2M", flowPctTotal: "-0.23%", momScore: "+0.11%", targetWt: "3.7%" },
        "1h": { rankFlow: 14, signal: "BULLISH", ptfav: "14.9M", flowPctTotal: "+0.34%", momScore: "+0.49%", targetWt: "4.1%" },
        "1D": { rankFlow: 9, signal: "BULLISH", ptfav: "20.3M", flowPctTotal: "+2.12%", momScore: "+1.77%", targetWt: "4.8%" },
      },
    },
    MSFT: {
      companyName: "Microsoft Corp.",
      industry: "Software Infrastructure",
      byTf: {
        "5m": { rankFlow: 12, signal: "BULLISH", ptfav: "11.6M", flowPctTotal: "+0.18%", momScore: "+0.44%", targetWt: "5.2%" },
        "1h": { rankFlow: 8, signal: "BULLISH", ptfav: "16.8M", flowPctTotal: "+0.61%", momScore: "+0.73%", targetWt: "5.5%" },
        "1D": { rankFlow: 6, signal: "BULLISH", ptfav: "22.9M", flowPctTotal: "+1.05%", momScore: "+1.09%", targetWt: "5.8%" },
      },
    },
  };

  const nav = useNavigate();
  const [mode, setMode] = useState(initialMode === "signup" ? "signup" : "login");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [legalOpen, setLegalOpen] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [acceptLegal, setAcceptLegal] = useState(false);
  const [demoSymbol, setDemoSymbol] = useState("AAPL");
  const [demoTf, setDemoTf] = useState("5m");
  const demoSelection = demoData[demoSymbol];
  const demoMetrics = demoSelection.byTf[demoTf];

  useEffect(() => {
    setMode(initialMode === "signup" ? "signup" : "login");
  }, [initialMode]);

  useEffect(() => {
    const unsub = watchAuth((u) => {
      if (!u) return;
      if (u.emailVerified) {
        nav("/dashboard", { replace: true });
      } else {
        nav("/check-email", { replace: true });
      }
    });
    return () => unsub();
  }, [nav]);

  function friendlyAuthError(e) {
    if (e?.code === "auth/email-already-in-use") return "That email is already registered.";
    if (e?.code === "auth/invalid-email") return "That email is not valid.";
    if (e?.code === "auth/weak-password") return "The password is too weak.";
    if (e?.code === "auth/user-not-found") return "No account found with that email.";
    if (e?.code === "auth/wrong-password") return "Incorrect password.";
    return e?.message || "An error occurred.";
  }

  function validateSignup() {
    if (!firstName.trim()) return "Please enter your first name.";
    if (!lastName.trim()) return "Please enter your last name.";
    if (!email.trim()) return "Please enter your email.";
    if (!pass) return "Please enter a password.";
    if (pass.length < 6) return "Password must be at least 6 characters long.";
    if (pass !== pass2) return "Passwords do not match.";
    if (!acceptLegal) return "You must accept Terms and Privacy Policy to create your account.";
    return null;
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      await login(email.trim(), pass);
      nav("/dashboard", { replace: true });
    } catch (e2) {
      if (e2?.code === "auth/email-not-verified") {
        nav("/check-email", { replace: true });
        return;
      }
      setErr(friendlyAuthError(e2));
    } finally {
      setLoading(false);
    }
  }

  async function onSignupSubmit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    const v = validateSignup();
    if (v) {
      setErr(v);
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim();
      const cleanFirst = firstName.trim();
      const cleanLast = lastName.trim();
      const acceptedAtIso = new Date().toISOString();

      const [user, acceptedIP] = await Promise.all([signup(cleanEmail, pass), getPublicIp()]);
      const legalPayload = {
        termsAccepted: true,
        termsVersion: LEGAL_VERSIONS.terms,
        privacyVersion: LEGAL_VERSIONS.privacy,
        acceptedAt: acceptedAtIso,
        acceptedIP: acceptedIP || "unknown",
      };

      await createUserProfile({
        uid: user.uid,
        email: user.email,
        firstName: cleanFirst,
        lastName: cleanLast,
        legalAcceptance: legalPayload,
      });

      nav("/check-email");
    } catch (e2) {
      setErr(friendlyAuthError(e2));
    } finally {
      setLoading(false);
    }
  }

  async function onRecover() {
    setErr("");
    setMsg("");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErr("Type your email above so we can send the reset link.");
      return;
    }

    try {
      await recoverPassword(cleanEmail);
      setMsg("Check your inbox and spam folder to reset your password.");
    } catch (e) {
      setErr(friendlyAuthError(e));
    }
  }

  return (
    <section className="landingPage">
      <div className="landingBgOrb landingBgOrb--one" />
      <div className="landingBgOrb landingBgOrb--two" />

      <div className="landingWrap">
        <article className="landingInfo">
          <div className="landingPill">Nerion by Valarik</div>
          <h1>
            Understand the Flow Behind the Market
          </h1>
          <p>
            Advanced analytics designed to surface institutional capital activity and evolving trend dynamics
            within a clean, decision-focused environment.
          </p>

          <div className="landingStats">
            <div className="landingStat">
              <span>Liquidity Activity</span>
            </div>
            <div className="landingStat">
              <span>Trend Acceleration</span>
            </div>
            <div className="landingStat">
              <span>Ranked Signals</span>
            </div>
          </div>

          <div className="landingDemo">
            <div className="landingDemo__title">Try sample data</div>

            <div className="landingDemo__chips">
              {demoSymbols.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  className={"landingDemo__chip " + (demoSymbol === sym ? "is-on" : "")}
                  onClick={() => setDemoSymbol(sym)}
                >
                  {sym}
                </button>
              ))}
            </div>

            <div className="landingDemo__chips">
              {demoTfs.map((tfItem) => (
                <button
                  key={tfItem}
                  type="button"
                  className={"landingDemo__chip landingDemo__chip--tf " + (demoTf === tfItem ? "is-on" : "")}
                  onClick={() => setDemoTf(tfItem)}
                >
                  {tfItem}
                </button>
              ))}
            </div>

            <div className="landingDemo__card" role="status" aria-live="polite">
              <div className="landingDemo__line">
                <span>Timeframe</span>
                <b>{demoTf}</b>
              </div>
              <div className="landingDemo__line">
                <span>Company</span>
                <b>{demoSelection.companyName}</b>
              </div>
              <div className="landingDemo__line">
                <span>Industry</span>
                <b>{demoSelection.industry}</b>
              </div>

              <div className="landingDemo__metrics" aria-label="Dashboard sample metrics">
                <div className="landingDemo__metric"><span>Rank</span><b>{demoMetrics.rankFlow}</b></div>
                <div className="landingDemo__metric"><span>Symbol</span><b>{demoSymbol}</b></div>
                <div className="landingDemo__metric"><span>Regime</span><b>{demoMetrics.signal}</b></div>
                <div className="landingDemo__metric"><span>Liquidity Footprint</span><b>{demoMetrics.ptfav}</b></div>
                <div className="landingDemo__metric"><span>Flow%</span><b className="landingDemo__value">{demoMetrics.flowPctTotal}</b></div>
                <div className="landingDemo__metric"><span>Trend Acceleration</span><b className="landingDemo__value">{demoMetrics.momScore}</b></div>
                <div className="landingDemo__metric"><span>WT</span><b>{demoMetrics.targetWt}</b></div>
              </div>
            </div>
          </div>

          <p className="landingDisclaimer">
            <br />Nerion provides analytical tools and market data for informational purposes only and does not provide
            investment advice or act as a registered investment advisor.
          </p>
        </article>

        <aside className="landingAuth">
          <div className="landingAuth__top">
            <img src={logoFull} alt="Nerion" className="landingAuth__brandLogo" />
            <ThemeToggle />
          </div>
          <h2 className="landingAuth__title">Access Your Dashboard</h2>

          <div className="landingSwitch" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              className={"landingSwitch__btn " + (mode === "login" ? "is-on" : "")}
              onClick={() => {
                setMode("login");
                setErr("");
                setMsg("");
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={"landingSwitch__btn " + (mode === "signup" ? "is-on" : "")}
              onClick={() => {
                setMode("signup");
                setErr("");
                setMsg("");
              }}
            >
              Sign Up
            </button>
          </div>

          {err && <div className="landingMsg landingMsg--error">{err}</div>}
          {msg && <div className="landingMsg landingMsg--ok">{msg}</div>}

          {mode === "login" ? (
            <form className="landingForm" onSubmit={onLoginSubmit}>
              <label>Email</label>
              <input
                className="landingInput"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />

              <label>Password</label>
              <div className="landingPasswordField">
                <input
                  className="landingInput landingInput--password"
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="landingPasswordToggle"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  aria-pressed={showPass}
                >
                  {showPass ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>
              </div>

              <button className="landingBtnPrimary" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </button>

              <button type="button" className="landingBtnGhost" onClick={onRecover} disabled={loading}>
                Recover Password
              </button>

              <p className="landingSigninNote">
                By signing in you agree to out Terms and Privacy Policy.
              </p>
            </form>
          ) : (
            <form className="landingForm" onSubmit={onSignupSubmit}>
              <label>First Name</label>
              <input
                className="landingInput"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />

              <label>Last Name</label>
              <input
                className="landingInput"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />

              <label>Email</label>
              <input
                className="landingInput"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />

              <label>Password</label>
              <div className="landingPasswordField">
                <input
                  className="landingInput landingInput--password"
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="landingPasswordToggle"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  aria-pressed={showPass}
                >
                  {showPass ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>
              </div>

              <label>Confirm Password</label>
              <div className="landingPasswordField">
                <input
                  className="landingInput landingInput--password"
                  type={showPass2 ? "text" : "password"}
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="landingPasswordToggle"
                  onClick={() => setShowPass2((v) => !v)}
                  aria-label={showPass2 ? "Hide password" : "Show password"}
                  aria-pressed={showPass2}
                >
                  {showPass2 ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>
              </div>

              <label className="landingLegalCheck">
                <input
                  type="checkbox"
                  checked={acceptLegal}
                  onChange={(e) => setAcceptLegal(e.target.checked)}
                />
                <span>
                  I accept the{" "}
                  <button type="button" className="landingInlineLink" onClick={() => setLegalOpen("terms")}>
                    Terms and Conditions
                  </button>{" "}
                  and{" "}
                  <button type="button" className="landingInlineLink" onClick={() => setLegalOpen("privacy")}>
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>

              <button className="landingBtnPrimary" disabled={loading}>
                {loading ? "Creating..." : "Create Account"}
              </button>
            </form>
          )}

          <p className="landingHint">
            {mode === "login" ? (
              <>
                New here?{" "}
                <button type="button" className="landingInlineLink" onClick={() => setMode("signup")}>
                  Create your account
                </button>
                .
              </>
            ) : (
              <>
                Already registered?{" "}
                <button type="button" className="landingInlineLink" onClick={() => setMode("login")}>
                  Go to login
                </button>
                .
              </>
            )}
          </p>

        </aside>
      </div>

      <LegalModal kind={legalOpen} onClose={() => setLegalOpen("")} />
    </section>
  );
}
