import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  Buildings, ClipboardText, Warning, Bell, SignOut, Users, HardHat,
  Kanban, ListChecks, GridFour, CaretDown, ArrowsLeftRight
} from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";
import { API, errMsg } from "../api/client";
import { Avatar } from "./Avatar";
import { ROLE_LABEL } from "../lib/labels";
import { clsx } from "clsx";

const TopBar = ({ unread, onSwitchOrg }) => {
  const { user, orgs, orgId, currentRole, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentOrg = orgs.find((o) => o.id === orgId);

  return (
    <header className="border-b-2 border-ink bg-ink text-white sticky top-0 z-30" data-testid="topbar">
      <div className="flex items-center gap-4 px-4 lg:px-6 h-16">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-safety border-2 border-white flex items-center justify-center">
            <HardHat size={22} weight="fill" color="#09090b" />
          </div>
          <div>
            <div className="heading text-2xl leading-none tracking-tight">CONSTRUCT<span className="text-safety">OS</span></div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-400">Site Operations</div>
          </div>
        </div>

        <div className="flex-1" />

        {currentOrg && (
          <button
            className="hidden md:flex items-center gap-2 h-10 px-3 border-2 border-white/30 hover:bg-white/10"
            onClick={onSwitchOrg}
            data-testid="switch-org-btn"
            title="Switch organization"
          >
            <Buildings size={18} weight="bold" />
            <div className="text-left leading-tight">
              <div className="text-sm font-semibold">{currentOrg.name}</div>
              <div className="text-[10px] uppercase text-zinc-400">{ROLE_LABEL[currentRole]}</div>
            </div>
            <ArrowsLeftRight size={14} weight="bold" />
          </button>
        )}

        <button
          className="relative h-10 w-10 border-2 border-white/30 hover:bg-white/10 flex items-center justify-center"
          onClick={() => navigate("/notifications")}
          data-testid="notifications-btn"
          aria-label="Notifications"
        >
          <Bell size={20} weight="bold" />
          {unread > 0 && (
            <span
              className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 bg-safety text-ink border-2 border-ink font-bold text-xs flex items-center justify-center"
              data-testid="unread-count"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        <div className="relative">
          <button
            className="flex items-center gap-2 h-10 px-2 border-2 border-white/30 hover:bg-white/10"
            onClick={() => setMenuOpen((s) => !s)}
            data-testid="user-menu-btn"
          >
            <Avatar user={user} size={28} />
            <span className="hidden md:block text-sm font-semibold">{user?.name}</span>
            <CaretDown size={14} weight="bold" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 card-brut bg-white text-ink" data-testid="user-menu">
              <div className="p-3 border-b-2 border-ink">
                <div className="font-bold">{user?.name}</div>
                <div className="text-xs text-zinc-600 break-all">{user?.email}</div>
              </div>
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 border-b-2 border-ink"
                onClick={() => { setMenuOpen(false); onSwitchOrg?.(); }}
                data-testid="menu-switch-org"
              >
                <ArrowsLeftRight size={16} weight="bold" /> Switch organization
              </button>
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2"
                onClick={async () => { setMenuOpen(false); await logout(); toast.success("Signed out"); navigate("/login"); }}
                data-testid="menu-logout"
              >
                <SignOut size={16} weight="bold" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

const Sidebar = () => {
  const items = [
    { to: "/projects", icon: GridFour, label: "Projects", tid: "nav-projects" },
    { to: "/team", icon: Users, label: "Team", tid: "nav-team" },
  ];
  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r-2 border-ink bg-white" data-testid="sidebar">
      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            data-testid={it.tid}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 h-12 px-3 border-2 border-transparent font-semibold text-sm uppercase tracking-wide",
                isActive ? "bg-ink text-white border-ink" : "text-ink hover:bg-muted hover:border-ink"
              )
            }
          >
            <it.icon size={18} weight="bold" /> {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t-2 border-ink text-[10px] uppercase tracking-widest text-zinc-500">
        v1.0 · IST timezone
      </div>
    </aside>
  );
};

export const AppShell = ({ onSwitchOrg }) => {
  const [unread, setUnread] = useState(0);
  const location = useLocation();

  const fetchUnread = async () => {
    try {
      const { data } = await API.get("/notifications/unread-count");
      setUnread(data.data.unread || 0);
    } catch (e) {
      // silent
    }
  };
  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30000);
    return () => clearInterval(id);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar unread={unread} onSwitchOrg={onSwitchOrg} />
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 min-w-0 bg-muted">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
