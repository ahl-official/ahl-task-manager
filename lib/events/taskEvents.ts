type Listener = () => void;

// In-memory set of connected listeners for real-time task update notifications
const listeners = new Set<Listener>();

export function subscribeTaskEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyTaskUpdated(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      listeners.delete(listener);
    }
  }
}

