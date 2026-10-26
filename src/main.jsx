import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "./lib/store";
import { RunnerProvider } from "./lib/runner";
import { AutomationProvider } from "./lib/automation";
import { ToastProvider } from "./components/Toast";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <RunnerProvider>
          <AutomationProvider>
            <App />
          </AutomationProvider>
        </RunnerProvider>
      </ToastProvider>
    </StoreProvider>
  </StrictMode>
);
