import React, { useState } from "react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Warning as WarningIcon, CalendarBlank } from "@phosphor-icons/react";
import { API, errMsg } from "../api/client";
import { StatusChip } from "./Chip";
import { Avatar } from "./Avatar";
import { fmtDate, TASK_STATUS_LABEL } from "../lib/labels";

// Native HTML5 drag-and-drop Kanban board.
// Columns: To-Do -> In Progress -> Done
// Dragging a task onto a column PATCHes /api/v1/projects/{pid}/tasks/{tid} with the new status.
// Server-side RBAC still applies (site_engineer can't move backwards; PATCH will 403 with a toast).

const COLUMNS = [
  { key: "todo", label: "To-Do", bg: "bg-white", tint: "bg-zinc-100" },
  { key: "in_progress", label: "In Progress", bg: "bg-blue-50", tint: "bg-blue-100" },
  { key: "done", label: "Done", bg: "bg-green-50", tint: "bg-green-100" },
];

const KanbanCard = ({ task, onDragStart, onOpen }) => (
  <div
    draggable
    onDragStart={(e) => onDragStart(e, task)}
    onClick={() => onOpen(task.id)}
    className={clsx(
      "card-brut p-3 cursor-grab active:cursor-grabbing hover:bg-muted transition-colors",
      task.overdue && "border-signal"
    )}
    data-testid={`kanban-card-${task.id}`}
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="font-semibold text-sm break-words flex-1">{task.title}</div>
      <StatusChip kind="priority" value={task.priority} className="!text-[10px] !px-1.5 shrink-0" />
    </div>
    <div className="flex items-center justify-between mt-2 pt-2 border-t-2 border-ink text-xs">
      <div className="flex items-center gap-1 min-w-0">
        {task.assignee ? (
          <>
            <Avatar user={task.assignee} size={20} />
            <span className="truncate">{task.assignee.name?.split(" ")[0]}</span>
          </>
        ) : (
          <span className="text-zinc-500">Unassigned</span>
        )}
      </div>
      {task.due_date && (
        <div className={clsx("flex items-center gap-1 mono", task.overdue && "text-signal font-bold")}>
          <CalendarBlank size={12} weight="bold" />
          {fmtDate(task.due_date)}
        </div>
      )}
    </div>
    {task.overdue && (
      <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-signal">
        <WarningIcon size={12} weight="fill" /> Overdue
      </div>
    )}
  </div>
);

export const KanbanBoard = ({ projectId, tasks, canWrite, onChanged }) => {
  const [dragOver, setDragOver] = useState(null);
  const navigate = useNavigate();

  const handleDragStart = (e, task) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    // save from-status for optional revert-visualization
    e.dataTransfer.setData("application/x-from-status", task.status);
  };

  const handleDragOver = (e, col) => {
    if (!canWrite) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(col);
  };

  const handleDrop = async (e, col) => {
    e.preventDefault();
    setDragOver(null);
    if (!canWrite) {
      toast.error("Viewers cannot move tasks.");
      return;
    }
    const taskId = e.dataTransfer.getData("text/plain");
    const fromStatus = e.dataTransfer.getData("application/x-from-status");
    if (!taskId || fromStatus === col.key) return;

    // Optimistic update
    const prevTasks = tasks;
    const optimistic = tasks.map((t) => (t.id === taskId ? { ...t, status: col.key } : t));
    onChanged?.(optimistic, { optimistic: true });

    try {
      await API.patch(`/projects/${projectId}/tasks/${taskId}`, { status: col.key });
      toast.success(`Moved to ${TASK_STATUS_LABEL[col.key]}`);
      onChanged?.(null, { reload: true });
    } catch (err) {
      toast.error(errMsg(err));
      onChanged?.(prevTasks, { revert: true });
    }
  };

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.key] = tasks.filter((t) => t.status === c.key);
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="kanban-board">
      {COLUMNS.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => handleDragOver(e, col)}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => handleDrop(e, col)}
          className={clsx(
            "card-brut flex flex-col min-h-[340px]",
            dragOver?.key === col.key ? "ring-4 ring-safety" : ""
          )}
          data-testid={`kanban-col-${col.key}`}
        >
          <div className={clsx("flex items-center justify-between border-b-2 border-ink px-3 py-2", col.tint)}>
            <div className="flex items-center gap-2">
              <StatusChip kind="task" value={col.key} />
              <span className="text-[11px] uppercase tracking-widest font-bold text-zinc-700">
                {grouped[col.key].length}
              </span>
            </div>
          </div>
          <div className={clsx("flex-1 p-2 space-y-2", col.bg)}>
            {grouped[col.key].length === 0 ? (
              <div className="h-24 border-2 border-dashed border-zinc-400 flex items-center justify-center text-xs uppercase tracking-widest text-zinc-500">
                {canWrite ? "Drop tasks here" : "Empty"}
              </div>
            ) : (
              grouped[col.key].map((t) => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  onDragStart={handleDragStart}
                  onOpen={(id) => navigate(`/projects/${projectId}/tasks/${id}`)}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
