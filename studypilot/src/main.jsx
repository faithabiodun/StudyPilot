import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { wakeBackend } from "./services/api";
import "./index.css";

const savedTheme = localStorage.getItem("studypilot_theme") || "light";
document.documentElement.classList.toggle("dark", savedTheme === "dark");

// Start waking the (possibly sleeping) Render backend as soon as the app
// loads, so it is warm by the time the user triggers a real request.
wakeBackend();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
