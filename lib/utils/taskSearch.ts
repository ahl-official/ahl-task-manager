export function matchesTaskSearch(task: { taskId: string; description: string }, query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const id = text.match(/^t-?(\d+)$/);
  if (id) return task.taskId.toUpperCase() === 'T-' + id[1].padStart(4, '0');
  return task.taskId.toLowerCase().includes(text) || task.description.toLowerCase().includes(text);
}
