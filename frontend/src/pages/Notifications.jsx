import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { clsx } from "clsx";
import { Bell, Check, CheckCircle } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { Empty, Loader } from "../components/State";
import { fmtRelative } from "../lib/labels";

const ICONS = {
  "task.assigned": "→",
  "task.status_changed": "↺",
  "issue.assigned": "!",
  "issue.status_changed": "↻",
  "log.submitted": "✓",
};

export default function NotificationsPage() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await API.get("/notifications", { params: { unread_only: filter === "unread" } });
      setItems(data.data);
    } catch (e) { toast.error(errMsg(e)); setItems([]); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const markRead = async (n) => {
    if (!n.is_read) {
      try { await API.post(`/notifications/${n.id}/read`); } catch (_) {}
    }
    if (n.project_id && n.entity_type === "task") navigate(`/projects/${n.project_id}/tasks/${n.entity_id}`);
    else if (n.project_id && n.entity_type === "issue") navigate(`/projects/${n.project_id}/issues/${n.entity_id}`);
    else if (n.project_id && n.entity_type === "daily_log") navigate(`/projects/${n.project_id}/logs/${n.entity_id}`);
    else if (n.project_id) navigate(`/projects/${n.project_id}`);
  };

  const readAll = async () => {
    try { await API.post("/notifications/read-all"); toast.success("All marked read"); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Inbox</div>
          <h1 className="heading text-4xl md:text-5xl uppercase">Notifications</h1>
        </div>
        <div className="flex gap-2">
          <button className={clsx("btn-brut", filter === "all" ? "safety" : "secondary")} onClick={()=>setFilter("all")} data-testid="notif-filter-all">All</button>
          <button className={clsx("btn-brut", filter === "unread" ? "safety" : "secondary")} onClick={()=>setFilter("unread")} data-testid="notif-filter-unread">Unread</button>
          <button className="btn-brut" onClick={readAll} data-testid="notif-read-all"><CheckCircle size={16} weight="bold"/> Read all</button>
        </div>
      </div>
      {items === null ? <Loader/> : items.length === 0 ? (
        <Empty title="Nothing here" message="You're all caught up." icon={<Bell size={48} weight="fill"/>}/>
      ) : (
        <div className="card-brut divide-y-2 divide-ink">
          {items.map((n)=>(
            <button
              key={n.id}
              onClick={()=>markRead(n)}
              className={clsx("w-full text-left flex items-start gap-3 p-4 hover:bg-muted", !n.is_read && "bg-yellow-50")}
              data-testid={`notif-${n.id}`}
            >
              <div className={clsx("w-9 h-9 border-2 border-ink flex items-center justify-center mono font-bold shrink-0", !n.is_read ? "bg-safety" : "bg-white")}>
                {ICONS[n.type] || "•"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold">{n.title}</div>
                <div className="text-sm text-zinc-700">{n.message}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{fmtRelative(n.created_at)}</div>
              </div>
              {!n.is_read && <span className="w-3 h-3 bg-safety border-2 border-ink mt-1 shrink-0"/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
