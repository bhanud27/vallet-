const path = require("node:path");
exports.verifySettingsGrids = async ({ page, base, shots, width, expect }) => {
  const field = (name) => page.getByRole("textbox", { name, exact: true });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(base + "/settings/personal");
  await expect(button("Edit Display name")).toBeEnabled();
  await expect(field("Display name")).not.toBeEditable();
  await button("Edit Display name").click();
  await expect(field("Display name")).toBeEditable();
  await field("Display name").fill("Grid tester");
  await button("Done editing Display name").click();
  await expect(field("Display name")).not.toBeEditable();
  await button("Edit Username").click();
  await field("Username").fill("grid_tester");
  await button("Done editing Username").click();
  await button("Save personal information").click();
  await expect(
    page.getByText("Personal information saved. Your profile is updated.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(base + "/settings/content");
  await expect(field("Preferred brands")).not.toBeEditable();
  await button("Edit Preferred brands").click();
  await expect(field("Preferred brands")).toBeEditable();
  await button("Done editing Preferred brands").click();
  // Synthetic fixtures remain in this isolated browser's local storage only.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("worthit:local:v1"));
    const sample = s.polls.find((p) => p.isDemo && p.demoImage);
    const threads = JSON.parse(
      localStorage.getItem("worthit:comments:v1") || "{}",
    );
    s.stars ||= {};
    for (let i = 0; i < 4; i++) {
      const id = "94000000-0000-4000-8000-" + String(i + 1).padStart(12, "0");
      s.polls.push({
        ...sample,
        id,
        authorId: s.me,
        isDemo: false,
        contentKind: "poll",
        itemName: "Activity outfit " + (i + 1),
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
      });
      s.stars[id] = [s.me];
      threads["poll:" + id] = [
        {
          id: "activity-comment-" + i,
          authorId: s.me,
          username: "Grid tester",
          body: "My comment on this outfit.",
          created_at: new Date(Date.now() - i * 1000).toISOString(),
        },
      ];
    }
    localStorage.setItem("worthit:local:v1", JSON.stringify(s));
    localStorage.setItem("worthit:comments:v1", JSON.stringify(threads));
  });
  for (const section of ["stars", "polls", "comments"]) {
    await page.goto(base + "/settings/" + section);
    const grid = page.getByTestId("activity-grid"),
      tiles = grid.locator(":scope > div");
    await expect.poll(() => tiles.count()).toBeGreaterThanOrEqual(4);
    await expect(grid).toHaveCSS("flex-direction", "row");
    const a = await tiles.nth(0).boundingBox(),
      b = await tiles.nth(1).boundingBox();
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await expect(
      tiles.first().getByRole("button", { name: "Open content", exact: true }),
    ).toBeVisible();
    if (section === "comments")
      await expect(
        tiles
          .first()
          .getByRole("button", { name: "Delete comment", exact: true }),
      ).toBeVisible();
    await page.screenshot({
      path: path.join(shots, width + "-settings-" + section + "-grid.png"),
    });
  }
};
