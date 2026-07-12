// Global toast queue — the app-wide notification pattern. Calm: short-lived,
// bottom of the screen, never blocks, never punitive.
export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
}

let nextId = 1;

export const toastState = $state<{ items: Toast[] }>({ items: [] });

export function showToast(message: string, kind: Toast['kind'] = 'info', durationMs = 3500): void {
  const id = nextId++;
  toastState.items = [...toastState.items, { id, message, kind }];
  setTimeout(() => dismissToast(id), durationMs);
}

export function dismissToast(id: number): void {
  toastState.items = toastState.items.filter((t) => t.id !== id);
}
