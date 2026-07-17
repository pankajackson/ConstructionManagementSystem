import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Warning } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Loader } from "../components/State";
import { StatusChip } from "../components/Chip";
import { Avatar } from "../components/Avatar";
import { Modal, ConfirmDialog } from "../components/Modal";
import { fmtDate, fmtDateTime, CATEGORY_LABEL, PRIORITY_LABEL } from "../lib/labels";

const StatusChangeModal = ({ open, onClose, onConfirm, target }) => {
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) { setNote(""); setReason(""); }}, [open]);
  const needsNote = target === "resolved";
  const needsReason = target === "open";
  return (
    <Modal open={open} onClose={onClose} title={`Move to ${target?.replace("_", " ")}`} testid="issue-status-modal"
      footer={<>
        <button className="btn-brut secondary" onClick={onClose}>Cancel</button>
        <button className="btn-brut safety" onClick={()=>onConfirm({ resolution_note: note, reopen_reason: reason })} data-testid="confirm-issue-status"
          disabled={(needsNote && !note.trim()) || (needsReason && !reason.trim())}
        >Confirm</button>
      </>}
    >
      {needsNote && (
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Resolution note *</span>
          <textarea rows={4} className="input-brut mt-1" value={note} onChange={(e)=>setNote(e.target.value)} data-testid="resolution-note-input"/>
        </label>
      )}
      {needsReason && (
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Reason for reopening *</span>
          <textarea rows={3} className="input-brut mt-1" value={reason} onChange={(e)=>setReason(e.target.value)} data-testid="reopen-reason-input"/>
        </label>
      )}
      {!needsNote && !needsReason && <p className="text-sm">Confirm status change?</p>}
    </Modal>
  );
};

export default function IssueDetailPage() {
  const { projectId, issueId } = useParams();
  const [issue, setIssue] = useState(null);
  const [members, setMembers] = useState([]);
  const [statusTarget, setStatusTarget] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const { currentRole } = useAuth();
  const navigate = useNavigate();
  const canWrite = ["admin","project_manager","site_engineer"].includes(currentRole);
  const canClose = ["admin","project_manager"].includes(currentRole);

  const load = useCallback(async () => {
    try {
      const [i, m] = await Promise.all([
        API.get(`/projects/${projectId}/issues/${issueId}`),
        API.get(`/organizations/current/members`),
      ]);
      setIssue(i.data.data); setMembers(m.data.data);
    } catch (e) { toast.error(errMsg(e)); navigate(`/projects/${projectId}`); }
  }, [projectId, issueId, navigate]);
  useEffect(() => { load(); }, [load]);

  const changeStatus = async ({ resolution_note, reopen_reason }) => {
    try {
      await API.post(`/projects/${projectId}/issues/${issueId}/status`, { status: statusTarget, resolution_note: resolution_note || null, reopen_reason: reopen_reason || null });
      toast.success(`Moved to ${statusTarget.replace("_"," ")}`);
      setStatusTarget(null);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const update = async (patch) => {
    try { await API.patch(`/projects/${projectId}/issues/${issueId}`, patch); load(); toast.success("Updated"); }
    catch (e) { toast.error(errMsg(e)); }
  };

  if (!issue) return <Loader/>;

  const allowedTargets = {
    open: ["in_progress","resolved"],
    in_progress: ["open","resolved"],
    resolved: ["open"].concat(canClose ? ["closed"] : []),
    closed: canClose ? ["open"] : [],
  }[issue.status] || [];

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <button onClick={()=>navigate(`/projects/${projectId}`)} className="text-xs uppercase tracking-widest flex items-center gap-1 text-zinc-600 hover:text-ink" data-testid="back-to-project">
        <ArrowLeft size={14} weight="bold"/> Back to project
      </button>
      <div className="card-brut p-6">
        <div className="flex flex-wrap gap-2 mb-3">
          <StatusChip kind="issue" value={issue.status}/>
          <StatusChip kind="category" value={issue.category}/>
          <StatusChip kind="priority" value={issue.priority}/>
          {issue.overdue && <span className="chip bg-signal text-white"><Warning size={12} weight="bold"/> Overdue</span>}
        </div>
        <h1 className="heading text-4xl uppercase leading-tight break-words">{issue.title}</h1>
        {issue.description && <p className="mt-3 text-zinc-700 whitespace-pre-wrap">{issue.description}</p>}

        <div className="grid md:grid-cols-3 gap-4 mt-5 border-t-2 border-ink pt-5 text-sm">
          <div><div className="text-[10px] uppercase tracking-widest text-zinc-500">Raised by</div><div className="mt-1 flex items-center gap-2"><Avatar user={issue.creator} size={22}/> {issue.creator?.name || "—"}</div></div>
          <div><div className="text-[10px] uppercase tracking-widest text-zinc-500">Assigned to</div>
            {canWrite ? (
              <select className="input-brut mt-1" value={issue.assignee_id || ""} onChange={(e)=>update({assignee_id: e.target.value || null})} data-testid="issue-assignee-select">
                <option value="">Unassigned</option>
                {members.map((m)=><option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
              </select>
            ) : (
              <div className="mt-1">{issue.assignee?.name || "—"}</div>
            )}
          </div>
          <div><div className="text-[10px] uppercase tracking-widest text-zinc-500">Due date</div><div className="mt-1 mono">{fmtDate(issue.due_date)}</div></div>
        </div>

        {canWrite && (
          <div className="mt-5 border-t-2 border-ink pt-5">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Move status</div>
            <div className="flex flex-wrap gap-2">
              {allowedTargets.map((k)=>(
                <button
                  key={k}
                  className="btn-brut secondary"
                  onClick={()=>{ if (k === "closed") setConfirmClose(true); else setStatusTarget(k); }}
                  data-testid={`issue-move-${k}`}
                >
                  → {k.replace("_"," ")}
                </button>
              ))}
              {allowedTargets.length === 0 && <span className="text-sm text-zinc-500">No available transitions.</span>}
            </div>
          </div>
        )}

        {issue.resolution_note && (
          <div className="mt-5 border-2 border-ink p-3 bg-muted">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Resolution ({fmtDateTime(issue.resolved_at)} by {issue.resolver?.name || "—"})</div>
            <div className="whitespace-pre-wrap mt-1">{issue.resolution_note}</div>
          </div>
        )}
        {issue.reopen_reason && (
          <div className="mt-3 border-2 border-signal p-3 bg-red-50">
            <div className="text-[10px] uppercase tracking-widest text-signal">Reopen reason</div>
            <div className="whitespace-pre-wrap mt-1">{issue.reopen_reason}</div>
          </div>
        )}

        {issue.attachments && issue.attachments.length > 0 && (
          <div className="mt-5">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Attachments</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {issue.attachments.map((a)=>(
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="border-2 border-ink aspect-square block overflow-hidden">
                  <img src={a.url} alt="" className="w-full h-full object-cover"/>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <StatusChangeModal open={!!statusTarget && statusTarget!=="closed"} target={statusTarget} onClose={()=>setStatusTarget(null)} onConfirm={changeStatus}/>
      <ConfirmDialog
        open={confirmClose}
        danger
        title="Close this issue?"
        message="Closing an issue permanently marks it as done. Only Admin/PM can reopen closed issues."
        onCancel={()=>setConfirmClose(false)}
        onConfirm={()=>{ setConfirmClose(false); setStatusTarget("closed"); changeStatus({}); }}
        confirmLabel="Close Issue"
        testid="confirm-close-issue"
      />
    </div>
  );
}
