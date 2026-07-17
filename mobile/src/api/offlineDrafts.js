// Offline draft store for daily logs — uses AsyncStorage. When back online,
// the app should push drafts up to the API via POST /projects/{pid}/logs.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "draft_logs_v1";

export const listDrafts = async () => {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
};

export const saveDraft = async (draft) => {
  const all = await listDrafts();
  const idx = all.findIndex((d) => d.local_id === draft.local_id);
  if (idx >= 0) all[idx] = draft;
  else all.push(draft);
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
};

export const deleteDraft = async (local_id) => {
  const all = await listDrafts();
  await AsyncStorage.setItem(KEY, JSON.stringify(all.filter((d) => d.local_id !== local_id)));
};

export const clearDrafts = async () => AsyncStorage.removeItem(KEY);
