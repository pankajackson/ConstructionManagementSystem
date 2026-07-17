import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { clsx } from "clsx";
import { ArrowLeft, ChatCircle, Clock, Warning as WarningIcon } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Loader } from "../components/State";
import { StatusChip } from "../components/Chip";
import { Avatar } from "../components/Avatar";
import { fmtDate, fmtDateTime, fmtRelative, TASK_STATUS_LABEL, PRIORITY_LABEL } from "../lib/labels";

export default function TaskDetailPage() {
  const { projectId, taskId } = useParams();
  const [task, setTask] = useState(null);
  const [members, setMembers] = useState([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const { currentRole, user } = useAuth();
  const navigate = useNavigate();
  const canWrite = ["admin","project_manager","site_engineer"].includes(currentRole);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        API.get(`/projects/${projectId}/tasks/${taskId}`),
        API.get(`/organizations/current/members`),
      ]);
      setTask(t.data.data);
      setMembers(m.data.data);
    } catch (e) { toast.error(errMsg(e)); navigate(`/projects/${projectId}`); }
  }, [projectId, taskId, navigate]);
  useEffect(() => { load(); }, [load]);

  const update = async (patch) => {
    setBusy(true);
    try {
      await API.patch(`/projects/${projectId}/tasks/${taskId}`, patch);
      toast.success("Updated");
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await API.post(`/projects/${projectId}/tasks/${taskId}/comments`, { text: comment.trim() });
      setComment("");
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  if (!task) return <Loader/>;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <button onClick={()=>navigate(`/projects/${projectId}`)} className="text-xs uppercase tracking-widest flex items-center gap-1 text-zinc-600 hover:text-ink" data-testid="back-to-project">
        <ArrowLeft size={14} weight="bold"/> Back to project
      </button>

      <div className="card-brut p-6">
        <div className="flex flex-wrap gap-2 mb-2">
          <StatusChip kind="task" value={task.status}/>
          <StatusChip kind="priority" value={task.priority}/>
          {task.overdue && <span className="chip bg-signal text-white"><WarningIcon size={12} weight="bold"/> Overdue</span>}
        </div>
        <h1 className="heading text-4xl uppercase leading-tight break-words">{task.title}</h1>
        {task.description && <p className="mt-3 text-zinc-700 whitespace-pre-wrap">{task.description}</p>}

        <div className="grid md:grid-cols-3 gap-4 mt-5 border-t-2 border-ink pt-5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Assignee</div>
            {canWrite ? (
              <select className="input-brut mt-1" value={task.assignee_id || ""} onChange={(e)=>update({assignee_id: e.target.value || null})} data-testid="task-assignee-select">
                <option value="">Unassigned</option>
                {members.map((m)=><option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
              </select>
            ) : (
              <div className="mt-1">{task.assignee?.name || "—"}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Due date</div>
            {canWrite ? (
              <input type="date" className="input-brut mt-1" value={task.due_date ? task.due_date.slice(0,10) : ""} onChange={(e)=>update({due_date: e.target.value ? new Date(e.target.value).toISOString() : null})} data-testid="task-due-select"/>
            ) : (
              <div className="mt-1 mono">{fmtDate(task.due_date)}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Priority</div>
            {canWrite ? (
              <select className="input-brut mt-1" value={task.priority} onChange={(e)=>update({priority: e.target.value})} data-testid="task-priority-select">
                {Object.entries(PRIORITY_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            ) : (
              <div className="mt-1">{PRIORITY_LABEL[task.priority]}</div>
            )}
          </div>
        </div>

        {canWrite && (
          <div className="mt-5 border-t-2 border-ink pt-5">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Move status</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TASK_STATUS_LABEL).map(([k, v])=>(
                <button
                  key={k}
                  onClick={()=>update({status: k})}
                  className={clsx("btn-brut", task.status === k ? "safety" : "secondary")}
                  disabled={busy || task.status === k}
                  data-testid={`task-status-${k}`}
                >{v}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card-brut">
          <div className="p-4 border-b-2 border-ink bg-ink text-white flex items-center gap-2">
            <Clock size={18} weight="bold"/> <h3 className="heading text-xl uppercase">Status History</h3>
          </div>
          {task.history.length === 0 ? (
            <div className="p-4 text-zinc-500 text-sm">No status changes yet.</div>
          ) : (
            <ul className="divide-y-2 divide-ink">
              {task.history.map((h)=>(
                <li key={h.id} className="p-3 text-sm flex items-center gap-3">
                  <Avatar user={h.changed_by_user} size={26}/>
                  <div className="flex-1 min-w-0">
                    <div><span className="font-bold">{h.changed_by_user?.name || "—"}</span> · <span className="mono">{h.from_status || "—"} → {h.to_status}</span></div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500">{fmtDateTime(h.changed_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-brut">
          <div className="p-4 border-b-2 border-ink bg-ink text-white flex items-center gap-2">
            <ChatCircle size={18} weight="bold"/> <h3 className="heading text-xl uppercase">Comments</h3>
          </div>
          <ul className="divide-y-2 divide-ink max-h-80 overflow-y-auto">
            {task.comments.length === 0 && <li className="p-4 text-zinc-500 text-sm">No comments yet.</li>}
            {task.comments.map((c)=>(
              <li key={c.id} className="p-3 flex gap-3">
                <Avatar user={c.author} size={26}/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{c.author?.name || "—"}</div>
                  <div className="text-sm whitespace-pre-wrap">{c.text}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{fmtRelative(c.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
          {currentRole !== "viewer" && (
            <div className="p-3 border-t-2 border-ink">
              <textarea rows={2} className="input-brut" value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Add a comment (append-only)" data-testid="task-comment-input"/>
              <div className="flex justify-end mt-2">
                <button className="btn-brut safety" onClick={addComment} disabled={!comment.trim() || busy} data-testid="post-comment-btn">Post</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
