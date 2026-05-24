import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { UserOut } from "../lib/api";

export interface ChatAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
}

export interface ChatMessage {
  id: string;
  userId: number;
  username: string;
  rank: string;
  text: string;
  timestamp: string;
  chatId: string;
  mentions: string[];
  attachment?: ChatAttachment;
}

interface ChatState {
  chatOpen: boolean;
  activeChatId: string;
  chatMsgsByChat: Record<string, ChatMessage[]>;
  dmUserIds: number[];
  teamUsers: UserOut[];
  unreadByChat: Record<string, number>;
  chatInput: string;
  mentionFilter: string;
  showMentionDrop: boolean;
  pendingAttachment: ChatAttachment | null;
  isAiTyping: boolean;
}

const initialState: ChatState = {
  chatOpen: false,
  activeChatId: "global",
  chatMsgsByChat: {},
  dmUserIds: [],
  teamUsers: [],
  unreadByChat: {},
  chatInput: "",
  mentionFilter: "",
  showMentionDrop: false,
  pendingAttachment: null,
  isAiTyping: false,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setChatOpen(state, action: PayloadAction<boolean>) {
      state.chatOpen = action.payload;
    },
    setActiveChatId(state, action: PayloadAction<string>) {
      state.activeChatId = action.payload;
    },
    upsertMessage(state, action: PayloadAction<ChatMessage>) {
      const msg = action.payload;
      const list = state.chatMsgsByChat[msg.chatId] || [];
      if (list.some((m) => m.id === msg.id)) return;
      state.chatMsgsByChat[msg.chatId] = [...list, msg].slice(-200);
    },
    setHistoryForChat(
      state,
      action: PayloadAction<{ chatId: string; messages: ChatMessage[] }>
    ) {
      state.chatMsgsByChat[action.payload.chatId] = action.payload.messages;
    },
    clearChat(state, action: PayloadAction<string>) {
      state.chatMsgsByChat[action.payload] = [];
    },
    setTeamUsers(state, action: PayloadAction<UserOut[]>) {
      state.teamUsers = action.payload;
    },
    setDmUserIds(state, action: PayloadAction<number[]>) {
      state.dmUserIds = action.payload;
    },
    addDmUser(state, action: PayloadAction<number>) {
      if (!state.dmUserIds.includes(action.payload)) {
        state.dmUserIds = [...state.dmUserIds, action.payload];
      }
    },
    setUnreadForChat(
      state,
      action: PayloadAction<{ chatId: string; count: number }>
    ) {
      state.unreadByChat[action.payload.chatId] = action.payload.count;
    },
    incrementUnread(state, action: PayloadAction<string>) {
      state.unreadByChat[action.payload] =
        (state.unreadByChat[action.payload] || 0) + 1;
    },
    clearUnread(state, action: PayloadAction<string>) {
      state.unreadByChat[action.payload] = 0;
    },
    setChatInput(state, action: PayloadAction<string>) {
      state.chatInput = action.payload;
    },
    setMentionFilter(state, action: PayloadAction<string>) {
      state.mentionFilter = action.payload;
    },
    setShowMentionDrop(state, action: PayloadAction<boolean>) {
      state.showMentionDrop = action.payload;
    },
    setPendingAttachment(state, action: PayloadAction<ChatAttachment | null>) {
      state.pendingAttachment = action.payload;
    },
    setAiTyping(state, action: PayloadAction<boolean>) {
      state.isAiTyping = action.payload;
    },
  },
});

export const {
  setChatOpen,
  setActiveChatId,
  upsertMessage,
  setHistoryForChat,
  clearChat,
  setTeamUsers,
  setDmUserIds,
  addDmUser,
  setUnreadForChat,
  incrementUnread,
  clearUnread,
  setChatInput,
  setMentionFilter,
  setShowMentionDrop,
  setPendingAttachment,
  setAiTyping,
} = chatSlice.actions;
export default chatSlice.reducer;
