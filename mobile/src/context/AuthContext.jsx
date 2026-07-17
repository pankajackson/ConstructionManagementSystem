import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API, setAuth, loadStoredAuth, clearAuth } from "../api/client";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgIdState] = useState(null);
  const [loading, setLoading] = useState(true);

  const setActiveOrg = useCallback(async (id) => {
    setOrgIdState(id);
    const tok = await AsyncStorage.getItem("access_token");
    await setAuth({ token: tok, orgId: id });
  }, []);

  const bootstrap = useCallback(async () => {
    const { token, orgId: savedOrg } = await loadStoredAuth();
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await API.get("/auth/me");
      setUser(data.data.user);
      setOrgs(data.data.organizations || []);
      if (savedOrg && data.data.organizations.some((o) => o.id === savedOrg)) {
        setOrgIdState(savedOrg);
      }
    } catch (e) {
      await clearAuth();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const login = async ({ access_token, refresh_token, user: u, organizations }) => {
    await AsyncStorage.setItem("refresh_token", refresh_token);
    await setAuth({ token: access_token, orgId: organizations?.[0]?.id });
    setUser(u);
    setOrgs(organizations || []);
    if (organizations?.length === 1) setOrgIdState(organizations[0].id);
  };

  const logout = async () => {
    try { await API.post("/auth/logout"); } catch (_) {}
    await clearAuth();
    setUser(null); setOrgs([]); setOrgIdState(null);
  };

  const currentRole = orgs.find((o) => o.id === orgId)?.role || null;

  return (
    <AuthContext.Provider value={{ user, orgs, orgId, currentRole, loading, login, logout, setActiveOrg, refreshMe: bootstrap }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
