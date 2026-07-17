// Central formatting + label helpers.
import { format, parseISO } from "date-fns";

export const fmtDate = (v) => {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? parseISO(v) : v;
    return format(d, "dd/MM/yyyy");
  } catch {
    return "—";
  }
};

export const fmtDateTime = (v) => {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? parseISO(v) : v;
    return format(d, "dd/MM/yyyy HH:mm");
  } catch {
    return "—";
  }
};

export const fmtRelative = (v) => {
  if (!v) return "";
  const d = typeof v === "string" ? parseISO(v) : v;
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(v);
};

export const ROLE_LABEL = {
  admin: "Admin",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  viewer: "Viewer",
};

export const PROJECT_STATUS_LABEL = {
  on_track: "On Track",
  delayed: "Delayed",
  on_hold: "On Hold",
  completed: "Completed",
};

export const TASK_STATUS_LABEL = {
  todo: "To-Do",
  in_progress: "In Progress",
  done: "Done",
};

export const ISSUE_STATUS_LABEL = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const WEATHER_LABEL = {
  sunny: "Sunny",
  cloudy: "Cloudy",
  rainy: "Rainy",
  stopped_work: "Stopped Work",
};

export const CATEGORY_LABEL = {
  safety: "Safety",
  quality: "Quality",
  design: "Design",
  material: "Material",
  other: "Other",
};

export const PROJECT_STATUS_CHIP = {
  on_track: "bg-green-600 text-white",
  delayed: "bg-red-600 text-white",
  on_hold: "bg-yellow-400 text-black",
  completed: "bg-zinc-900 text-white",
};

export const TASK_STATUS_CHIP = {
  todo: "bg-white text-zinc-900",
  in_progress: "bg-blue-600 text-white",
  done: "bg-green-600 text-white",
};

export const ISSUE_STATUS_CHIP = {
  open: "bg-red-600 text-white",
  in_progress: "bg-orange-500 text-white",
  resolved: "bg-blue-600 text-white",
  closed: "bg-zinc-800 text-white",
};

export const PRIORITY_CHIP = {
  low: "bg-zinc-500 text-white",
  medium: "bg-yellow-400 text-black",
  high: "bg-orange-600 text-white",
  critical: "bg-red-600 text-white",
};

export const WEATHER_CHIP = {
  sunny: "bg-amber-400 text-black",
  cloudy: "bg-slate-500 text-white",
  rainy: "bg-sky-600 text-white",
  stopped_work: "bg-red-600 text-white",
};

export const CATEGORY_CHIP = {
  safety: "bg-red-600 text-white",
  quality: "bg-indigo-600 text-white",
  design: "bg-purple-600 text-white",
  material: "bg-teal-600 text-white",
  other: "bg-zinc-600 text-white",
};

export const initials = (name = "", email = "") => {
  const n = (name || email || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
