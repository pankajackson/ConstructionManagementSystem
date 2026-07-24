import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { UserPlus, MagnifyingGlass, ArrowRight, ArrowsDownUp } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Loader } from "../components/State";
import { Avatar } from "../components/Avatar";
import { Modal, ConfirmDialog } from "../components/Modal";
import { ROLE_LABEL, fmtRelative, fmtDate } from "../lib/labels";
import { clsx } from "clsx";

const InviteModal = ({ open, onClose, onDone }) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("site_engineer");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await API.post("/organizations/current/invites", { email, name: name || undefined, role });
      toast.success(`Member ${data.data.status}: ${email}`);
      onDone(); onClose();
      setEmail(""); setName(""); setRole("site_engineer");
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Invite Member" testid="invite-modal"
      footer={<>
        <button className="btn-brut secondary" onClick={onClose}>Cancel</button>
        <button className="btn-brut safety" onClick={submit} disabled={!email || busy} data-testid="submit-invite">{busy ? "Adding..." : "Add Member"}</button>
      </>}
    >
      <div className="space-y-4">
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Email *</span>
          <input type="email" className="input-brut mt-1" value={email} onChange={(e)=>setEmail(e.target.value)} data-testid="invite-email-input"/>
        </label>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Name</span>
          <input className="input-brut mt-1" value={name} onChange={(e)=>setName(e.target.value)} data-testid="invite-name-input"/>
        </label>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Org Role (default) *</span>
          <select className="input-brut mt-1" value={role} onChange={(e)=>setRole(e.target.value)} data-testid="invite-role-input">
            {Object.entries(ROLE_LABEL).map(([k, v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-[11px] text-zinc-600 mt-1 block">
            This is their default role in the organization. You can assign additional per-project roles later from each project's Members tab.
          </span>
        </label>
        <div className="text-xs text-zinc-600">
          The invited person can sign in immediately using OTP with this email.
        </div>
      </div>
    </Modal>
  );
};

export default function TeamPage() {
  const [members, setMembers] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmDeact, setConfirmDeact] = useState(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sortBy, setSortBy] = useState("role");
  const { currentRole, user } = useAuth();
  const isAdmin = currentRole === "admin";
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { const { data } = await API.get("/organizations/current/members"); setMembers(data.data); }
    catch (e) { toast.error(errMsg(e)); setMembers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changeRole = async (m, role) => {
    try { await API.patch(`/organizations/current/members/${m.membership_id}`, { role }); toast.success("Role updated"); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const deactivate = async (m) => {
    try { await API.patch(`/organizations/current/members/${m.membership_id}`, { is_active: !m.is_active }); toast.success(m.is_active ? "Deactivated" : "Reactivated"); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  if (!members) return <Loader/>;

  const filtered = members.filter((m) => {
    if (roleFilter && m.role !== roleFilter) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    return (m.name || "").toLowerCase().includes(t) || (m.email || "").toLowerCase().includes(t);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    if (sortBy === "projects") return (b.projects_count || 0) - (a.projects_count || 0);
    if (sortBy === "tasks") return (b.open_tasks_count || 0) - (a.open_tasks_count || 0);
    if (sortBy === "last_active") {
      return new Date(b.last_login_at || 0) - new Date(a.last_login_at || 0);
    }
    // default: role priority
    const order = { admin: 0, project_manager: 1, site_engineer: 2, viewer: 3 };
    return (order[a.role] ?? 99) - (order[b.role] ?? 99);
  });

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Organization</div>
          <h1 className="heading text-4xl md:text-5xl uppercase">Team</h1>
          <p className="text-sm text-zinc-600 mt-1">
            {members.length} member{members.length === 1 ? "" : "s"} · Click any row to see project assignments and activity
          </p>
        </div>
        {isAdmin && (
          <button className="btn-brut safety" onClick={()=>setShowInvite(true)} data-testid="invite-member-btn"><UserPlus size={18} weight="bold"/> Invite Member</button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2" size={18} weight="bold" />
          <input
            className="input-brut pl-10"
            placeholder="Search by name or email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="team-search"
          />
        </div>
        <select className="input-brut max-w-[200px]" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} data-testid="team-role-filter">
          <option value="">All roles</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input-brut max-w-[200px]" value={sortBy} onChange={(e) => setSortBy(e.target.value)} data-testid="team-sort">
          <option value="role">Sort: by role</option>
          <option value="name">Sort: by name</option>
          <option value="projects">Sort: most projects</option>
          <option value="tasks">Sort: open tasks</option>
          <option value="last_active">Sort: last active</option>
        </select>
      </div>

      <div className="card-brut divide-y-2 divide-ink">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 bg-ink text-white text-[11px] uppercase tracking-widest font-bold">
          <div className="col-span-4">Member</div>
          <div className="col-span-2">Org Role</div>
          <div className="col-span-1 text-center">Projects</div>
          <div className="col-span-1 text-center">Open Tasks</div>
          <div className="col-span-2">Last Active</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {sorted.map((m) => (
          <div
            key={m.membership_id}
            className={clsx(
              "grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 items-center transition-colors hover:bg-muted cursor-pointer",
              !m.is_active && "opacity-60"
            )}
            data-testid={`member-row-${m.user_id}`}
            onClick={() => navigate(`/team/${m.user_id}`)}
          >
            <div className="md:col-span-4 flex items-center gap-3 min-w-0">
              <Avatar user={{name:m.name,email:m.email}} size={40}/>
              <div className="min-w-0">
                <div className="font-bold truncate flex items-center gap-2">
                  {m.name || m.email}
                  {m.user_id === user?.id && <span className="chip bg-safety text-ink text-[10px]">You</span>}
                </div>
                <div className="text-xs text-zinc-600 truncate">{m.email}</div>
              </div>
            </div>
            <div className="md:col-span-2" onClick={(e) => e.stopPropagation()}>
              {isAdmin && m.user_id !== user?.id ? (
                <select className="input-brut" value={m.role} onChange={(e)=>changeRole(m, e.target.value)} data-testid={`role-select-${m.user_id}`}>
                  {Object.entries(ROLE_LABEL).map(([k, v])=><option key={k} value={k}>{v}</option>)}
                </select>
              ) : (
                <span className="text-sm font-semibold uppercase tracking-wider">{ROLE_LABEL[m.role]}</span>
              )}
            </div>
            <div className="md:col-span-1 text-center">
              <div className="mono font-bold text-xl leading-none">{m.projects_count}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 md:hidden">Projects</div>
            </div>
            <div className="md:col-span-1 text-center">
              <div className="mono font-bold text-xl leading-none">{m.open_tasks_count}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 md:hidden">Open tasks</div>
            </div>
            <div className="md:col-span-2 text-xs text-zinc-600">
              {m.last_login_at ? fmtRelative(m.last_login_at) : "Never signed in"}
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2 justify-start md:justify-end items-center" onClick={(e) => e.stopPropagation()}>
              <span className={clsx("chip text-[10px]", m.is_active ? "bg-green-600 text-white" : "bg-zinc-500 text-white")}>
                {m.is_active ? "Active" : "Deactivated"}
              </span>
              {isAdmin && m.user_id !== user?.id && (
                <button className="btn-brut secondary text-xs h-9 px-2" onClick={()=>setConfirmDeact(m)} data-testid={`deact-btn-${m.user_id}`}>
                  {m.is_active ? "Deactivate" : "Reactivate"}
                </button>
              )}
              <button
                className="text-ink hover:text-safety"
                onClick={() => navigate(`/team/${m.user_id}`)}
                data-testid={`view-detail-${m.user_id}`}
                title="View details"
              >
                <ArrowRight size={20} weight="bold"/>
              </button>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            No members match this filter.
          </div>
        )}
      </div>
      <InviteModal open={showInvite} onClose={()=>setShowInvite(false)} onDone={load}/>
      <ConfirmDialog
        open={!!confirmDeact}
        title={confirmDeact?.is_active ? "Deactivate member?" : "Reactivate member?"}
        message={confirmDeact?.is_active
          ? "They will lose access to this organization. Their historical data is preserved."
          : "Restore this member's access to this organization."}
        confirmLabel={confirmDeact?.is_active ? "Deactivate" : "Reactivate"}
        danger={confirmDeact?.is_active}
        onCancel={()=>setConfirmDeact(null)}
        onConfirm={()=>{ deactivate(confirmDeact); setConfirmDeact(null); }}
      />
    </div>
  );
}
