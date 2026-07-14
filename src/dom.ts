type Attrs = Record<string, string | number | boolean | undefined | null>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      node.className = String(value);
    } else if (key === 'style' || key === 'dataset') {
      if (key === 'style') node.setAttribute('style', String(value));
    } else if (key in node && key !== 'list' && key !== 'form') {
      try {
        (node as unknown as Record<string, unknown>)[key] = value;
      } catch {
        node.setAttribute(key, String(value));
      }
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

export function mount(root: Element, ...nodes: Child[]): void {
  clear(root);
  for (const n of nodes) {
    if (n === null || n === undefined || n === false) continue;
    root.append(typeof n === 'string' ? document.createTextNode(n) : n);
  }
}

export function setText(node: HTMLElement, value: string): void {
  node.textContent = value;
}

export function formatMatchDateTime(dateIso: string, time: string): string {
  if (!dateIso) return '';
  const parsed = new Date(`${dateIso}T${time || '00:00'}`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  const dateLabel = parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (!time) return dateLabel;
  const timeLabel = parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateLabel} · ${timeLabel}`;
}
