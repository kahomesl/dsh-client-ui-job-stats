/**
 * Bundle contract: the package manifest, the Loader patch, and the browser half.
 *
 * These are the properties the host relies on to publish and mount the plugin at
 * all — a wrong `dsh.client.platform`, a missing `./client` export, or a bundle
 * that reaches for a Harness Client package breaks the entry in the running page
 * rather than in this repository, so they are asserted here.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadRegistration, materialize } from './support/harness.js';

/** The package directory: the test run's working directory. */
const root = process.cwd();
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');
/** The package manifest the host reads. */
const manifest = JSON.parse(read('package.json'));

describe('package manifest', () => {
  test('declares a web client half whose exports the host can resolve', () => {
    expect(manifest.name).toBe('dsh-client-ui-job-stats');
    expect(manifest.dsh.client.platform).toBe('web');
    expect(manifest.exports['./client']).toBe('./client/client.js');
    expect(existsSync(resolve(root, 'client/client.js'))).toBe(true);
    expect(existsSync(resolve(root, 'lib/index.js'))).toBe(true);
  });

  test('ships a bundle patch that inserts exactly its own row', () => {
    const patchPath = manifest.dsh.bundle.patch;
    expect(patchPath).toBe('./cordis.patch.yml');
    const patch = read(patchPath.replace(/^\.\//u, ''));
    // The row name must be the package name: that is what makes the Loader import
    // this package, and what makes client-modules publish its browser half.
    expect(patch).toContain('insert:');
    expect(patch).toContain(`id: job-stats`);
    expect(patch).toContain(`name: '${manifest.name}'`);
    expect(patch.match(/insert:/gu)).toHaveLength(1);
  });

  test('asks for the client packages it composes with, and no module of its own', () => {
    expect(Array.isArray(manifest.dsh.client.inject)).toBe(true);
    for (const dependency of [
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sidebar-right',
      '@deepseek-ai/dsh-api-job-controller',
    ]) {
      expect(manifest.dsh.client.inject).toContain(dependency);
    }
    // The plugin keeps no left-rail or main-area dependency: it lives in the dock.
    for (const dropped of ['@deepseek-ai/dsh-client-ui-sidebar', '@deepseek-ai/dsh-client-ui-layout']) {
      expect(manifest.dsh.client.inject).not.toContain(dropped);
    }
    // Nothing outside the platform table: a plain-JS bundle cannot follow a
    // Harness Client package across versions.
    expect(manifest.dsh.client.external ?? []).not.toContain('@deepseek-ai/dsh-client-ui-primitives');
  });
});

describe('browser bundle', () => {
  test('registers one lazy factory under the package name', () => {
    const registration = loadRegistration();
    expect(registration.id).toBe(manifest.name);
    expect(typeof registration.factory).toBe('function');
  });

  test('materializes with React alone', () => {
    const { face, requests } = materialize();
    expect(requests.every((specifier) => specifier === 'react')).toBe(true);
    expect(Array.isArray(face.inject)).toBe(true);
    expect(face.inject).toContain('slots');
    expect(face.inject).toContain('jobs');
    // The panel reads the session from the dock tab's own props, so the plugin no
    // longer depends on the frame's session selection.
    expect(face.inject).not.toContain('uiSession');
    expect(typeof face.apply).toBe('function');
  });

  test('the node half is a Loader-visible no-op', async () => {
    const host = await import('../lib/index.js');
    expect(typeof host.apply).toBe('function');
    expect(host.apply()).toBeUndefined();
  });
});
