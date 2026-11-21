const path = require("node:path");
exports.verifyAppearance = async ({ page, base, shots, width, expect }) => {
  const radio = (name) => page.getByRole("radio", { name, exact: true });
  const background = (locator) =>
    locator.evaluate((node) => getComputedStyle(node).backgroundColor);
  const blur = (locator) =>
    locator.evaluate((node) =>
      [...node.querySelectorAll("*")].some((child) =>
        getComputedStyle(child).backdropFilter.includes("blur("),
      ),
    );
  for (const mode of ["Light", "Dark"]) {
    await page.goto(base + "/settings/appearance");
    await radio("Normal").click();
    await radio(mode).click();
    const normalPreview = await background(
      page.getByTestId("appearance-preview"),
    );
    const modeControl = await radio(mode).elementHandle();
    await radio("Liquid Glass").click();
    await expect(radio("Liquid Glass")).toBeChecked();
    expect(await modeControl.evaluate((node) => node.isConnected)).toBe(true);
    await expect
      .poll(() => background(page.getByTestId("appearance-preview")))
      .not.toBe(normalPreview);
    await expect
      .poll(() => blur(page.getByTestId("appearance-preview")))
      .toBe(true);
    const fill =
      mode === "Dark" ? "rgba(18, 18, 18, 0.82)" : "rgba(255, 255, 255, 0.88)";
    await page.reload();
    await expect(radio("Liquid Glass")).toBeChecked();
    await expect(radio(mode)).toBeChecked();
    await page.goto(base);
    const card = page.getByTestId("feed-poll-surface").first();
    await expect(card).toBeVisible();
    await expect.poll(() => background(card)).toBe(fill);
    await expect
      .poll(() => background(page.getByTestId("navigation-surface")))
      .toBe(fill);
    // Glass decorates the card; photos remain unfiltered and content remains tappable.
    expect(
      await card
        .locator("img")
        .first()
        .evaluate((node) => getComputedStyle(node).filter),
    ).toBe("none");
    expect(
      await page.evaluate(() => document.documentElement.style.colorScheme),
    ).toBe(mode.toLowerCase());
    await page.screenshot({
      path: path.join(
        shots,
        width + "-glass-" + mode.toLowerCase() + "-feed.png",
      ),
    });
    await page.goto(base + "/profile");
    const profile = page.getByTestId("profile-surface");
    await expect(profile).toBeVisible();
    await expect.poll(() => background(profile)).toBe(fill);
    await expect(
      page.getByRole("button", { name: "Edit profile", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(
        shots,
        width + "-glass-" + mode.toLowerCase() + "-profile.png",
      ),
    });
    await page.goto(base + "/account");
    await expect
      .poll(() =>
        background(page.getByTestId("settings-group-surface").first()),
      )
      .toBe(fill);
    await page.goto(base + "/search");
    await expect(
      page.getByRole("textbox", {
        name: "Find people and products",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
  }
  await page.goto(base + "/settings/appearance");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => blur(page.getByTestId("appearance-preview")))
    .toBe(false);
  await expect(page.getByText(/Reduced effects are enabled/)).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() => blur(page.getByTestId("appearance-preview")))
    .toBe(true);
  await radio("Normal").click();
  await radio("Light").click();
  await expect
    .poll(() => background(page.getByTestId("appearance-preview")))
    .toBe("rgb(255, 255, 255)");
  await expect
    .poll(() => blur(page.getByTestId("appearance-preview")))
    .toBe(false);
  await page.goto(base);
  await expect
    .poll(() => background(page.getByTestId("feed-poll-surface").first()))
    .toBe("rgb(255, 255, 255)");
};
