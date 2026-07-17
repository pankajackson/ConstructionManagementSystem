import React from "react";
import { clsx } from "clsx";

export const Skeleton = ({ className }) => <div className={clsx("skeleton", className)} />;

export const Empty = ({ title, message, action, icon }) => (
  <div className="card-brut p-8 text-center flex flex-col items-center gap-4" data-testid="empty-state">
    <div className="text-5xl">{icon || "◇"}</div>
    <h3 className="heading text-2xl uppercase">{title}</h3>
    <p className="text-zinc-600 max-w-md">{message}</p>
    {action}
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="card-brut p-6 flex flex-col items-start gap-3 border-signal" data-testid="error-state">
    <h3 className="heading text-2xl uppercase text-signal">Something went wrong</h3>
    <p className="text-sm">{message}</p>
    {onRetry && (
      <button className="btn-brut safety" onClick={onRetry} data-testid="retry-btn">
        Retry
      </button>
    )}
  </div>
);

export const Loader = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-10 h-10 border-4 border-ink border-t-transparent animate-spin" />
  </div>
);
