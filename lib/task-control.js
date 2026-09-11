const activeTasks = new Map();

export function startTask(id) {
  activeTasks.get(id)?.abort();
  const controller = new AbortController();
  activeTasks.set(id, controller);
  return controller;
}

export function finishTask(id, controller) {
  if (activeTasks.get(id) === controller) activeTasks.delete(id);
}

export function cancelTask(id) {
  const controller = activeTasks.get(id);
  if (!controller) return false;
  controller.abort();
  activeTasks.delete(id);
  return true;
}
