import React, { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Buildings } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function OrgSetupPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const { refreshMe, setActiveOrg } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data } = await API.post("/organizations", { name: name.trim(), description });
      await refreshMe();
      setActiveOrg(data.data.id);
      toast.success("Organization created");
      navigate("/projects", { replace: true });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-12 h-12 bg-ink border-2 border-ink flex items-center justify-center">
            <Buildings size={26} weight="fill" color="#fbbf24" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-500">Getting started</div>
            <div className="heading text-3xl uppercase">Create your organization</div>
          </div>
        </div>
        <form onSubmit={submit} className="card-brut p-6 space-y-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest">Organization name</span>
            <input
              className="input-brut mt-1"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Skyline Constructions Pvt Ltd"
              data-testid="org-name-input"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest">Description</span>
            <textarea
              className="input-brut mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does your company build?"
              data-testid="org-desc-input"
              rows={3}
            />
          </label>
          <button className="btn-brut safety w-full" disabled={busy || !name.trim()} data-testid="org-create-btn">
            {busy ? "Creating..." : "Create Organization"}
          </button>
        </form>
      </div>
    </div>
  );
}
