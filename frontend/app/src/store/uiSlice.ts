import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface UIState {
  view: string;
  scheme: string;
  scanlines: boolean;
  tvMode: boolean;
  theme: "dark" | "light";
  lang: "es" | "en";
  intelIp: string | undefined;
  workspaceData: any;
}

const initialState: UIState = {
  view: "overview",
  scheme: "green",
  scanlines: true,
  tvMode: false,
  theme: (localStorage.getItem("valhalla_theme") as "dark" | "light") || "dark",
  lang: (localStorage.getItem("valhalla_lang") as "es" | "en") || "es",
  intelIp: undefined,
  workspaceData: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setView(state, action: PayloadAction<string>) {
      state.view = action.payload;
    },
    setScheme(state, action: PayloadAction<string>) {
      state.scheme = action.payload;
    },
    setScanlines(state, action: PayloadAction<boolean>) {
      state.scanlines = action.payload;
    },
    setTvMode(state, action: PayloadAction<boolean>) {
      state.tvMode = action.payload;
    },
    setTheme(state, action: PayloadAction<"dark" | "light">) {
      state.theme = action.payload;
      localStorage.setItem("valhalla_theme", action.payload);
    },
    setLang(state, action: PayloadAction<"es" | "en">) {
      state.lang = action.payload;
      localStorage.setItem("valhalla_lang", action.payload);
    },
    navigateToIntel(state, action: PayloadAction<string>) {
      state.intelIp = action.payload;
      state.view = "threat";
    },
    navigateToWorkspace(state, action: PayloadAction<any>) {
      state.workspaceData = action.payload;
      state.view = "workspace";
    },
    clearWorkspaceData(state) {
      state.workspaceData = null;
    },
  },
});

export const {
  setView,
  setScheme,
  setScanlines,
  setTvMode,
  setTheme,
  setLang,
  navigateToIntel,
  navigateToWorkspace,
  clearWorkspaceData,
} = uiSlice.actions;
export default uiSlice.reducer;
