import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { LanguageProvider } from "./components/language-provider";
import { ErrorFeedbackProvider } from "./components/error-feedback";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "light"]}
      storageKey="shelve-theme"
    >
      <LanguageProvider>
        <ErrorFeedbackProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </ErrorFeedbackProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
