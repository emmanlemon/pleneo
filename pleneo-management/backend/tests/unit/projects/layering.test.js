import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULE = path.resolve(import.meta.dirname, '../../../src/modules/projects');

async function filesIn(layer) {
  const dir = path.join(MODULE, layer);
  const entries = await readdir(dir);
  return Promise.all(
    entries.map(async (name) => ({ name: `${layer}/${name}`, source: await readFile(path.join(dir, name), 'utf8') })),
  );
}

const importsOf = (source) => [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);

describe('projects layering', () => {
  it('keeps the domain free of frameworks, drivers and sibling layers', async () => {
    for (const file of await filesIn('domain')) {
      for (const specifier of importsOf(file.source)) {
        expect(specifier, `${file.name} imports ${specifier}`).not.toMatch(/#infra\/|^pg$|^express$|^zod$/);
        expect(specifier, `${file.name} imports ${specifier}`).not.toMatch(/\.\.\/(application|infrastructure|http)\//);
      }
    }
  });

  it('keeps the application layer off the database and the transport', async () => {
    for (const file of await filesIn('application')) {
      for (const specifier of importsOf(file.source)) {
        expect(specifier, `${file.name} imports ${specifier}`).not.toMatch(/#infra\/|^pg$|^express$/);
        expect(specifier, `${file.name} imports ${specifier}`).not.toMatch(/\.\.\/(infrastructure|http)\//);
      }
    }
  });

  it('leaves the composition root as the only place adapters meet use cases', async () => {
    const root = await readFile(path.join(MODULE, 'index.js'), 'utf8');
    expect(root).toContain('infrastructure/project.repository.js');
    expect(root).toContain('infrastructure/project.events.js');
    expect(root).toContain('application/project.use-cases.js');

    for (const file of await filesIn('http')) {
      for (const specifier of importsOf(file.source)) {
        expect(specifier, `${file.name} imports ${specifier}`).not.toMatch(/\.\.\/infrastructure\//);
      }
    }
  });

  it('exposes the module through its entry point rather than its internals', async () => {
    const outside = path.resolve(import.meta.dirname, '../../../src/api');
    for (const name of await readdir(outside)) {
      const source = await readFile(path.join(outside, name), 'utf8');
      for (const specifier of importsOf(source).filter((s) => s.includes('modules/projects'))) {
        expect(specifier, `${name} reaches past the entry point`).toBe('#modules/projects/index.js');
      }
    }
  });
});
