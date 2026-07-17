import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { API, setAuthHeader } from "../api/client";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState(() => localStorage.getItem("org_id") || null);
  const [loading, setLoading] = useState(true);

  const setActiveOrg = useCallback((id) => {
    if (id) {
      localStorage.setItem("org_id", id);
    } else {
      localStorage.removeItem("org_id");
    }
    setOrgId(id);
    const tok = localStorage.getItem("access_token");
    setAuthHeader(tok, id);
  }, []);

  const bootstrap = useCallback(async () => {
    const tok = localStorage.getItem("access_token");
    const org = localStorage.getItem("org_id");
    setAuthHeader(tok, org);
    if (!tok) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await API.get("/auth/me");
      setUser(data.data.user);
      setOrgs(data.data.organizations || []);
      // If saved org no longer valid, clear it
      if (org && !data.data.organizations.find((o) => o.id === org)) {
        setActiveOrg(null);
      }
    } catch (_) {
      logout();
    } finally {
      setLoading(false);
    }
  }, [setActiveOrg]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = ({ access_token, refresh_token, user: u, organizations }) => {
    localStorage.setItem("access_token", access_token);
    localStorage.setItem("refresh_token", refresh_token);
    setUser(u);
    setOrgs(organizations || []);
    // Auto-select first org if only one
    if (organizations && organizations.length === 1) {
      setActiveOrg(organizations[0].id);
    } else {
      setAuthHeader(access_token, orgId);
    }
  };

  const logout = async () => {
    try {
      const rt = localStorage.getItem("refresh_token");
      await API.post("/auth/logout", rt ? { refresh_token: rt } : {}).catch(() => {});
    } catch (_) {}
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("org_id");
    setUser(null);
    setOrgs([]);
    setOrgId(null);
    setAuthHeader(null, null);
  };

  const currentRole = orgs.find((o) => o.id === orgId)?.role || null;

  return (
    <AuthContext.Provider
      value={{ user, orgs, orgId, currentRole, loading, login, logout, setActiveOrg, refreshMe: bootstrap, setOrgs }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
