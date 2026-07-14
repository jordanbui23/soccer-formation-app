export interface RouteContext {
  path: string;
  params: Record<string, string>;
  hashParams: URLSearchParams;
}

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

interface CompiledRoute {
  regex: RegExp;
  keys: string[];
  handler: RouteHandler;
}

function compile(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = pattern
    .replace(/\/+$/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '*' : `\\${m}`))
    .replace(/:(\w+)/g, (_m, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
  return { regex: new RegExp(`^${source || '/'}/?$`), keys };
}

export class Router {
  private routes: CompiledRoute[] = [];
  private notFound: RouteHandler = () => undefined;

  add(pattern: string, handler: RouteHandler): this {
    const { regex, keys } = compile(pattern);
    this.routes.push({ regex, keys, handler });
    return this;
  }

  setNotFound(handler: RouteHandler): this {
    this.notFound = handler;
    return this;
  }

  start(): void {
    window.addEventListener('popstate', () => void this.resolve());
    document.addEventListener('click', (e) => this.onClick(e));
    void this.resolve();
  }

  navigate(path: string): void {
    if (path === location.pathname + location.hash) {
      void this.resolve();
      return;
    }
    history.pushState({}, '', path);
    void this.resolve();
  }

  private onClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    const anchor = (e.target as Element).closest('a[data-link]');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http')) return;
    e.preventDefault();
    this.navigate(href);
  }

  private async resolve(): Promise<void> {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    for (const route of this.routes) {
      const match = route.regex.exec(path);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1] ?? '');
      });
      await route.handler({ path, params, hashParams });
      return;
    }
    await this.notFound({ path, params: {}, hashParams });
  }
}

export const router = new Router();

export function navigate(path: string): void {
  router.navigate(path);
}
