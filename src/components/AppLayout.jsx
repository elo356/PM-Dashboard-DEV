import { Outlet } from "react-router-dom";
import AppFooter from "./AppFooter";

export default function AppLayout() {
  return (
    <div className="appShell">
      <div className="appShell__content">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  );
}
