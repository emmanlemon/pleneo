const MOUNT = /^\^\\\/(?<path>.*?)\\\/\?\(\?=\\\/\|\$\)/;

const mountPath = (layer) => {
  const match = MOUNT.exec(layer.regexp?.source ?? '');
  if (!match) return '';
  return `/${match.groups.path.replace(/\\(.)/g, '$1')}`;
};

export function listRoutes(app) {
  const routes = new Set();
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        const path = `${prefix}${layer.route.path}`.replace(/\/$/, '') || '/';
        for (const method of Object.keys(layer.route.methods)) routes.add(`${method.toUpperCase()} ${path}`);
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPath(layer));
      }
    }
  };
  walk(app._router?.stack ?? app.router?.stack ?? [], '');
  return [...routes].sort();
}

export const documentedOperations = (spec) =>
  Object.entries(spec.paths)
    .flatMap(([path, item]) =>
      Object.keys(item)
        .filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
        .map((method) => `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`),
    )
    .sort();
