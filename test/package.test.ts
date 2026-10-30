import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packages = await Promise.all(
  (await readdir(join(root, "packages")))
    .filter((name) => name.startsWith("pi-"))
    .map(async (name) => ({
      name,
      manifest: JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8")),
    })),
);

test("the Git package declares every standalone extension once and no helpers or tests", () => {
  const expected = packages.flatMap(({ name, manifest }) =>
    manifest.pi.extensions.map(
      (entry: string) => `./packages/${name}/${entry.replace(/^\.\//, "")}`,
    ),
  );
  expect(manifest.keywords).toContain("pi-package");
  expect(manifest.pi.extensions.toSorted()).toEqual(expected.toSorted());
  expect(new Set(manifest.pi.extensions).size).toBe(expected.length);
});

test("runtime dependencies belong to the bundle and Pi supplies all host peers", () => {
  const host = new Set([
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-tui",
    "typebox",
  ]);
  const runtime: Record<string, string> = {};
  for (const { manifest: leaf } of packages) {
    expect(leaf.keywords).toContain("pi-package");
    for (const [name, version] of Object.entries(leaf.peerDependencies)) {
      expect(host.has(name)).toBe(true);
      expect(version).toBe("*");
      expect(manifest.peerDependencies[name]).toBe("*");
    }
    for (const [name, version] of Object.entries(leaf.dependencies ?? {})) {
      expect(host.has(name)).toBe(false);
      runtime[name] = version as string;
    }
  }
  expect(manifest.dependencies).toEqual(runtime);
  expect(
    Object.keys(manifest.devDependencies).some((name) =>
      manifest.devDependencies[name].startsWith("workspace:"),
    ),
  ).toBe(false);
});

test("native Pi discovery finds the bundle and narrows resources without loading code", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-package-test-"));
  try {
    const discover = (source: string | { source: string; extensions: string[] }) =>
      new DefaultPackageManager({
        cwd: directory,
        agentDir: directory,
        settingsManager: SettingsManager.inMemory({ packages: [source] }),
      }).resolve(async () => "error");
    const all = await discover(root);
    expect(
      all.extensions
        .filter((entry) => entry.enabled)
        .map((entry) => entry.path)
        .toSorted(),
    ).toEqual(manifest.pi.extensions.map((entry: string) => resolve(root, entry)).toSorted());
    const selected = "packages/pi-drop-session/index.ts";
    const filtered = await discover({ source: root, extensions: [selected] });
    expect(filtered.extensions.filter((entry) => entry.enabled).map((entry) => entry.path)).toEqual(
      [join(root, selected)],
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});
