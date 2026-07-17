import React, { useEffect } from "react";
import { clsx } from "clsx";
import { X } from "@phosphor-icons/react";

export const Modal = ({ open, title, onClose, children, footer, wide = false, testid }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/80 flex items-start md:items-center justify-center p-4 overflow-y-auto" data-testid={testid || "modal"}>
      <div
        className={clsx("card-brut w-full my-8", wide ? "max-w-3xl" : "max-w-lg")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-ink px-5 py-3 bg-ink text-white">
          <h2 className="heading text-2xl uppercase tracking-tight" data-testid="modal-title">{title}</h2>
          <button className="p-1 hover:bg-white/10" onClick={onClose} data-testid="modal-close" aria-label="Close">
            <X size={22} weight="bold" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="border-t-2 border-ink px-5 py-3 bg-muted flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export const ConfirmDialog = ({ open, title, message, confirmLabel = "Confirm", danger = false, onCancel, onConfirm, testid }) => (
  <Modal open={open} onClose={onCancel} title={title} testid={testid}
    footer={
      <>
        <button className="btn-brut secondary" onClick={onCancel} data-testid="confirm-cancel">Cancel</button>
        <button className={clsx("btn-brut", danger ? "danger" : "safety")} onClick={onConfirm} data-testid="confirm-ok">
          {confirmLabel}
        </button>
      </>
    }
  >
    <p className="text-base leading-relaxed" data-testid="confirm-message">{message}</p>
  </Modal>
);
