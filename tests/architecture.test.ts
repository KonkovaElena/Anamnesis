import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

async function readAllSources(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  const tsFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => join(e.parentPath ?? e.path, e.name));
  const contents = await Promise.all(tsFiles.map((f) => readFile(f, "utf8")));
  return contents.join("\n");
}

test("domain layer stays free of infrastructure imports", async () => {
  const domainSource = await readFile(
    join(process.cwd(), "src", "domain", "anamnesis.ts"),
    "utf8",
  );

  assert.equal(domainSource.includes("../infrastructure"), false);
  assert.equal(domainSource.includes("/infrastructure/"), false);
});

test("application layer does not import infrastructure directly", async () => {
  const appSource = await readAllSources(join(process.cwd(), "src", "application"));

  assert.equal(appSource.includes("../infrastructure"), false);
  assert.equal(appSource.includes("/infrastructure/"), false);
});

test("domain layer does not import application layer", async () => {
  const domainSource = await readAllSources(join(process.cwd(), "src", "domain"));

  assert.equal(domainSource.includes("../application"), false);
  assert.equal(domainSource.includes("/application/"), false);
});
