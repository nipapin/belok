export type OverlayId = "walkthrough" | "push-prompt";

const open = new Set<OverlayId>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setOverlayOpen(id: OverlayId, isOpen: boolean) {
  if (isOpen) open.add(id);
  else open.delete(id);
  notify();
}

export function isAnyOverlayOpen() {
  return open.size > 0;
}

export function subscribeOverlays(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
