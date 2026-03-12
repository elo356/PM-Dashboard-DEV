import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup } from "../firebase/auth";
import { createUserProfile } from "../firebase/user";
import ThemeToggle from "../components/ThemeToggle";
import LegalModal from "../components/LegalModal";
import { LEGAL_VERSIONS } from "../legal/legalContent";
import logoFull from "../../logo completo nerion.svg";
import "./auth.css";

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

export default function Signup() {
  const nav = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [acceptLegal, setAcceptLegal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [legalOpen, setLegalOpen] = useState("");

  function validate() {
    if (!firstName.trim()) return "Please enter your first name.";
    if (!lastName.trim()) return "Please enter your last name.";
    if (!email.trim()) return "Please enter your email.";
    if (!pass) return "Please enter a password.";
    if (pass.length < 6) return "Password must be at least 6 characters long.";
    if (pass !== pass2) return "Passwords do not match.";
    if (!acceptLegal) return "You must accept Terms and Privacy Policy to create your account.";
    return null;
  }

  function friendlyAuthError(e) {
    if (e?.code === "auth/email-already-in-use") return "That email is already registered.";
    if (e?.code === "auth/invalid-email") return "That email is not valid.";
    if (e?.code === "auth/weak-password") return "The password is too weak.";
    return e?.message || "An error occurred.";
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    const v = validate();
    if (v) return setErr(v);

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
        createdAt: Date.now(),
        account_verified: false,
        legalAcceptance: legalPayload,
      });

      setMsg("We sent you a verification email to confirm your account.");
      nav("/check-email");
    } catch (e2) {
      setErr(friendlyAuthError(e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authTopRow">
          <img src={logoFull} alt="Nerion" className="authBrandLogo" />
          <ThemeToggle />
        </div>
        <h2 className="authTitle">Create Account</h2>

        {err && <div className="authMsg authMsg--error">{err}</div>}
        {msg && <div className="authMsg authMsg--ok">{msg}</div>}

        <form className="authForm" onSubmit={onSubmit}>
          <div className="authField">
            <label>First Name</label>
            <input
              className="authInput"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>

          <div className="authField">
            <label>Last Name</label>
            <input
              className="authInput"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>

          <div className="authField">
            <label>Email</label>
            <input
              className="authInput"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="authField">
            <label>Password</label>
            <input
              className="authInput"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="authField">
            <label>Confirm Password</label>
            <input
              className="authInput"
              type="password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="authActions">
            <button disabled={loading} className="authBtnPrimary">
              {loading ? "Creating..." : "Sign Up"}
            </button>
          </div>

          <label className="authLegalCheck">
            <input
              type="checkbox"
              checked={acceptLegal}
              onChange={(e) => setAcceptLegal(e.target.checked)}
            />
            <span>
              I accept the{" "}
              <button type="button" className="authInlineLink" onClick={() => setLegalOpen("terms")}>
                Terms and Conditions
              </button>{" "}
              and{" "}
              <button type="button" className="authInlineLink" onClick={() => setLegalOpen("privacy")}>
                Privacy Policy
              </button>.
            </span>
          </label>
        </form>

        <p className="authFooter">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>

      <LegalModal kind={legalOpen} onClose={() => setLegalOpen("")} />
    </div>
  );
}
