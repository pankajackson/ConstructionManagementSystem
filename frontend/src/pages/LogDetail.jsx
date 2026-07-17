import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Lock, LockOpen, PencilSimple } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Loader } from "../components/State";
import { StatusChip } from "../components/Chip";
import { Avatar } from "../components/Avatar";
import { Modal, ConfirmDialog } from "../components/Modal";
import { fmtDateTime, WEATHER_LABEL } from "../lib/labels";

export default function LogDetailPage() {
  const { projectId, logId } = useParams();
  const [log, setLog] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [editing, setEditing] = useState(false);
  const { currentRole, user } = useAuth();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { const { data } = await API.get(`/projects/${projectId}/logs/${logId}`); setLog(data.data); }
    catch (e) { toast.error(errMsg(e)); navigate(`/projects/${projectId}`); }
  }, [projectId, logId, navigate]);
  useEffect(() => { load(); }, [load]);

  const unlock = async () => {
    try { await API.post(`/projects/${projectId}/logs/${logId}/unlock`); toast.success("Log unlocked for 2 hours"); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const canEdit = log && (log.status === "draft" && log.submitted_by === user?.id) ||
                  (log && log.status === "submitted" && log.unlocked_until && new Date(log.unlocked_until) > new Date() && (log.submitted_by === user?.id || ["admin","project_manager"].includes(currentRole)));

  if (!log) return <Loader/>;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <button onClick={()=>navigate(`/projects/${projectId}`)} className="text-xs uppercase tracking-widest flex items-center gap-1 text-zinc-600 hover:text-ink" data-testid="back-to-project">
        <ArrowLeft size={14} weight="bold"/> Back to project
      </button>

      <div className="card-brut p-6">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Daily Log</div>
            <h1 className="heading text-4xl uppercase mono">{log.date.split("-").reverse().join("/")}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip kind="weather" value={log.weather}/>
              <span className={`chip ${log.status === "submitted" ? "bg-green-600 text-white" : "bg-yellow-400 text-black"}`}>{log.status}</span>
              {log.submitted_at && <span className="text-[11px] uppercase tracking-widest text-zinc-500">Submitted {fmtDateTime(log.submitted_at)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Avatar user={log.submitter} size={30}/>
              <div>
                <div className="text-sm font-bold">{log.submitter?.name || "—"}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-600">Submitted by</div>
              </div>
            </div>
            {log.status === "submitted" && currentRole === "admin" && (
              <button className="btn-brut" onClick={()=>setConfirmUnlock(true)} data-testid="unlock-log-btn">
                {log.unlocked_until && new Date(log.unlocked_until) > new Date() ? <LockOpen size={16} weight="bold"/> : <Lock size={16} weight="bold"/>}
                Unlock
              </button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-5 border-t-2 border-ink pt-5">
          <div className="border-2 border-ink p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Labour</div>
            <div className="mono heading text-4xl">{log.labour_count}</div>
          </div>
          <div className="border-2 border-ink p-3 md:col-span-2">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Weather</div>
            <div className="heading text-2xl uppercase">{WEATHER_LABEL[log.weather]}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Work summary</div>
          <p className="whitespace-pre-wrap mt-1">{log.work_summary || "—"}</p>
        </div>
        {log.material_summary && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Materials</div>
            <p className="whitespace-pre-wrap mt-1">{log.material_summary}</p>
          </div>
        )}
        {log.remarks && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Remarks</div>
            <p className="whitespace-pre-wrap mt-1">{log.remarks}</p>
          </div>
        )}

        {log.photos && log.photos.length > 0 && (
          <div className="mt-5">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Photos ({log.photos.length})</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {log.photos.map((u, i)=>(
                <button key={i} onClick={()=>setLightbox(u)} className="border-2 border-ink aspect-square overflow-hidden" data-testid={`log-photo-${i}`}>
                  <img src={u} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-75"/>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 bg-zinc-900/90 z-50 flex items-center justify-center p-4" onClick={()=>setLightbox(null)} data-testid="log-lightbox">
          <img src={lightbox} alt="" className="max-h-full max-w-full border-4 border-white"/>
        </div>
      )}
      <ConfirmDialog
        open={confirmUnlock}
        title="Unlock this log?"
        message="This allows editing for 2 hours. Only possible within 24 hours of submission."
        onCancel={()=>setConfirmUnlock(false)}
        onConfirm={()=>{ setConfirmUnlock(false); unlock(); }}
        confirmLabel="Unlock"
      />
    </div>
  );
}
