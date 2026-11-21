import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createTheme } from "../src/ui/theme";
import { colorPalettes, isColorMode } from "../src/lib/colorTheme";
function luminance(hex: string) {
  const values = hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4),
    );
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
for (const mode of ["light", "dark"] as const)
  test(
    mode + " text, controls and semantic colors retain readable contrast",
    () => {
      const c = colorPalettes[mode];
      const pairs = [
        [c.ink, c.bg],
        [c.ink, c.surface],
        [c.muted, c.bg],
        [c.muted, c.surface],
        [c.accentInk, c.bg],
        [c.accentInk, c.surface],
        [c.accentInk, c.accentSoft],
        [c.placeholder, c.surface],
        [c.placeholder, c.media],
        [c.onAccent, c.accent],
        [c.onStrong, c.strong],
        [c.tagInk, c.tag],
        [c.danger, c.dangerBg],
        [c.infoInk, c.infoBg],
        [c.warnInk, c.warnBg],
        [c.okInk, c.okBg],
        [c.buy, c.buyBg],
        [c.wait, c.waitBg],
        [c.skip, c.skipBg],
        [c.onChoice, c.buy],
        [c.onChoice, c.wait],
        [c.onChoice, c.skip],
      ];
      for (const [foreground, background] of pairs) {
        const a = luminance(foreground),
          b = luminance(background);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert.ok(
          ratio >= 4.5,
          mode +
            " " +
            foreground +
            " on " +
            background +
            " contrast " +
            ratio.toFixed(2),
        );
      }
    },
  );
test("stored appearance accepts only supported choices", () => {
  assert.ok(isColorMode("dark"));
  assert.ok(isColorMode("light"));
  for (const value of [null, undefined, "auto", "Dark", "", {}, true])
    assert.equal(isColorMode(value), false);
});
test("screen and shared UI colors are consumed reactively, not imported as fixed palettes", () => {
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (/\.tsx?$/.test(name) && !name.endsWith("theme.ts")) {
        const source = ts.createSourceFile(
          name,
          fs.readFileSync(name, "utf8"),
          ts.ScriptTarget.Latest,
          true,
        );
        for (const statement of source.statements) {
          if (
            !ts.isImportDeclaration(statement) ||
            !ts.isStringLiteral(statement.moduleSpecifier) ||
            !statement.moduleSpecifier.text.endsWith("/theme")
          )
            continue;
          const bindings = statement.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings))
            for (const spec of bindings.elements)
              assert.ok(
                !["colors", "type", "choiceColor", "choiceBackground"].includes(
                  spec.name.text,
                ),
                name + " has a fixed theme import",
              );
        }
      }
    }
  };
  visit("src/app");
  visit("src/ui");
});

test("glass applies independently of color mode and respects reduced effects", () => {
  for (const mode of ["light", "dark"] as const) {
    const normal = createTheme(mode),
      glass = createTheme(mode, "glass"),
      reduced = createTheme(mode, "glass", true);
    assert.notEqual(glass.surfaceFill, normal.surfaceFill);
    assert.equal(glass.colors.bg, mode === "dark" ? "#000000" : "#FFFFFF");
    for (const color of [
      glass.colors.bg,
      glass.colors.surface,
      glass.colors.media,
      glass.colors.border,
    ]) {
      assert.match(
        color,
        /^#([0-9a-f]{2})\1\1$/i,
        "glass base surfaces must be neutral greys",
      );
    }
    assert.equal(glass.pageBackground, "transparent");
    if (mode === "dark") assert.equal(glass.colors.bg, normal.colors.bg);
    assert.equal(glass.colors.accent, "#CEFF66");
    assert.equal(reduced.glass, false);
    assert.equal(reduced.appearance, "glass");
    assert.equal(reduced.colors.bg, mode === "dark" ? "#000000" : "#FFFFFF");
    assert.equal(reduced.colors.surface, glass.colors.surface);
    assert.equal(reduced.surfaceFill, reduced.colors.surface);
    for (const foreground of [
      glass.colors.ink,
      glass.colors.muted,
      glass.colors.accentInk,
    ]) {
      const a = luminance(foreground),
        b = luminance(glass.colors.surface);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5);
    }
  }
});
