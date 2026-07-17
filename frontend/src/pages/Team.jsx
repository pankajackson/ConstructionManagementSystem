import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, UserPlus } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Loader } from "../components/State";
import { Avatar } from "../components/Avatar";
import { Modal, ConfirmDialog } from "../components/Modal";
import { ROLE_LABEL } from "../lib/labels";

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
        <label className="block"><span className="text-xs font-bold uppercase tracking-widest">Role *</span>
          <select className="input-brut mt-1" value={role} onChange={(e)=>setRole(e.target.value)} data-testid="invite-role-input">
            {Object.entries(ROLE_LABEL).map(([k, v])=><option key={k} value={k}>{v}</option>)}
          </select>
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
  const { currentRole, user } = useAuth();
  const isAdmin = currentRole === "admin";

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

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Organization</div>
          <h1 className="heading text-4xl md:text-5xl uppercase">Team</h1>
        </div>
        {isAdmin && (
          <button className="btn-brut safety" onClick={()=>setShowInvite(true)} data-testid="invite-member-btn"><UserPlus size={18} weight="bold"/> Invite Member</button>
        )}
      </div>
      <div className="card-brut divide-y-2 divide-ink">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 bg-ink text-white text-[11px] uppercase tracking-widest font-bold">
          <div className="col-span-5">Member</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {members.map((m)=>(
          <div key={m.membership_id} className="grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 items-center" data-testid={`member-row-${m.user_id}`}>
            <div className="md:col-span-5 flex items-center gap-3">
              <Avatar user={{name:m.name,email:m.email}} size={36}/>
              <div className="min-w-0">
                <div className="font-bold truncate">{m.name || m.email}</div>
                <div className="text-xs text-zinc-600 truncate">{m.email}</div>
              </div>
            </div>
            <div className="md:col-span-3">
              {isAdmin && m.user_id !== user?.id ? (
                <select className="input-brut" value={m.role} onChange={(e)=>changeRole(m, e.target.value)} data-testid={`role-select-${m.user_id}`}>
                  {Object.entries(ROLE_LABEL).map(([k, v])=><option key={k} value={k}>{v}</option>)}
                </select>
              ) : (
                <span className="text-sm font-semibold uppercase tracking-wider">{ROLE_LABEL[m.role]}</span>
              )}
            </div>
            <div className="md:col-span-2">
              <span className={`chip ${m.is_active ? "bg-green-600 text-white" : "bg-zinc-500 text-white"}`}>{m.is_active ? "Active" : "Deactivated"}</span>
            </div>
            <div className="md:col-span-2 flex justify-start md:justify-end">
              {isAdmin && m.user_id !== user?.id && (
                <button className="btn-brut secondary text-xs h-10" onClick={()=>setConfirmDeact(m)} data-testid={`deact-btn-${m.user_id}`}>
                  {m.is_active ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          </div>
        ))}
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
