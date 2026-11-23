const path = require("node:path");
exports.verifyFloatingNavigation = async ({
  page,
  base,
  shots,
  width,
  expect,
}) => {
  // Navigation testing has its own blank creator draft, never a connected account.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("worthit:poll-draft:")) localStorage.removeItem(key);
    // Isolated local fixtures make the Profile genuinely scrollable at every test width.
    const local = JSON.parse(localStorage.getItem("worthit:local:v1"));
    const sample = local.polls.find((p) => p.isDemo && p.demoImage);
    local.polls = local.polls.filter((p) => p.authorId !== local.me);
    for (let i = 0; i < 21; i++)
      local.polls.push({
        ...sample,
        id: "93000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
        authorId: local.me,
        itemName: "Overlay outfit " + (i + 1),
        isDemo: false,
        contentKind: "poll",
        creationSpec: undefined,
        media: [],
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
      });
    localStorage.setItem("worthit:local:v1", JSON.stringify(local));
  });
  const names = ["Feed", "Spot", "Add", "Checks", "Profile"];
  const surface = () =>
    page.locator('[data-testid="navigation-surface"]:visible');
  async function geometry(active) {
    const nav = surface();
    await expect(nav).toHaveCount(1);
    await expect(nav).toBeVisible();
    const dock = page.locator('[data-testid="floating-nav-dock"]:visible');
    await expect(dock).toHaveCSS("position", "absolute");
    await expect(dock).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const box = await nav.boundingBox(),
      viewport = page.viewportSize();
    expect(box.height).toBeCloseTo(70, 0);
    expect(box.x).toBeGreaterThanOrEqual(11);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 11);
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(viewport.height - box.y - box.height).toBeGreaterThanOrEqual(7);
    expect(viewport.height - box.y - box.height).toBeLessThan(10);
    expect(
      Number.parseFloat(
        await nav.evaluate((n) => getComputedStyle(n).borderRadius),
      ),
    ).toBeGreaterThanOrEqual(35);
    const mode = await page.evaluate(
      () => document.documentElement.style.colorScheme,
    );
    const boxes = [];
    for (const name of names) {
      const button = nav.getByRole("button", { name, exact: true });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute(
        "aria-pressed",
        String(name === active),
      );
      const b = await button.boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      boxes.push(b);
      expect(
        await button
          .getByText(name, { exact: true })
          .evaluate((n) => getComputedStyle(n).color),
      ).toBe(
        name === active
          ? mode === "dark"
            ? "rgb(206, 255, 102)"
            : "rgb(57, 85, 0)"
          : mode === "dark"
            ? "rgb(179, 179, 179)"
            : "rgb(97, 94, 112)",
      );
    }
    for (let i = 1; i < boxes.length; i++)
      expect(Math.abs(boxes[i].width - boxes[0].width)).toBeLessThan(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
  }
  const isBlurred = (locator) =>
    locator.evaluate((n) =>
      [...n.querySelectorAll("*")].some((c) =>
        getComputedStyle(c).backdropFilter.includes("blur("),
      ),
    );
  for (const [appearance, mode] of [
    ["Normal", "Light"],
    ["Normal", "Dark"],
    ["Liquid Glass", "Light"],
    ["Liquid Glass", "Dark"],
  ]) {
    await page.goto(base + "/settings/appearance");
    await page.getByRole("radio", { name: appearance, exact: true }).click();
    await page.getByRole("radio", { name: mode, exact: true }).click();
    await page.goto(base);
    await geometry("Feed");
    const header = page.getByTestId("feed-header-surface");
    await expect(header).toBeVisible();
    const hb = await header.boundingBox(),
      nb = await surface().boundingBox();
    expect(Math.abs(hb.x - nb.x)).toBeLessThan(2);
    expect(Math.abs(hb.width - nb.width)).toBeLessThan(2);
    expect(
      (
        await page
          .getByRole("heading", { name: "Shopping feed", exact: true })
          .boundingBox()
      ).y,
    ).toBeGreaterThanOrEqual(hb.y + hb.height);
    await expect(
      page.getByRole("button", { name: "Notifications", exact: true }),
    ).toHaveCount(1);
    await expect
      .poll(() => isBlurred(surface()))
      .toBe(appearance === "Liquid Glass");
    await expect
      .poll(() =>
        page
          .getByTestId("feed-poll-surface")
          .first()
          .locator("img")
          .evaluateAll((images) =>
            images.some((image) => image.complete && image.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await page.screenshot({
      path: path.join(
        shots,
        width +
          "-floating-" +
          (appearance === "Normal" ? "normal" : "glass") +
          "-" +
          mode.toLowerCase() +
          ".png",
      ),
    });
    await page.getByRole("button", { name: "Spot", exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);
    await geometry("Spot");
    await expect(
      page.locator('[data-testid="spot-floating-header"]:visible'),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Notifications", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "Find people and products", exact: true })
      .fill("shirt");
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await geometry("Profile");
    await expect(
      page.locator('[data-testid="stack-floating-header"]:visible'),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Settings", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Notifications", exact: true }),
    ).toHaveCount(0);
    const collection = page.getByTestId("profile-collection"),
      cb = await collection.boundingBox(),
      bar = await surface().boundingBox();
    expect(cb.y + cb.height).toBeGreaterThanOrEqual(bar.y + bar.height);
    const ph = await page
      .locator('[data-testid="stack-floating-header"]:visible')
      .boundingBox();
    await expect(page.getByTestId("profile-surface")).toBeVisible();
    expect(
      (await page.getByTestId("profile-surface").boundingBox()).y,
    ).toBeGreaterThanOrEqual(ph.y + ph.height);
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Username", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await collection.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect
      .poll(
        async () =>
          (await page.getByTestId("profile-media-controls").boundingBox()).y,
      )
      .toBeGreaterThanOrEqual(ph.y + ph.height);
    await expect
      .poll(
        async () =>
          (await page.getByTestId("profile-media-controls").boundingBox()).y,
      )
      .toBeLessThan(ph.y + ph.height + 14);
    const lastTile = page.getByTestId(
      "profile-tile-poll:93000000-0000-4000-8000-000000000021",
    );
    await expect(lastTile).toBeInViewport();
    expect(
      (await lastTile.boundingBox()).y + (await lastTile.boundingBox()).height,
    ).toBeLessThanOrEqual(bar.y);
    await page.screenshot({
      path: path.join(
        shots,
        width +
          "-overlay-profile-" +
          (appearance === "Normal" ? "normal" : "glass") +
          "-" +
          mode.toLowerCase() +
          ".png",
      ),
    });
    // Side gaps must hit the page behind the bar, not a rectangular footer panel.
    expect(
      await page.evaluate(
        (y) =>
          !!document
            .elementFromPoint(3, y)
            ?.closest('[data-testid="floating-nav-dock"]'),
        bar.y + bar.height / 2,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: "Checks", exact: true }).click();
    await expect(page).toHaveURL(/\/reels$/);
    await geometry("Checks");
    await expect(
      page.locator('[data-testid="checks-floating-header"]:visible'),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Notifications", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const p = await page.getByTestId("reels-list").boundingBox();
        return p?.height ?? 0;
      })
      .toBeGreaterThan(200);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page).toHaveURL(/\/add$/);
    await expect(surface()).toBeVisible();
    await expect(page.getByTestId("floating-header")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Poll", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(
      page.getByText("Enter a valid public product link.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Back", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Notifications", exact: true }),
    ).toHaveCount(0);
  }
  await page.goto(base + "/settings/appearance");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base);
  await geometry("Feed");
  await expect.poll(() => isBlurred(surface())).toBe(false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base + "/settings/appearance");
  await page.getByRole("radio", { name: "Normal", exact: true }).click();
  await page.getByRole("radio", { name: "Light", exact: true }).click();
};
