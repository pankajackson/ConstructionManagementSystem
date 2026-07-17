import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, MagnifyingGlass, Buildings, MapPin, ListChecks, Warning, ClipboardText, Users } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { StatusChip } from "../components/Chip";
import { Modal } from "../components/Modal";
import { Empty, Loader, Skeleton } from "../components/State";
import { PROJECT_STATUS_LABEL } from "../lib/labels";

const ProjectCard = ({ p, onOpen }) => (
  <button
    onClick={() => onOpen(p.id)}
    className="card-brut p-5 text-left w-full hover:bg-muted flex flex-col gap-3"
    data-testid={`project-card-${p.id}`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">Project</div>
        <div className="heading text-2xl uppercase leading-tight break-words">{p.name}</div>
      </div>
      <StatusChip kind="project" value={p.status} />
    </div>
    {p.location && (
      <div className="text-xs flex items-center gap-1 text-zinc-600">
        <MapPin size={14} weight="bold" /> {p.location}
      </div>
    )}
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-3 bg-muted border-2 border-ink relative">
        <div className="h-full bg-safety" style={{ width: `${p.stats.progress_pct}%` }} />
      </div>
      <div className="mono text-sm font-bold w-10 text-right">{p.stats.progress_pct}%</div>
    </div>
    <div className="grid grid-cols-3 border-2 border-ink divide-x-2 divide-ink text-center">
      <div className="p-2">
        <div className="mono text-2xl font-bold leading-none">{p.stats.tasks_total}</div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mt-1">Tasks</div>
      </div>
      <div className="p-2">
        <div className="mono text-2xl font-bold leading-none">{p.stats.open_issues}</div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mt-1">Open Issues</div>
      </div>
      <div className="p-2">
        <div className="mono text-2xl font-bold leading-none">{p.stats.logs_this_week}</div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mt-1">Logs · 7d</div>
      </div>
    </div>
  </button>
);

const CreateProjectModal = ({ open, onClose, onCreated }) => {
  const [form, setForm] = useState({ name: "", description: "", location: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await API.post("/projects", form);
      toast.success("Project created");
      onCreated(data.data);
      onClose();
      setForm({ name: "", description: "", location: "" });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Project"
      testid="create-project-modal"
      footer={
        <>
          <button className="btn-brut secondary" onClick={onClose} data-testid="cancel-project">Cancel</button>
          <button className="btn-brut safety" onClick={submit} disabled={busy || !form.name} data-testid="submit-project">
            {busy ? "Creating..." : "Create"}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest">Project name *</span>
          <input
            required
            autoFocus
            className="input-brut mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            data-testid="project-name-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest">Location</span>
          <input
            className="input-brut mt-1"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            data-testid="project-location-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest">Description</span>
          <textarea
            className="input-brut mt-1"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            data-testid="project-desc-input"
          />
        </label>
      </form>
    </Modal>
  );
};

export default function ProjectsPage() {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const { currentRole } = useAuth();
  const canCreate = ["admin", "project_manager"].includes(currentRole);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get("/projects", { params: { q: q || undefined, status: status || undefined } });
      setItems(data.data);
    } catch (e) {
      toast.error(errMsg(e));
      setItems([]);
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Overview</div>
          <h1 className="heading text-4xl md:text-5xl uppercase">Projects</h1>
        </div>
        {canCreate && (
          <button className="btn-brut safety" onClick={() => setShowCreate(true)} data-testid="new-project-btn">
            <Plus size={18} weight="bold" /> New Project
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2" size={18} weight="bold" />
          <input
            className="input-brut pl-10"
            placeholder="Search projects..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="project-search-input"
          />
        </div>
        <select
          className="input-brut max-w-[220px]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          data-testid="project-status-filter"
        >
          <option value="">All statuses</option>
          {Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {items === null ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty
          title="No projects yet"
          message={canCreate ? "Create your first project to start tracking tasks, logs and issues." : "You don't have any projects yet in this organization."}
          icon={<Buildings size={48} weight="fill" />}
          action={
            canCreate && (
              <button className="btn-brut safety" onClick={() => setShowCreate(true)} data-testid="empty-new-project-btn">
                <Plus size={18} weight="bold" /> Create Project
              </button>
            )
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {items.map((p) => (
            <ProjectCard key={p.id} p={p} onOpen={(id) => navigate(`/projects/${id}`)} />
          ))}
        </div>
      )}

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => load()}
      />
    </div>
  );
}
