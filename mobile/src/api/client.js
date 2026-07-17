// Shared API client — same envelope pattern as the web app.
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HOST = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
export const BASE = `${HOST}/api/v1`;

export const API = axios.create({ baseURL: BASE, timeout: 20000 });

let currentToken = null;
let currentOrg = null;

export const setAuth = async ({ token, orgId }) => {
  currentToken = token;
  currentOrg = orgId;
  if (token) {
    API.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    await AsyncStorage.setItem("access_token", token);
  } else {
    delete API.defaults.headers.common["Authorization"];
    await AsyncStorage.removeItem("access_token");
  }
  if (orgId) {
    API.defaults.headers.common["X-Org-Id"] = orgId;
    await AsyncStorage.setItem("org_id", orgId);
  } else {
    delete API.defaults.headers.common["X-Org-Id"];
    await AsyncStorage.removeItem("org_id");
  }
};

export const loadStoredAuth = async () => {
  const [token, orgId, refresh] = await Promise.all([
    AsyncStorage.getItem("access_token"),
    AsyncStorage.getItem("org_id"),
    AsyncStorage.getItem("refresh_token"),
  ]);
  if (token) API.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  if (orgId) API.defaults.headers.common["X-Org-Id"] = orgId;
  currentToken = token;
  currentOrg = orgId;
  return { token, orgId, refresh };
};

export const clearAuth = async () => {
  currentToken = null;
  currentOrg = null;
  delete API.defaults.headers.common["Authorization"];
  delete API.defaults.headers.common["X-Org-Id"];
  await AsyncStorage.multiRemove(["access_token", "refresh_token", "org_id"]);
};

export const errMsg = (e) => {
  const data = e?.response?.data;
  return data?.error?.message || data?.detail || e?.message || "Something went wrong.";
};
