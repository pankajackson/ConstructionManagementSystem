import React from "react";
import { clsx } from "clsx";
import {
  PROJECT_STATUS_CHIP,
  PROJECT_STATUS_LABEL,
  TASK_STATUS_CHIP,
  TASK_STATUS_LABEL,
  ISSUE_STATUS_CHIP,
  ISSUE_STATUS_LABEL,
  PRIORITY_CHIP,
  PRIORITY_LABEL,
  WEATHER_CHIP,
  WEATHER_LABEL,
  CATEGORY_CHIP,
  CATEGORY_LABEL,
} from "../lib/labels";

const base = "chip";

export const StatusChip = ({ kind, value, className }) => {
  let bg = "bg-white text-zinc-900";
  let label = value;
  if (kind === "project") {
    bg = PROJECT_STATUS_CHIP[value] || bg;
    label = PROJECT_STATUS_LABEL[value] || value;
  } else if (kind === "task") {
    bg = TASK_STATUS_CHIP[value] || bg;
    label = TASK_STATUS_LABEL[value] || value;
  } else if (kind === "issue") {
    bg = ISSUE_STATUS_CHIP[value] || bg;
    label = ISSUE_STATUS_LABEL[value] || value;
  } else if (kind === "priority") {
    bg = PRIORITY_CHIP[value] || bg;
    label = PRIORITY_LABEL[value] || value;
  } else if (kind === "weather") {
    bg = WEATHER_CHIP[value] || bg;
    label = WEATHER_LABEL[value] || value;
  } else if (kind === "category") {
    bg = CATEGORY_CHIP[value] || bg;
    label = CATEGORY_LABEL[value] || value;
  }
  return <span data-testid={`chip-${kind}-${value}`} className={clsx(base, bg, className)}>{label}</span>;
};
