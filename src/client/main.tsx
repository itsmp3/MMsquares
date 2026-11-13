import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { PublicApp } from "./PublicApp";
import { AdminApp } from "./admin/AdminApp";

const isAdmin = location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <PublicApp />}</StrictMode>,
);
