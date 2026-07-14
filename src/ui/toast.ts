import { el } from '../dom';

type ToastKind = 'info' | 'error';

export function notify(message: string, kind: ToastKind = 'info', durationMs = 4000): void {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const toast = el('div', { class: `toast${kind === 'error' ? ' toast--error' : ''}`, role: 'status' }, [
    message,
  ]);
  region.append(toast);
  window.setTimeout(() => {
    toast.remove();
  }, durationMs);
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Something went wrong. Please try again.';
}
