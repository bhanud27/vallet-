import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
async function sources(root: URL): Promise<URL[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sources(new URL(entry.name + "/", root))
        : /\.tsx?$/.test(entry.name)
          ? Promise.resolve([new URL(entry.name, root)])
          : Promise.resolve([]),
    ),
  );
  return groups.flat();
}
test("application source contains valid UTF-8 and no known double-encoded punctuation", async () => {
  const corrupt =
    /\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2[\u0080-\u00bf\u2018-\u203a\u20ac]|\ufffd/u;
  for (const file of await sources(new URL("../src/", import.meta.url))) {
    const content = await readFile(file, "utf8");
    assert.equal(
      corrupt.test(content),
      false,
      "Corrupted text in " + file.pathname,
    );
  }
  const form = await readFile(
    new URL("../src/ui/ContentComposer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(form, /Is it really worth it/);
  assert.match(form, /What makes this worth sharing/);
});
