import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { watchAuth } from "../firebase/auth";
import { auth } from "../firebase/firebase";

export default function ProtectedRoute({ children }) {
  const [user, setUser] = useState(() => auth.currentUser ?? undefined);

  useEffect(() => {
    const unsub = watchAuth((u) => setUser(u || null));
    return () => unsub();
  }, []);

  if (user === undefined) {
    return (
      <div style={{ minHeight: "40vh", display: "grid", placeItems: "center", color: "rgba(255,255,255,.75)" }}>
        Loading session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.emailVerified) {
    return <Navigate to="/check-email" replace />;
  }

  return children;
}
