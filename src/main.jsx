import React from "react";
import { createRoot } from "react-dom/client";
import { KeycloakProvider } from "./contexts/KeycloakContext.jsx";
import App from "./App.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <KeycloakProvider>
      <App />
    </KeycloakProvider>
  </React.StrictMode>,
);
