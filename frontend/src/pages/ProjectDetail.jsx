import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { clsx } from "clsx";
import {
  Plus, Kanban, ClipboardText, Warning, ArrowLeft, Archive, Users as UsersIcon,
  ArrowClockwise, ChatCircle, MapPin, DownloadSimple, DotsThree
} from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { StatusChip } from "../components/Chip";
import { Modal, ConfirmDialog } from "../components/Modal";
import { Empty, Loader, Skeleton } from "../components/State";
import { Avatar } from "../components/Avatar";
import {
  fmtDate, fmtDateTime, fmtRelative, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL,
  ISSUE_STATUS_LABEL, PRIORITY_LABEL, WEATHER_LABEL, CATEGORY_LABEL
} from "../lib/labels";

const Tab = ({ active, onClick, children, testid, count }) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className={clsx(
      "h-12 px-4 border-2 border-ink font-bold uppercase tracking-wider text-sm flex items-center gap-2",
      active ? "bg-ink text-white" : "bg-white text-ink hover:bg-muted"
    )}
  >
    {children}
    {typeof count === "number" && (
      <span className={clsx("min-w-[24px] px-1 text-xs border-2", active ? "bg-safety text-ink border-safety" : "bg-ink text-white border-ink")}>
        {count}
      </span>
    )}
  </button>
);

const AssigneeSelect = ({ members, value, onChange, testid }) => (
  <select className="input-brut" value={value || ""} onChange={(e) => onChange(e.target.value || null)} data-testid={testid}>
    <option value="">Unassigned</option>
    {members.map((m) => (
      <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>
    ))}
  </select>
);

// ============== TASKS PANEL ==============
const TasksPanel = ({ projectId, members, currentRole }) => {
  const [tasks, setTasks] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const canWrite = ["admin", "project_manager", "site_engineer"].includes(currentRole);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get(`/projects/${projectId}/tasks`, {
        params: {
          status: statusFilter || undefined, priority: priorityFilter || undefined,
          assignee_id: assigneeFilter || undefined, sort_by: sortBy, order,
        },
      });
      setTasks(data.data);
    } catch (e) {
      toast.error(errMsg(e));
      setTasks([]);
    }
  }, [projectId, statusFilter, priorityFilter, assigneeFilter, sortBy, order]);

  useEffect(() => { load(); }, [load]);

  const download = () => {
    const backend = process.env.REACT_APP_BACKEND_URL;
    const tok = localStorage.getItem("access_token");
    const org = localStorage.getItem("org_id");
    fetch(`${backend}/api/v1/projects/${projectId}/tasks/export.csv`, {
      headers: { Authorization: `Bearer ${tok}`, "X-Org-Id": org },
    })
      .then((r) => r.blob())
      .then((b) => {
        const url = window.URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = url;
        a.download = "tasks.csv";
        a.click();
        window.URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex flex-wrap gap-2">
          <select className="input-brut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="task-status-filter">
            <option value="">All statuses</option>
            {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input-brut" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} data-testid="task-priority-filter">
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input-brut" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} data-testid="task-assignee-filter">
            <option value="">All assignees</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
          </select>
          <select className="input-brut" value={`${sortBy}:${order}`} onChange={(e) => { const [s, o] = e.target.value.split(":"); setSortBy(s); setOrder(o); }} data-testid="task-sort">
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="due_date:asc">Due date ↑</option>
            <option value="due_date:desc">Due date ↓</option>
            <option value="priority:desc">Priority ↓</option>
            <option value="title:asc">Title A–Z</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-brut secondary" onClick={download} data-testid="task-export-csv"><DownloadSimple size={16} weight="bold"/> CSV</button>
          {canWrite && (
            <button className="btn-brut safety" onClick={() => setShowCreate(true)} data-testid="new-task-btn"><Plus size={16} weight="bold"/> New Task</button>
          )}
        </div>
      </div>

      {tasks === null ? (
        <div className="space-y-2">{[1,2,3].map((i)=><Skeleton key={i} className="h-16"/>)}</div>
      ) : tasks.length === 0 ? (
        <Empty title="No tasks" message="Create the first task for this project." icon="◇" />
      ) : (
        <div className="card-brut divide-y-2 divide-ink">
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 bg-ink text-white text-[11px] uppercase tracking-widest font-bold">
            <div className="col-span-5">Task</div>
            <div className="col-span-2">Assignee</div>
            <div className="col-span-2">Due</div>
            <div className="col-span-1">Priority</div>
            <div className="col-span-2">Status</div>
          </div>
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(`/projects/${projectId}/tasks/${t.id}`)}
              className={clsx("w-full grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 text-left hover:bg-muted", t.overdue && "bg-red-50")}
              data-testid={`task-row-${t.id}`}
            >
              <div className="md:col-span-5">
                <div className="font-semibold">{t.title}</div>
                {t.overdue && <div className="text-[10px] uppercase tracking-widest text-signal font-bold mt-1">⚠ Overdue</div>}
              </div>
              <div className="md:col-span-2 flex items-center gap-2 text-sm">
                {t.assignee ? <><Avatar user={t.assignee} size={24}/> <span className="truncate">{t.assignee.name}</span></> : <span className="text-zinc-500">—</span>}
              </div>
              <div className="md:col-span-2 mono text-sm">{fmtDate(t.due_date)}</div>
              <div className="md:col-span-1"><StatusChip kind="priority" value={t.priority}/></div>
              <div className="md:col-span-2"><StatusChip kind="task" value={t.status}/></div>
            </button>
          ))}
        </div>
      )}

      <CreateTaskModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} projectId={projectId} members={members} />
    </div>
  );
};

