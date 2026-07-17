import React from "react";
import { clsx } from "clsx";
import { initials } from "../lib/labels";

export const Avatar = ({ user, size = 32, className }) => {
  if (!user) {
    return (
      <div
        className={clsx("border-2 border-ink bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold", className)}
        style={{ width: size, height: size, fontSize: size / 2.5 }}
      >
        ?
      </div>
    );
  }
  return (
    <div
      className={clsx("border-2 border-ink bg-safety text-ink flex items-center justify-center font-bold", className)}
      style={{ width: size, height: size, fontSize: size / 2.6 }}
      title={user.name || user.email}
    >
      {initials(user.name, user.email)}
    </div>
  );
};
