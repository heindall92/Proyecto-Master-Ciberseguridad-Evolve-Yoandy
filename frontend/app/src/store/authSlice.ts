import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { UserOut } from "../lib/api";

interface AuthState {
  user: UserOut | null;
  token: string | null;
  profilePic: string | null;
  loading: boolean;
  isOffline: boolean;
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem("token"),
  profilePic: null,
  loading: true,
  isOffline: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<UserOut | null>) {
      state.user = action.payload;
    },
    setToken(state, action: PayloadAction<string | null>) {
      state.token = action.payload;
      if (action.payload) {
        localStorage.setItem("token", action.payload);
      } else {
        localStorage.removeItem("token");
      }
    },
    setProfilePic(state, action: PayloadAction<string | null>) {
      state.profilePic = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setIsOffline(state, action: PayloadAction<boolean>) {
      state.isOffline = action.payload;
    },
    logout(state) {
      state.user = null;
      state.token = null;
      state.profilePic = null;
      state.isOffline = false;
      localStorage.removeItem("token");
    },
    loginOffline(state) {
      state.isOffline = true;
      state.token = "offline-mode-token";
      state.user = {
        id: 1,
        username: "admin_offline",
        email: "admin@valhalla",
        full_name: "Admin Offline",
        is_active: true,
        is_superuser: true,
        role: "admin",
        rank: "L3 Blue Team",
      };
      state.loading = false;
      localStorage.setItem("token", "offline-mode-token");
    },
  },
});

export const { setUser, setToken, setProfilePic, setLoading, setIsOffline, logout, loginOffline } =
  authSlice.actions;
export default authSlice.reducer;
