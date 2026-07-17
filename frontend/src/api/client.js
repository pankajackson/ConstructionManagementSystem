import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";
export const API = axios.create({ baseURL: `${BASE}/api/v1` });

export const setAuthHeader = (token, orgId) => {
  if (token) API.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete API.defaults.headers.common["Authorization"];
  if (orgId) API.defaults.headers.common["X-Org-Id"] = orgId;
  else delete API.defaults.headers.common["X-Org-Id"];
};

// Extract user-friendly error message from API error responses
export const errMsg = (e) => {
  const data = e?.response?.data;
  if (data?.error?.message) return data.error.message;
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map((x) => x.msg || JSON.stringify(x)).join(", ");
  if (typeof data?.message === "string") return data.message;
  return e?.message || "Something went wrong.";
};

// Attach refresh flow (basic — retry once on 401)
let refreshing = false;
API.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error?.response?.status === 401 && !original._retry) {
      const rt = localStorage.getItem("refresh_token");
      if (rt && !refreshing) {
        try {
          refreshing = true;
          original._retry = true;
          const { data } = await axios.post(`${BASE}/api/v1/auth/refresh`, { refresh_token: rt });
          const newTok = data?.data?.access_token;
          if (newTok) {
            localStorage.setItem("access_token", newTok);
            const org = localStorage.getItem("org_id");
            setAuthHeader(newTok, org);
            original.headers["Authorization"] = `Bearer ${newTok}`;
            return API(original);
          }
        } catch (_) {
          // fall through
        } finally {
          refreshing = false;
        }
      }
    }
    return Promise.reject(error);
  }
);
