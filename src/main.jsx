import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./theme/theme-context";
import "./theme.css";

import Landing from "./pages/landing";
import Dashboard from "./pages/dashboard";
import CheckEmail from "./pages/checkEmail";
import SymbolDashboard from "./pages/SymbolDashboard";
import ProtectedRoute from "./routes/protectedRoute";
import AppLayout from "./components/AppLayout";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Landing initialMode="login" />} />
            <Route path="/login" element={<Landing initialMode="login" />} />
            <Route path="/signup" element={<Landing initialMode="signup" />} />
            <Route path="/check-email" element={<CheckEmail />} />
            <Route
              path="/symbol/:symbol"
              element={
                <ProtectedRoute>
                  <SymbolDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
