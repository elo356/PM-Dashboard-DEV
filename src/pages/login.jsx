import { useState } from "react";
import { login, recoverPassword } from "../firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import LegalModal from "../components/LegalModal";
import logoFull from "../../logo completo nerion.svg";
import "./auth.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [legalOpen, setLegalOpen] = useState("");
  const nav = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      await login(email.trim(), pass);
      nav("/dashboard", { replace: true });
    } catch (e) {
      if (e?.code === "auth/email-not-verified") {
        nav("/check-email", { replace: true });
        return;
      }
      setErr(e?.message || "Error logging in.");
    }
  }

  async function onRecover() {
    setErr("");
    setMsg("");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErr("Type your email above so we can send you the reset link.");
      return;
    }

    try {
      await recoverPassword(cleanEmail);
      setMsg("Check your inbox and spam folder to reset your password.");
    } catch (e) {
      if (e.code === "auth/invalid-email") setErr("That email is not valid.");
      else if (e.code === "auth/user-not-found") setErr("No account found with that email.");
      else setErr(e.message);
    }
  }

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authTopRow">
          <img src={logoFull} alt="Nerion" className="authBrandLogo" />
          <ThemeToggle />
        </div>
        <h2 className="authTitle">Login</h2>

        {err && <div className="authMsg authMsg--error">{err}</div>}
        {msg && <div className="authMsg authMsg--ok">{msg}</div>}

        <form className="authForm" onSubmit={onSubmit}>
          <div className="authField">
            <label>Email</label>
            <input
              className="authInput"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="authField">
            <label>Password</label>
            <input
              className="authInput"
              placeholder="Password"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="authActions">
            <button className="authBtnPrimary">Sign In</button>

            <button type="button" onClick={onRecover} className="authBtnGhost">
              Recover Password
            </button>
          </div>

          <p className="authSigninNote">
            By signing in you agree to out Terms and Privacy Policy.
          </p>
        </form>

        <p className="authFooter">
          Don’t have an account? <Link to="/signup">Sign Up</Link>
        </p>
      </div>

      <LegalModal kind={legalOpen} onClose={() => setLegalOpen("")} />
    </div>
  );
}