const CreateTaskModal = ({ open, onClose, onCreated, projectId, members }) => {
  const [form, setForm] = useState({ title: "", description: "", assignee_id: "", due_date: "", priority: "medium" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await API.post(`/projects/${projectId}/tasks`, {
        title: form.title,
        description: form.description || null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        priority: form.priority,
      });
      toast.success("Task created");
      onCreated();
      onClose();
      setForm({ title: "", description: "", assignee_id: "", due_date: "", priority: "medium" });
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New Task" testid="create-task-modal"
      footer={<>
        <button className="btn-brut secondary" onClick={onClose} data-testid="cancel-task">Cancel</button>
        <button className="btn-brut safety" onClick={submit} disabled={!form.title || busy} data-testid="submit-task">{busy?"Creating...":"Create"}</button>
      </>}
    >
      <div className="space-y-4">
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Title *</span>
          <input required autoFocus className="input-brut mt-1" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} data-testid="task-title-input"/>
        </label>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Description</span>
          <textarea className="input-brut mt-1" rows={3} value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} data-testid="task-desc-input"/>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Assignee</span>
            <AssigneeSelect members={members} value={form.assignee_id} onChange={(v)=>setForm({...form,assignee_id:v||""})} testid="task-assignee-input"/>
          </label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Due date</span>
            <input type="date" className="input-brut mt-1" value={form.due_date} onChange={(e)=>setForm({...form,due_date:e.target.value})} data-testid="task-due-input"/>
          </label>
        </div>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Priority</span>
          <select className="input-brut mt-1" value={form.priority} onChange={(e)=>setForm({...form,priority:e.target.value})} data-testid="task-priority-input">
            {Object.entries(PRIORITY_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
    </Modal>
  );
};

// ============== LOGS PANEL ==============
const LogsPanel = ({ projectId, currentRole }) => {
  const [logs, setLogs] = useState(null);
  const [weather, setWeather] = useState("");
  const [statusF, setStatusF] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const canWrite = ["admin", "project_manager", "site_engineer"].includes(currentRole);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get(`/projects/${projectId}/logs`, {
        params: { weather: weather || undefined, status: statusF || undefined },
      });
      setLogs(data.data);
    } catch (e) { toast.error(errMsg(e)); setLogs([]); }
  }, [projectId, weather, statusF]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex flex-wrap gap-2">
          <select className="input-brut" value={weather} onChange={(e)=>setWeather(e.target.value)} data-testid="log-weather-filter">
            <option value="">All weather</option>
            {Object.entries(WEATHER_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input-brut" value={statusF} onChange={(e)=>setStatusF(e.target.value)} data-testid="log-status-filter">
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
          </select>
        </div>
        {canWrite && (
          <button className="btn-brut safety" onClick={()=>setShowCreate(true)} data-testid="new-log-btn"><Plus size={16} weight="bold"/> New Daily Log</button>
        )}
      </div>
      {logs === null ? (
        <div className="space-y-2">{[1,2,3].map((i)=><Skeleton key={i} className="h-16"/>)}</div>
      ) : logs.length === 0 ? (
        <Empty title="No daily logs" message="Submit today's daily log to keep everyone informed." />
      ) : (
        <div className="card-brut divide-y-2 divide-ink">
          {logs.map((l)=>(
            <button
              key={l.id}
              onClick={()=>navigate(`/projects/${projectId}/logs/${l.id}`)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted"
              data-testid={`log-row-${l.id}`}
            >
              <div className="mono text-lg font-bold w-24 shrink-0">{l.date.split("-").reverse().join("/")}</div>
              <StatusChip kind="weather" value={l.weather}/>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{l.work_summary || "—"}</div>
                <div className="text-xs text-zinc-600">By {l.submitter?.name || "—"} · Labour: <span className="mono font-bold">{l.labour_count}</span></div>
              </div>
              <span className={clsx("chip", l.status === "submitted" ? "bg-green-600 text-white" : "bg-yellow-400 text-black")}>{l.status}</span>
            </button>
          ))}
        </div>
      )}
      <CreateLogModal open={showCreate} onClose={()=>setShowCreate(false)} onCreated={load} projectId={projectId}/>
    </div>
  );
};

const CreateLogModal = ({ open, onClose, onCreated, projectId }) => {
  const today = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({ date: today, labour_count: 0, work_summary: "", material_summary: "", weather: "sunny", remarks: "", photos: [] });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("submitted");

  const upload = async (files) => {
    setUploading(true);
    try {
      const urls = [...form.photos];
      for (const f of files) {
        if (urls.length >= 10) break;
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await API.post("/uploads/image", fd, { headers: { "Content-Type": "multipart/form-data" }});
        urls.push(data.data.url);
      }
      setForm({ ...form, photos: urls });
    } catch (e) { toast.error(errMsg(e)); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await API.post(`/projects/${projectId}/logs`, { ...form, status: submitStatus });
      toast.success(submitStatus === "submitted" ? "Log submitted" : "Draft saved");
      onCreated();
      onClose();
      setForm({ date: today, labour_count: 0, work_summary: "", material_summary: "", weather: "sunny", remarks: "", photos: [] });
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Daily Log" wide testid="create-log-modal"
      footer={<>
        <button className="btn-brut secondary" onClick={onClose} data-testid="cancel-log">Cancel</button>
        <button className="btn-brut secondary" onClick={()=>{setSubmitStatus("draft"); submit();}} disabled={busy} data-testid="save-draft-log">Save Draft</button>
        <button className="btn-brut safety" onClick={()=>{setSubmitStatus("submitted"); submit();}} disabled={busy || !form.work_summary} data-testid="submit-log">
          {busy ? "Submitting..." : "Submit"}
        </button>
      </>}
    >
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Date *</span>
          <input type="date" className="input-brut mt-1" value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})} data-testid="log-date-input"/>
        </label>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Weather *</span>
          <select className="input-brut mt-1" value={form.weather} onChange={(e)=>setForm({...form,weather:e.target.value})} data-testid="log-weather-input">
            {Object.entries(WEATHER_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Labour Count *</span>
          <input type="number" min="0" className="input-brut mt-1 mono text-xl font-bold" value={form.labour_count} onChange={(e)=>setForm({...form,labour_count:parseInt(e.target.value||"0",10)})} data-testid="log-labour-input"/>
        </label>
        <div/>
        <label className="block md:col-span-2"><span className="text-xs font-bold uppercase tracking-widest">Work summary * (max 2000)</span>
          <textarea rows={4} maxLength={2000} className="input-brut mt-1" value={form.work_summary} onChange={(e)=>setForm({...form,work_summary:e.target.value})} data-testid="log-work-input"/>
        </label>
        <label className="block md:col-span-2"><span className="text-xs font-bold uppercase tracking-widest">Material summary (max 1000)</span>
          <textarea rows={3} maxLength={1000} className="input-brut mt-1" value={form.material_summary} onChange={(e)=>setForm({...form,material_summary:e.target.value})} data-testid="log-material-input"/>
        </label>
        <label className="block md:col-span-2"><span className="text-xs font-bold uppercase tracking-widest">Remarks</span>
          <textarea rows={2} maxLength={1000} className="input-brut mt-1" value={form.remarks} onChange={(e)=>setForm({...form,remarks:e.target.value})} data-testid="log-remarks-input"/>
        </label>
        <div className="md:col-span-2">
          <div className="text-xs font-bold uppercase tracking-widest mb-2">Photos ({form.photos.length}/10)</div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-2">
            {form.photos.map((u,i)=>(
              <div key={i} className="relative border-2 border-ink aspect-square">
                <img src={u} alt="" className="w-full h-full object-cover"/>
                <button type="button" className="absolute top-1 right-1 bg-signal text-white border-2 border-ink w-6 h-6 text-xs font-bold" onClick={()=>setForm({...form, photos: form.photos.filter((_,j)=>j!==i)})} data-testid={`remove-photo-${i}`}>×</button>
              </div>
            ))}
            {form.photos.length < 10 && (
              <label className="border-2 border-dashed border-ink aspect-square flex items-center justify-center cursor-pointer hover:bg-muted text-xs font-bold uppercase tracking-widest text-center p-2" data-testid="upload-photo-btn">
                {uploading ? "Uploading..." : "+ Add photo"}
                <input type="file" accept="image/*" multiple hidden onChange={(e)=>upload(Array.from(e.target.files))}/>
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ============== ISSUES PANEL ==============
const IssuesPanel = ({ projectId, members, currentRole }) => {
  const [issues, setIssues] = useState(null);
  const [statusF, setStatusF] = useState("");
  const [priorityF, setPriorityF] = useState("");
  const [categoryF, setCategoryF] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const canWrite = ["admin", "project_manager", "site_engineer"].includes(currentRole);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get(`/projects/${projectId}/issues`, {
        params: { status: statusF || undefined, priority: priorityF || undefined, category: categoryF || undefined },
      });
      setIssues(data.data);
    } catch (e) { toast.error(errMsg(e)); setIssues([]); }
  }, [projectId, statusF, priorityF, categoryF]);
  useEffect(() => { load(); }, [load]);

  const download = () => {
    const backend = process.env.REACT_APP_BACKEND_URL;
    const tok = localStorage.getItem("access_token");
    const org = localStorage.getItem("org_id");
    fetch(`${backend}/api/v1/projects/${projectId}/issues/export.csv`, { headers: { Authorization: `Bearer ${tok}`, "X-Org-Id": org }})
      .then((r) => r.blob())
      .then((b) => { const url = window.URL.createObjectURL(b); const a = document.createElement("a"); a.href = url; a.download = "issues.csv"; a.click(); window.URL.revokeObjectURL(url); });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex flex-wrap gap-2">
          <select className="input-brut" value={statusF} onChange={(e)=>setStatusF(e.target.value)} data-testid="issue-status-filter">
            <option value="">All statuses</option>
            {Object.entries(ISSUE_STATUS_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input-brut" value={priorityF} onChange={(e)=>setPriorityF(e.target.value)} data-testid="issue-priority-filter">
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input-brut" value={categoryF} onChange={(e)=>setCategoryF(e.target.value)} data-testid="issue-category-filter">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-brut secondary" onClick={download} data-testid="issue-export-csv"><DownloadSimple size={16} weight="bold"/> CSV</button>
          {canWrite && (
            <button className="btn-brut safety" onClick={()=>setShowCreate(true)} data-testid="new-issue-btn"><Plus size={16} weight="bold"/> Raise Issue</button>
          )}
        </div>
      </div>
      {issues === null ? (
        <div className="space-y-2">{[1,2,3].map((i)=><Skeleton key={i} className="h-16"/>)}</div>
      ) : issues.length === 0 ? (
        <Empty title="No issues raised" message="Report safety, quality, design or material issues here." icon={<Warning size={48} weight="fill"/>} />
      ) : (
        <div className="card-brut divide-y-2 divide-ink">
          {issues.map((i)=>(
            <button
              key={i.id}
              onClick={()=>navigate(`/projects/${projectId}/issues/${i.id}`)}
              className={clsx("w-full grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 text-left hover:bg-muted", i.overdue && "bg-red-50")}
              data-testid={`issue-row-${i.id}`}
            >
              <div className="md:col-span-5">
                <div className="font-semibold">{i.title}</div>
                <div className="text-xs text-zinc-600 mt-1">Raised by {i.creator?.name || "—"} · {fmtRelative(i.created_at)}</div>
              </div>
              <div className="md:col-span-2"><StatusChip kind="category" value={i.category}/></div>
              <div className="md:col-span-1"><StatusChip kind="priority" value={i.priority}/></div>
              <div className="md:col-span-2 flex items-center gap-2 text-sm">
                {i.assignee ? <><Avatar user={i.assignee} size={22}/> <span className="truncate">{i.assignee.name}</span></> : <span className="text-zinc-500">—</span>}
              </div>
              <div className="md:col-span-2"><StatusChip kind="issue" value={i.status}/></div>
            </button>
          ))}
        </div>
      )}
      <CreateIssueModal open={showCreate} onClose={()=>setShowCreate(false)} onCreated={load} projectId={projectId} members={members}/>
    </div>
  );
};

const CreateIssueModal = ({ open, onClose, onCreated, projectId, members }) => {
  const [form, setForm] = useState({ title: "", description: "", category: "safety", priority: "medium", assignee_id: "", due_date: "", attachments: [] });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const upload = async (files) => {
    setUploading(true);
    try {
      const urls = [...form.attachments];
      for (const f of files) {
        if (urls.length >= 5) break;
        const fd = new FormData(); fd.append("file", f);
        const { data } = await API.post("/uploads/image", fd, { headers: { "Content-Type": "multipart/form-data" }});
        urls.push(data.data.url);
      }
      setForm({ ...form, attachments: urls });
    } catch (e) { toast.error(errMsg(e)); }
    finally { setUploading(false); }
  };
  const submit = async () => {
    setBusy(true);
    try {
      await API.post(`/projects/${projectId}/issues`, {
        title: form.title, description: form.description || null, category: form.category, priority: form.priority,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        attachments: form.attachments,
      });
      toast.success("Issue raised"); onCreated(); onClose();
      setForm({ title: "", description: "", category: "safety", priority: "medium", assignee_id: "", due_date: "", attachments: [] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Raise Issue" wide testid="create-issue-modal"
      footer={<>
        <button className="btn-brut secondary" onClick={onClose} data-testid="cancel-issue">Cancel</button>
        <button className="btn-brut danger" onClick={submit} disabled={!form.title || busy} data-testid="submit-issue">{busy ? "Raising..." : "Raise Issue"}</button>
      </>}
    >
      <div className="space-y-4">
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Title *</span>
          <input required autoFocus className="input-brut mt-1" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} data-testid="issue-title-input"/>
        </label>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Description</span>
          <textarea rows={4} className="input-brut mt-1" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} data-testid="issue-desc-input"/>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Category *</span>
            <select className="input-brut mt-1" value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})} data-testid="issue-category-input">
              {Object.entries(CATEGORY_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Priority</span>
            <select className="input-brut mt-1" value={form.priority} onChange={(e)=>setForm({...form,priority:e.target.value})} data-testid="issue-priority-input">
              {Object.entries(PRIORITY_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Assignee</span>
            <AssigneeSelect members={members} value={form.assignee_id} onChange={(v)=>setForm({...form, assignee_id: v||""})} testid="issue-assignee-input"/>
          </label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Due date</span>
            <input type="date" className="input-brut mt-1" value={form.due_date} onChange={(e)=>setForm({...form,due_date:e.target.value})} data-testid="issue-due-input"/>
          </label>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest mb-2">Photos ({form.attachments.length}/5)</div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {form.attachments.map((u,i)=>(
              <div key={i} className="relative border-2 border-ink aspect-square">
                <img src={u} alt="" className="w-full h-full object-cover"/>
                <button type="button" className="absolute top-1 right-1 bg-signal text-white border-2 border-ink w-6 h-6 text-xs font-bold" onClick={()=>setForm({...form, attachments: form.attachments.filter((_,j)=>j!==i)})}>×</button>
              </div>
            ))}
            {form.attachments.length < 5 && (
              <label className="border-2 border-dashed border-ink aspect-square flex items-center justify-center cursor-pointer hover:bg-muted text-xs font-bold uppercase tracking-widest text-center p-2">
                {uploading ? "Uploading..." : "+ Photo"}
                <input type="file" accept="image/*" multiple hidden onChange={(e)=>upload(Array.from(e.target.files))}/>
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ============== OVERVIEW ==============
const Overview = ({ project, members, onQuickAdd }) => (
  <div className="grid lg:grid-cols-3 gap-5">
    <div className="lg:col-span-2 space-y-5">
      <div className="card-brut p-5">
        <div className="text-[11px] uppercase tracking-widest text-zinc-500">Progress</div>
        <div className="flex items-end gap-3 mt-1">
          <div className="heading text-6xl">{project.stats.progress_pct}%</div>
          <div className="text-xs uppercase tracking-widest text-zinc-600 mb-2">{project.stats.tasks_done}/{project.stats.tasks_total} tasks done</div>
        </div>
        <div className="h-4 bg-muted border-2 border-ink mt-3">
          <div className="h-full bg-safety" style={{ width: `${project.stats.progress_pct}%` }}/>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Total tasks", project.stats.tasks_total],
          ["Open issues", project.stats.open_issues],
          ["Logs · 7d", project.stats.logs_this_week],
          ["Team", project.stats.team_members],
        ].map(([l,v])=>(
          <div key={l} className="card-brut p-4">
            <div className="mono heading text-4xl">{v}</div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mt-1">{l}</div>
          </div>
        ))}
      </div>
      <div className="card-brut">
        <div className="p-4 border-b-2 border-ink bg-ink text-white flex items-center justify-between">
          <h3 className="heading text-2xl uppercase">Recent Activity</h3>
          <span className="text-[10px] uppercase tracking-widest">Last 10</span>
        </div>
        {project.recent_activity.length === 0 ? (
          <div className="p-6 text-zinc-500">No activity yet.</div>
        ) : (
          <ul className="divide-y-2 divide-ink">
            {project.recent_activity.map((a)=>(
              <li key={a.id} className="p-4 flex items-start gap-3">
                <Avatar user={a.actor} size={28}/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm"><span className="font-bold">{a.actor?.name || "System"}</span> · <span className="mono text-zinc-600">{a.action}</span></div>
                  {a.details && Object.keys(a.details).length > 0 && (
                    <div className="text-xs text-zinc-600 mt-1 truncate">{JSON.stringify(a.details).slice(0,140)}</div>
                  )}
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{fmtRelative(a.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    <div className="space-y-5">
      <div className="card-brut p-4">
        <h3 className="heading text-2xl uppercase mb-3">Quick Add</h3>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-brut safety h-14" onClick={()=>onQuickAdd("task")} data-testid="quick-add-task"><Kanban size={18} weight="bold"/> Task</button>
          <button className="btn-brut secondary h-14" onClick={()=>onQuickAdd("log")} data-testid="quick-add-log"><ClipboardText size={18} weight="bold"/> Log</button>
          <button className="btn-brut danger h-14 col-span-2" onClick={()=>onQuickAdd("issue")} data-testid="quick-add-issue"><Warning size={18} weight="bold"/> Raise Issue</button>
        </div>
      </div>
      <div className="card-brut">
        <div className="p-4 border-b-2 border-ink bg-ink text-white flex items-center justify-between">
          <h3 className="heading text-2xl uppercase">Team</h3>
          <span className="text-[10px] uppercase tracking-widest">{members.length}</span>
        </div>
        <ul className="divide-y-2 divide-ink">
          {members.slice(0,8).map((m)=>(
            <li key={m.user_id} className="p-3 flex items-center gap-3">
              <Avatar user={{name:m.name,email:m.email}} size={30}/>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{m.name || m.email}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-600">{m.role.replace("_"," ")}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

// ============== MAIN ==============
export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("overview");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const { currentRole } = useAuth();
  const navigate = useNavigate();
  const canManage = ["admin", "project_manager"].includes(currentRole);

  const load = useCallback(async () => {
    try {
      const [pRes, mRes] = await Promise.all([
        API.get(`/projects/${projectId}`),
        API.get(`/organizations/current/members`),
      ]);
      setProject(pRes.data.data);
      setMembers(mRes.data.data);
    } catch (e) { toast.error(errMsg(e)); navigate("/projects"); }
  }, [projectId, navigate]);
  useEffect(() => { load(); }, [load]);

  const onQuickAdd = (kind) => {
    if (kind === "task") setTab("tasks");
    if (kind === "log") setTab("logs");
    if (kind === "issue") setTab("issues");
  };

  const archive = async () => {
    try { await API.post(`/projects/${projectId}/archive`); toast.success("Project archived"); navigate("/projects"); }
    catch (e) { toast.error(errMsg(e)); }
  };

  if (!project) return <Loader/>;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <button onClick={()=>navigate("/projects")} className="text-xs uppercase tracking-widest flex items-center gap-1 text-zinc-600 hover:text-ink" data-testid="back-to-projects">
        <ArrowLeft size={14} weight="bold"/> Back to projects
      </button>
      <div className="card-brut p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusChip kind="project" value={project.status}/>
              {project.archived && <span className="chip bg-zinc-500 text-white">Archived</span>}
            </div>
            <h1 className="heading text-4xl md:text-5xl uppercase leading-tight mt-2 break-words">{project.name}</h1>
            {project.description && <p className="text-zinc-700 mt-2 max-w-3xl">{project.description}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 mt-3">
              {project.location && <span className="flex items-center gap-1"><MapPin size={14} weight="bold"/> {project.location}</span>}
              {project.project_manager && <span className="flex items-center gap-1"><Avatar user={project.project_manager} size={18}/> PM: {project.project_manager.name}</span>}
            </div>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <button className="btn-brut secondary" onClick={()=>setShowEdit(true)} data-testid="edit-project-btn">Edit</button>
              {!project.archived && (
                <button className="btn-brut" onClick={()=>setConfirmArchive(true)} data-testid="archive-project-btn"><Archive size={16} weight="bold"/> Archive</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 overflow-x-auto">
        <Tab active={tab==="overview"} onClick={()=>setTab("overview")} testid="tab-overview">Overview</Tab>
        <Tab active={tab==="tasks"} onClick={()=>setTab("tasks")} testid="tab-tasks" count={project.stats.tasks_total}>Tasks</Tab>
        <Tab active={tab==="logs"} onClick={()=>setTab("logs")} testid="tab-logs" count={project.stats.logs_this_week}>Daily Logs</Tab>
        <Tab active={tab==="issues"} onClick={()=>setTab("issues")} testid="tab-issues" count={project.stats.open_issues}>Issues</Tab>
      </div>

      {tab === "overview" && <Overview project={project} members={members} onQuickAdd={onQuickAdd}/>}
      {tab === "tasks" && <TasksPanel projectId={projectId} members={members} currentRole={currentRole}/>}
      {tab === "logs" && <LogsPanel projectId={projectId} currentRole={currentRole}/>}
      {tab === "issues" && <IssuesPanel projectId={projectId} members={members} currentRole={currentRole}/>}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive project?"
        message="Archiving hides this project from the main list but keeps all its data. You can un-archive later."
        confirmLabel="Archive"
        onCancel={()=>setConfirmArchive(false)}
        onConfirm={()=>{ setConfirmArchive(false); archive(); }}
        testid="confirm-archive"
      />
      {showEdit && <EditProjectModal project={project} members={members} onClose={()=>setShowEdit(false)} onSaved={()=>{setShowEdit(false); load();}}/>}
    </div>
  );
}

const EditProjectModal = ({ project, members, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: project.name, description: project.description || "", location: project.location || "",
    status: project.status, project_manager_id: project.project_manager_id || "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await API.patch(`/projects/${project.id}`, {
        name: form.name, description: form.description || null, location: form.location || null,
        status: form.status, project_manager_id: form.project_manager_id || null,
      });
      toast.success("Project updated"); onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Edit Project" testid="edit-project-modal"
      footer={<>
        <button className="btn-brut secondary" onClick={onClose}>Cancel</button>
        <button className="btn-brut safety" onClick={submit} disabled={busy || !form.name} data-testid="save-project">{busy ? "Saving..." : "Save"}</button>
      </>}
    >
      <div className="space-y-4">
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Name *</span>
          <input className="input-brut mt-1" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} data-testid="edit-project-name"/>
        </label>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Location</span>
          <input className="input-brut mt-1" value={form.location} onChange={(e)=>setForm({...form,location:e.target.value})}/>
        </label>
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Description</span>
          <textarea rows={3} className="input-brut mt-1" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Status</span>
            <select className="input-brut mt-1" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} data-testid="edit-project-status">
              {Object.entries(PROJECT_STATUS_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Project Manager</span>
            <select className="input-brut mt-1" value={form.project_manager_id} onChange={(e)=>setForm({...form,project_manager_id:e.target.value})}>
              <option value="">— None —</option>
              {members.filter((m)=>["admin","project_manager"].includes(m.role)).map((m)=>(
                <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </Modal>
  );
};

// (end)
