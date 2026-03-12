import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import { sendEmailVerification } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import ThemeToggle from "../components/ThemeToggle";
import "./auth.css";

export default function CheckEmail() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function iVerified() {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      if (!auth.currentUser) {
        setErr("Loading session… please try again in a few seconds.");
        return;
      }

      await auth.currentUser.reload();
      const freshUser = auth.currentUser;

      if (!freshUser?.emailVerified) {
        setErr("Your email is not verified yet. Please wait a few seconds and try again.");
        return;
      }

      await updateDoc(doc(db, "users", freshUser.uid), {
        account_verified: true,
        verifiedAt: Date.now(),
      });

      nav("/dashboard", { replace: true });
    } catch (e) {
      setErr(e?.message || "Error verifying email.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        setErr("Loading session… please try again.");
        return;
      }

      await sendEmailVerification(user, {
        url: "https://nerion.app/login",
      });

      setMsg("Verification email resent. Please check your inbox and spam folder.");
    } catch (e) {
      setErr(e?.message || "Unable to resend email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authTopRow">
          <div className="authBrand">Nerion</div>
          <ThemeToggle />
        </div>
        <h2 className="authTitle">Confirm your email</h2>
        <p className="authFooter" style={{ marginTop: 0 }}>
          We sent you a verification link. Please check your <b>inbox</b> and <b>spam</b> folder.
          Then click <b>I&apos;ve Verified</b>.
        </p>

        {err && <div className="authMsg authMsg--error">{err}</div>}
        {msg && <div className="authMsg authMsg--ok">{msg}</div>}

        <div className="authActions">
          <button disabled={loading} onClick={iVerified} className="authBtnPrimary">
            {loading ? "Verifying..." : "I’ve Verified"}
          </button>

          <button disabled={loading} onClick={resend} className="authBtnGhost">
            {loading ? "Sending..." : "Resend Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
