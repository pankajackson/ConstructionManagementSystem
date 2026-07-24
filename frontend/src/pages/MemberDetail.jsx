import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { clsx } from "clsx";
import {
  ArrowLeft, Envelope, Phone, Buildings, CheckCircle, WarningCircle,
  ClipboardText, Calendar, ListChecks, Warning, MapPin,
} from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/Avatar";
import { Loader, Empty } from "../components/State";
import { StatusChip } from "../components/Chip";
import { ROLE_LABEL, fmtDate, fmtDateTime, fmtRelative, PROJECT_STATUS_LABEL } from "../lib/labels";

const StatCard = ({ label, value, testid, tone = "default" }) => (
  <div className={clsx("card-brut p-4", tone === "signal" && "bg-red-50", tone === "safety" && "bg-lime-50")} data-testid={testid}>
    <div className="mono heading text-4xl leading-none">{value}</div>
    <div className="text-[10px] uppercase tracking-widest text-zinc-600 mt-2">{label}</div>
  </div>
);

const RoleBadge = ({ role }) => (
  <span className={clsx("chip text-[10px] uppercase tracking-widest",
    role === "admin" && "bg-ink text-safety",
    role === "project_manager" && "bg-blue-700 text-white",
    role === "site_engineer" && "bg-amber-500 text-black",
    role === "viewer" && "bg-zinc-500 text-white",
  )}>
    {ROLE_LABEL[role] || role}
  </span>
);

export default function MemberDetailPage() {
  const { userId } = useParams();
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = useCallback(async () => {
    try {
      const { data } = await API.get(`/organizations/current/members/${userId}`);
      setDetail(data.data);
    } catch (e) { toast.error(errMsg(e)); navigate("/team"); }
  }, [userId, navigate]);
  useEffect(() => { load(); }, [load]);

  if (!detail) return <Loader/>;

  const { user: u, membership, projects, task_stats, open_issues, recent_activity } = detail;
  const isSelf = u.id === user?.id;

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <button
        onClick={()=>navigate("/team")}
        className="text-xs uppercase tracking-widest flex items-center gap-1 text-zinc-600 hover:text-ink"
        data-testid="back-to-team"
      >
        <ArrowLeft size={14} weight="bold"/> Back to team
      </button>

      {/* Profile hero */}
      <div className="card-brut p-6" data-testid="member-profile-card">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar user={u} size={88} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="heading text-4xl md:text-5xl uppercase leading-tight break-words" data-testid="member-name">
                {u.name || u.email}
              </h1>
              {isSelf && <span className="chip bg-safety text-ink">You</span>}
              <span className={clsx("chip", membership.is_active ? "bg-green-600 text-white" : "bg-zinc-500 text-white")}>
                {membership.is_active ? "Active" : "Deactivated"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-700">
              <span className="flex items-center gap-2"><Envelope size={16} weight="bold"/> {u.email}</span>
              {u.phone && <span className="flex items-center gap-2"><Phone size={16} weight="bold"/> {u.phone}</span>}
              <span className="flex items-center gap-2">
                <Buildings size={16} weight="bold"/> Org role: <RoleBadge role={membership.role}/>
              </span>
              <span className="flex items-center gap-2">
                <Calendar size={16} weight="bold"/> Joined {fmtDate(membership.created_at)}
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle size={16} weight="bold"/> Last active: {u.last_login_at ? fmtRelative(u.last_login_at) : "Never"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Projects assigned" value={projects.length} testid="stat-projects"/>
        <StatCard label="Open tasks" value={task_stats.open} testid="stat-open-tasks" tone={task_stats.open > 0 ? "signal" : "default"}/>
        <StatCard label="Tasks done" value={task_stats.done} testid="stat-done-tasks" tone="safety"/>
        <StatCard label="Total tasks" value={task_stats.total} testid="stat-total-tasks"/>
        <StatCard label="Open issues" value={open_issues} testid="stat-open-issues" tone={open_issues > 0 ? "signal" : "default"}/>
      </div>

      {/* Projects assigned */}
      <div className="card-brut" data-testid="assigned-projects">
        <div className="p-4 border-b-2 border-ink bg-ink text-white flex items-center justify-between">
          <h3 className="heading text-2xl uppercase flex items-center gap-2">
            <ListChecks size={22} weight="bold"/> Projects Assigned
          </h3>
          <span className="text-[10px] uppercase tracking-widest">{projects.length} total</span>
        </div>
        {projects.length === 0 ? (
          <Empty
            title="No project assignments yet"
            message="Assign this user to a project from the project's Members tab."
            icon={<ListChecks size={48} weight="fill"/>}
          />
        ) : (
          <ul className="divide-y-2 divide-ink">
            {projects.map((p) => (
              <li
                key={p.id}
                className="p-4 flex flex-wrap items-center gap-4 hover:bg-muted cursor-pointer"
                onClick={() => navigate(`/projects/${p.id}`)}
                data-testid={`assigned-project-${p.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg leading-tight break-words">{p.name}</div>
                  <div className="text-xs text-zinc-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {p.location && <span className="flex items-center gap-1"><MapPin size={12} weight="bold"/> {p.location}</span>}
                    <span>{PROJECT_STATUS_LABEL[p.status] || p.status}</span>
                    {p.archived && <span className="chip bg-zinc-500 text-white text-[10px]">Archived</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {p.is_project_manager && (
                    <span className="chip bg-safety text-ink text-[10px] uppercase tracking-widest">PM</span>
                  )}
                  {p.roles.map((r) => (
                    <RoleBadge key={r} role={r}/>
                  ))}
                </div>
                <StatusChip kind="project" value={p.status}/>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent activity */}
      <div className="card-brut" data-testid="member-activity">
        <div className="p-4 border-b-2 border-ink bg-ink text-white flex items-center justify-between">
          <h3 className="heading text-2xl uppercase">Recent Activity</h3>
          <span className="text-[10px] uppercase tracking-widest">Last {recent_activity.length}</span>
        </div>
        {recent_activity.length === 0 ? (
          <div className="p-6 text-zinc-500 text-sm">No activity recorded yet.</div>
        ) : (
          <ul className="divide-y-2 divide-ink">
            {recent_activity.map((a) => (
              <li key={a.id} className="p-4 flex items-start gap-3">
                <div className="mono text-[10px] uppercase tracking-widest text-zinc-500 w-24 shrink-0 pt-1">
                  {fmtRelative(a.created_at)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="mono font-bold">{a.action}</span>
                    {a.project_name && (
                      <>
                        <span className="text-zinc-500"> in </span>
                        <button
                          className="font-semibold underline underline-offset-2 decoration-2 hover:text-safety"
                          onClick={()=>navigate(`/projects/${a.project_id}`)}
                        >
                          {a.project_name}
                        </button>
                      </>
                    )}
                  </div>
                  {a.details && Object.keys(a.details).length > 0 && (
                    <div className="text-xs text-zinc-600 mt-1 truncate">{JSON.stringify(a.details).slice(0,180)}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
