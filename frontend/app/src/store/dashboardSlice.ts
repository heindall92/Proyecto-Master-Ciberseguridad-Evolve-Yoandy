import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { TicketOut } from "../lib/api";

interface DashboardState {
  stats: any;
  recentOpenTickets: TicketOut[];
  lastTicketCount: number;
  notifSeen: boolean;
}

const initialState: DashboardState = {
  stats: null,
  recentOpenTickets: [],
  lastTicketCount: 0,
  notifSeen: false,
};

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    setStats(state, action: PayloadAction<any>) {
      state.stats = action.payload;
    },
    patchStats(state, action: PayloadAction<{ metrics: Partial<any> }>) {
      state.stats = {
        ...state.stats,
        metrics: { ...(state.stats?.metrics || {}), ...action.payload.metrics },
      };
    },
    setRecentOpenTickets(state, action: PayloadAction<TicketOut[]>) {
      state.recentOpenTickets = action.payload;
    },
    setLastTicketCount(state, action: PayloadAction<number>) {
      state.lastTicketCount = action.payload;
    },
    setNotifSeen(state, action: PayloadAction<boolean>) {
      state.notifSeen = action.payload;
    },
  },
});

export const { setStats, patchStats, setRecentOpenTickets, setLastTicketCount, setNotifSeen } =
  dashboardSlice.actions;
export default dashboardSlice.reducer;
