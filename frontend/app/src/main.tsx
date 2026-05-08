import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { store } from "./store";
import AppCore from "./ui/AppCore";
import ExecutiveReport from "./ui/ExecutiveReport";

const theme = createTheme({
  palette: { mode: "dark" },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppCore />} />
            <Route path="/executive-report" element={<ExecutiveReport />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
);
