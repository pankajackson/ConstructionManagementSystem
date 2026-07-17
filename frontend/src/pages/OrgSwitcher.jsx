import React from "react";
import { useNavigate } from "react-router-dom";
import { Buildings, Plus, CaretRight } from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABEL } from "../lib/labels";
import { Modal } from "../components/Modal";

const OrgList = ({ onSelect, onCreate }) => {
  const { orgs } = useAuth();
  return (
    <div className="space-y-3">
      {orgs.map((o) => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          className="w-full card-brut p-4 flex items-center gap-3 text-left hover:bg-muted"
          data-testid={`org-select-${o.id}`}
        >
          <div className="w-11 h-11 bg-safety border-2 border-ink flex items-center justify-center shrink-0">
            <Buildings size={22} weight="fill" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="heading text-2xl uppercase truncate">{o.name}</div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-600">{ROLE_LABEL[o.role]}</div>
          </div>
          <CaretRight size={20} weight="bold" />
        </button>
      ))}
      <button
        onClick={onCreate}
        className="w-full card-brut p-4 flex items-center gap-3 text-left hover:bg-muted"
        data-testid="org-create-new-btn"
      >
        <div className="w-11 h-11 bg-white border-2 border-ink flex items-center justify-center shrink-0">
          <Plus size={22} weight="bold" />
        </div>
        <div className="flex-1">
          <div className="heading text-2xl uppercase">New Organization</div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-600">Start fresh</div>
        </div>
      </button>
    </div>
  );
};

export default function OrgSwitcher({ asModal = false, onClose }) {
  const { setActiveOrg } = useAuth();
  const navigate = useNavigate();

  const select = (id) => {
    setActiveOrg(id);
    if (asModal) onClose?.();
    navigate("/projects", { replace: true });
  };
  const create = () => {
    if (asModal) onClose?.();
    navigate("/setup");
  };

  if (asModal) {
    return (
      <Modal open title="Switch Organization" onClose={onClose} testid="org-switch-modal">
        <OrgList onSelect={select} onCreate={create} />
      </Modal>
    );
  }
  return (
    <div className="min-h-screen bg-muted p-6 flex items-center justify-center">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Choose organization</div>
          <div className="heading text-4xl uppercase">Your workspaces</div>
        </div>
        <OrgList onSelect={select} onCreate={create} />
      </div>
    </div>
  );
}
