// Design tokens shared with the web app so the two clients look consistent.
export const COLORS = {
  ink: "#09090B",
  paper: "#FFFFFF",
  muted: "#F4F4F5",
  rule: "#A1A1AA",
  safety: "#FBBF24",
  signal: "#DC2626",
  ok: "#16A34A",
  info: "#2563EB",
};

export const CHIP_BG = {
  project: { on_track: "#16A34A", delayed: "#DC2626", on_hold: "#FBBF24", completed: "#09090B" },
  task: { todo: "#FFFFFF", in_progress: "#2563EB", done: "#16A34A" },
  issue: { open: "#DC2626", in_progress: "#F97316", resolved: "#2563EB", closed: "#27272A" },
  priority: { low: "#71717A", medium: "#FBBF24", high: "#EA580C", critical: "#DC2626" },
  weather: { sunny: "#FBBF24", cloudy: "#64748B", rainy: "#0284C7", stopped_work: "#DC2626" },
  category: { safety: "#DC2626", quality: "#4F46E5", design: "#9333EA", material: "#0D9488", other: "#52525B" },
};

export const LABEL = {
  project: { on_track: "On Track", delayed: "Delayed", on_hold: "On Hold", completed: "Completed" },
  task: { todo: "To-Do", in_progress: "In Progress", done: "Done" },
  issue: { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" },
  priority: { low: "Low", medium: "Medium", high: "High", critical: "Critical" },
  weather: { sunny: "Sunny", cloudy: "Cloudy", rainy: "Rainy", stopped_work: "Stopped Work" },
  category: { safety: "Safety", quality: "Quality", design: "Design", material: "Material", other: "Other" },
  role: { admin: "Admin", project_manager: "Project Manager", site_engineer: "Site Engineer", viewer: "Viewer" },
};
