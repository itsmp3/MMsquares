import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { PublicApp } from "./PublicApp";
import { AdminApp } from "./admin/AdminApp";

// Production: the admin app lives on its own host (admin.<domain>). Local dev: /admin.
const isAdmin = location.hostname.startsWith("admin.") || location.pathname.startsWith("/admin");

if (isAdmin) {
  // Name used when the admin site is added to a home screen.
  document.title = "Squares Admin";
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", "Squares Admin");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <PublicApp />}</StrictMode>,
);
