import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { PublicApp } from "./PublicApp";
import { AdminApp } from "./admin/AdminApp";

// Production: the admin app lives on its own host (admin.<domain>). Local dev: /admin.
const isAdmin = location.hostname.startsWith("admin.") || location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <PublicApp />}</StrictMode>,
);
