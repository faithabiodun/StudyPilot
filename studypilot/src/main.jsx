import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import App from "./App.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { wakeBackend } from "./services/api";
import "@mysten/dapp-kit/dist/index.css";
import "./index.css";

const savedTheme = localStorage.getItem("studypilot_theme") || "light";
document.documentElement.classList.toggle("dark", savedTheme === "dark");

// Start waking the backend as soon as the app loads, so it is warm by the time
// the user triggers a real request.
wakeBackend();

const queryClient = new QueryClient();
// Sign-in only ever signs a message, never submits a transaction, so this
// endpoint just satisfies the provider and is never actually spent against.
// Set literally because @mysten/sui 2.26 no longer exports getFullnodeUrl.
const networks = { mainnet: { url: "https://fullnode.mainnet.sui.io:443" } };

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider autoConnect>
          <BrowserRouter>
            <AuthProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
