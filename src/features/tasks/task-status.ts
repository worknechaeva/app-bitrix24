export const TASK_STATUSES = ["new", "in_progress", "completed", "unknown"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  completed: "Завершена",
  unknown: "Неизвестно",
};

export function mapBitrixTaskStatus(value: unknown): TaskStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["1", "2", "new", "pending"].includes(normalized)) return "new";
  if (["3", "4", "in_progress", "in-progress"].includes(normalized)) return "in_progress";
  if (["5", "completed", "done"].includes(normalized)) return "completed";
  return "unknown";
}
