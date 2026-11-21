import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";

// Native Fabric rejects even a literal space in a View. Web renderers and
// bundle exports allow it, so check shared native surfaces explicitly.
const containers = new Set([
  "View",
  "Animated.View",
  "Pressable",
  "ContentTap",
  "ScrollView",
  "SafeAreaView",
  "KeyboardAvoidingView",
  "TouchableOpacity",
  "TouchableHighlight",
]);
function rawNativeText(source: string, filename = "fixture.tsx") {
  const ast = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const errors: string[] = [];
  function report(node: ts.Node) {
    const { line, character } = ast.getLineAndCharacterOfPosition(
      node.getStart(ast),
    );
    errors.push(`${filename}:${line + 1}:${character + 1}`);
  }
  function expression(node: ts.Expression) {
    if (ts.isParenthesizedExpression(node)) expression(node.expression);
    else if (
      (ts.isStringLiteralLike(node) && node.text.length > 0) ||
      ts.isNumericLiteral(node)
    )
      report(node);
    else if (ts.isConditionalExpression(node)) {
      expression(node.whenTrue);
      expression(node.whenFalse);
    } else if (ts.isArrayLiteralExpression(node))
      node.elements.forEach((item) => {
        if (!ts.isSpreadElement(item)) expression(item);
      });
  }
  function visit(node: ts.Node, native = false) {
    if (ts.isJsxElement(node)) {
      const isContainer = containers.has(
        node.openingElement.tagName.getText(ast),
      );
      node.children.forEach((child) => visit(child, isContainer));
    } else if (ts.isJsxFragment(node))
      node.children.forEach((child) => visit(child, native));
    else if (ts.isJsxText(node)) {
      const text = node.getText(ast);
      // JSX removes indentation/newlines, but single-line spaces are children.
      if (
        native &&
        (text.trim().length > 0 || (text.length > 0 && !/[\r\n]/.test(text)))
      )
        report(node);
    } else if (ts.isJsxExpression(node)) {
      if (native && node.expression) expression(node.expression);
      if (node.expression)
        ts.forEachChild(node.expression, (child) => visit(child));
    } else ts.forEachChild(node, (child) => visit(child));
  }
  visit(ast);
  return errors;
}

test("native text check catches whitespace, raw labels, numbers and fragment children", () => {
  for (const source of [
    '<ContentTap>{" "}<Text>Play</Text></ContentTap>',
    "<Pressable>Play</Pressable>",
    "<View>{0}</View>",
    '<View><>{" "}<Text>Label</Text></></View>',
    '<View>{failed ? "Failed" : null}</View>',
  ])
    assert.ok(rawNativeText(source).length > 0, source);
});
test("native text check allows Text children, labels passed as props and layout indentation", () => {
  for (const source of [
    '<ContentTap accessibilityLabel="Play video"><Text>{" "}Play</Text></ContentTap>',
    "<View>\n  <Text>Title</Text>\n  <Text>{0}</Text>\n</View>",
    "<Banner>Message rendered by the banner Text component</Banner>",
    "<View>{loading ? <Text>Loading</Text> : null}</View>",
  ])
    assert.deepEqual(rawNativeText(source), [], source);
});
test("app native containers do not render literal text outside Text", async () => {
  async function check(directory: URL): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (entry) => {
        const file = new URL(
          entry.name + (entry.isDirectory() ? "/" : ""),
          directory,
        );
        if (entry.isDirectory()) return check(file);
        if (!entry.name.endsWith(".tsx")) return [];
        return rawNativeText(await readFile(file, "utf8"), file.pathname);
      }),
    );
    return results.flat();
  }
  assert.deepEqual(await check(new URL("../src/", import.meta.url)), []);
});
