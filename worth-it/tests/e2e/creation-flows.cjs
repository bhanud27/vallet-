const fs = require("node:fs");
const path = require("node:path");

exports.verifyCreation = async ({
  page,
  base,
  project,
  shots,
  width,
  expect,
}) => {
  const button = (name) => page.getByRole("button", { name, exact: true });
  const field = (name) => page.getByRole("textbox", { name, exact: true });
  const card = () => page.getByTestId("product-preview-card");
  const link = field("Paste any product link");
  const other = field("Paste another product link");
  const photo = path.join(project, "tests/e2e/test-sneaker.jpg");
  const alternate = path.join(project, "assets/demo/everyday-hoodie.png");
  const pictures = {
    primary: {
      mimeType: "image/jpeg",
      base64: fs.readFileSync(photo, "base64"),
    },
    second: {
      mimeType: "image/png",
      base64: fs.readFileSync(alternate, "base64"),
    },
  };
  const origin = "https://www.myntra.com/shoes/fixture/";
  const target = origin + "complete/buy?variant=blue";
  const waits = new Map();
  const calls = new Map();
  const screens = process.env.CREATION_SCREENSHOT_DIR || shots;
  fs.mkdirSync(screens, { recursive: true });
  const release = async (key) => {
    await expect.poll(() => waits.has(key)).toBe(true);
    waits.get(key)();
  };
  const screenshot = async (name, anchor) => {
    if (width !== 390 && !(width === 414 && name === "03-preview-dark-normal"))
      return;
    if (anchor) {
      await anchor.scrollIntoViewIfNeeded();
      await anchor.evaluate((el) => el.scrollIntoView({ block: "center" }));
    }
    await page.screenshot({
      path: path.join(
        screens,
        (width === 414 ? "11-preview-414px-dark-normal" : name) + ".png",
      ),
      animations: "disabled",
    });
  };
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith("worthit:poll-draft:") ||
        key.startsWith("worthit:post-draft:")
      )
        localStorage.removeItem(key);
    }
    localStorage.setItem("worthit:appearance:v1", "normal");
    localStorage.setItem("worthit:color-mode:v1", "dark");
  });
  await page.route("**/api/product-preview", async (route) => {
    const { url, mode, detailsOnly } = route.request().postDataJSON();
    const key = mode + "|" + url;
    calls.set(key, (calls.get(key) || 0) + 1);
    const second = url.includes("ajio");
    if (
      (url === target && !detailsOnly) ||
      (url.includes("late") && !detailsOnly) ||
      (url === target && detailsOnly)
    ) {
      // Release once. Theme changes or a cached retry should never wait twice.
      if (!waits.has(key))
        await new Promise((resolve) => waits.set(key, resolve));
    }
    const fail =
      url.includes("blocked") || (url.includes("image-only") && detailsOnly);
    if (fail) {
      await route
        .fulfill({
          status: 403,
          json: {
            error: "backend diagnostic",
            code: url.includes("blocked-shared") ? "ACCESS_RESTRICTED" : undefined,
          },
        })
        .catch(() => {});
      return;
    }
    const titleOnly = url.includes("title-only");
    const unpriced =
      url.includes("unpriced") || titleOnly || url.includes("late");
    const name = url.includes("image-only")
      ? ""
      : titleOnly
        ? "Linen jacket"
        : second
          ? "Relaxed cotton hoodie"
          : "Everyday court sneakers";
    const original =
      detailsOnly && !url.includes("no-original") && !unpriced
        ? second
          ? 2499
          : 1799
        : null;
    const price = detailsOnly && !unpriced ? (second ? 1499 : 899) : null;
    await route
      .fulfill({
        json: {
          name,
          brand: second ? "Brand B" : "Brand A",
          description: "Public product description",
          price,
          originalPrice: original,
          currency: price ? "INR" : null,
          platform: second ? "ajio" : "myntra",
          productUrl: second ? url.replace("share?", "item?") : url,
          images:
            detailsOnly || titleOnly
              ? []
              : [second ? pictures.second : pictures.primary],
        },
      })
      .catch(() => {});
  });

  await page.goto(base + "/add");
  await expect(
    page.getByRole("heading", { name: "Is it really worth it?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Find it. Share it. Decide together."),
  ).toBeVisible();
  await expect(button("Poll")).toHaveCount(0);
  await expect(card()).toHaveCount(0);
  for (const label of ["Home", "Explore", "Create", "Activity", "Profile"])
    await expect(button(label)).toBeVisible();
  const { x, width: logoWidth } = await page
    .getByTestId("brand-logo")
    .boundingBox();
  expect(Math.abs(x + logoWidth / 2 - width / 2)).toBeLessThan(2);
  await screenshot("01-empty-dark-normal");

  await link.fill("javascript:invalid");
  await link.press("Enter");
  await expect(
    page.getByText("Enter a valid public product link."),
  ).toBeVisible();
  expect(calls.size).toBe(0);

  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await page.evaluate((value) => navigator.clipboard.writeText(value), target);
  await button("Paste link from clipboard").click();
  await expect(link).toHaveValue(target);
  await expect(page.getByTestId("product-preview-skeleton")).toBeVisible();
  await screenshot("02-loading-dark-normal");
  await button("Preview")
    .click({ force: true, timeout: 1000 })
    .catch(() => {});
  await release("rich|" + target);
  await expect(card().getByText("Everyday court sneakers")).toBeVisible();
  await expect(card().getByRole("img")).toBeVisible();
  await expect(button("Poll")).toBeVisible();
  await expect(card().getByText(/off$/)).toHaveCount(0);

  await button("Edit product").click();
  await field("Brand").fill("My verified brand");
  await button("Save").click();
  await release("enrichment|" + target);
  await expect(card().getByText("50% off")).toBeVisible();
  await expect(
    card().getByRole("link", { name: "View product" }),
  ).toBeVisible();
  expect(calls.get("rich|" + target)).toBe(1);
  await screenshot("03-preview-dark-normal");
  const actions = await Promise.all(
    ["Poll", "Compare", "Post"].map((label) => button(label).boundingBox()),
  );
  expect(
    Math.max(...actions.map((a) => a.width)) -
      Math.min(...actions.map((a) => a.width)),
  ).toBeLessThan(1);
  expect(new Set(actions.map((a) => a.height)).size).toBe(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width + 1);

  // A draft can be retained when backing out of an attempted navigation.
  await button("Close creation").click();
  await expect(page.getByText("Discard this draft?")).toBeVisible();
  await button("Keep editing").click();
  await expect(card()).toBeVisible();
  // Verify the original product link survives source normalization.
  await page
    .context()
    .route(target, (route) => route.fulfill({ body: "Original source" }));
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    card().getByRole("link", { name: "View product" }).click(),
  ]);
  expect(popup.url()).toBe(target);
  await popup.close();

  await button("Poll").click();
  await expect(field("Poll question")).toHaveValue("Is this worth buying?");
  await field("Poll question").fill("Should I get these sneakers?");
  await button("Add option").click();
  await field("Option 4").fill("Worth IT");
  await button("Publish poll").click();
  await expect(
    page.getByText(/distinct, nonempty voting options/),
  ).toBeVisible();
  await button("Remove option 4").click();
  await screenshot("04-poll-dark-normal", button("Publish poll"));

  await button("Compare").click();
  await expect(field("Comparison question")).toHaveValue(
    "Which one is more worth buying?",
  );
  const secondUrl = "https://www.ajio.com/share?sku=white";
  await other.fill(secondUrl);
  await expect(page.getByTestId("comparison-product-card")).toHaveCount(2);
  await expect(
    page.getByText("Relaxed cotton hoodie", { exact: true }),
  ).toBeVisible();
  await expect(card().getByText("Everyday court sneakers")).toBeVisible();
  await field("Comparison question").fill("Which is better for travel?");
  await screenshot(
    "05-compare-dark-normal",
    page.getByTestId("comparison-product-card").first(),
  );
  await button("Post").click();
  await field("Caption").fill("A comfortable everyday staple");
  const chooser = page.waitForEvent("filechooser");
  await button("Add photos or video").click();
  await (await chooser).setFiles(alternate);
  await expect(button("Remove attachment 2")).toBeVisible();
  await screenshot("06-post-dark-normal", field("Caption"));

  await button("Poll").click();
  await expect(field("Poll question")).toHaveValue(
    "Should I get these sneakers?",
  );
  await button("Compare").click();
  await expect(other).toHaveValue(secondUrl);
  const originalSecond = page.getByRole("link", {
    name: "View product Relaxed cotton hoodie",
  });
  expect(await originalSecond.count()).toBe(1);
  await expect(field("Comparison question")).toHaveValue(
    "Which is better for travel?",
  );
  expect(calls.get("rich|" + secondUrl)).toBe(1);
  await button("Publish comparison").evaluate((el) => {
    el.click();
    el.click();
  });
  await expect(page).toHaveURL(/\/p\//);
  const published = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("worthit:local:v1")).polls.filter(
      (p) => p.question === "Which is better for travel?",
    ),
  );
  expect(published).toHaveLength(1);
  expect(published[0].media).toHaveLength(2);
  expect(published[0].creationSpec.products.map((p) => p.url)).toEqual([
    target,
    secondUrl,
  ]);
  expect(published[0].creationSpec.products[0].details.brand).toBe(
    "My verified brand",
  );

  await page.goto(base + "/add");
  const late = origin + "late/buy";
  await link.fill(late);
  await expect.poll(() => waits.has("rich|" + late)).toBe(true);
  await link.fill(origin + "image-only/buy");
  await release("rich|" + late);
  await expect(
    card().getByRole("button", { name: "Add product title" }),
  ).toBeVisible();
  await expect(card().getByText("Everyday court sneakers")).toHaveCount(0);
  await button("Add product title").click();
  await field("Product title").fill("My new sneakers");
  await button("Save").click();
  await expect(card().getByText("My new sneakers")).toBeVisible();
  await expect(page.getByText("backend diagnostic")).toHaveCount(0);
  await button("Close creation").click();
  await button("Discard").click();
  await expect(page).toHaveURL(base + "/");
  await button("Add").click();
  await expect(link).toBeVisible();

  await link.fill("https://shop.example/blocked");
  await expect(
    page.getByText("We couldn’t load a preview for this link."),
  ).toBeVisible();
  await button("Try again").click();
  await expect
    .poll(() => calls.get("rich|https://shop.example/blocked"))
    .toBe(2);
  await button("Add manually").click();
  await field("Product title").fill("Handmade canvas tote");
  await button("Save").click();
  await expect(card().getByText("Handmade canvas tote")).toBeVisible();
  await expect(link).toHaveValue("https://shop.example/blocked");
  await button("Close creation").click();
  await button("Discard").click();
  await expect(page).toHaveURL(base + "/");

  await button("Add").click();
  await expect(page).toHaveURL(/\/add$/);
  await button("Back").click();
  await expect(page).toHaveURL(base + "/");
  await button("Add").click();
  const photoPicker = page.waitForEvent("filechooser");
  await button("Upload photo").click();
  await (await photoPicker).setFiles(photo);
  await expect(card().getByRole("img")).toBeVisible();
  await button("Edit product").click();
  await field("Product title").fill("Canvas sneakers");
  await field("Current price").fill("oops");
  await button("Save").click();
  await expect(page.getByText(/valid store price/)).toBeVisible();
  await field("Current price").fill("");
  await button("Save").click();
  await button("Poll").click();
  await button("Publish poll").click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(
    page.getByText("Canvas sneakers", { exact: true }).first(),
  ).toBeVisible();

  await page.goto(base + "/new-post");
  await link.fill(origin + "title-only/buy");
  await expect(card().getByText("Linen jacket")).toBeVisible();
  await expect(button("Add photo")).toBeVisible();
  await expect(card().getByText(/off$/)).toHaveCount(0);
  await screenshot("07-partial-dark-normal");
  await field("Caption").fill("Light enough for the afternoon.");
  if (width === 390) {
    await page.evaluate(() => {
      const save = Storage.prototype.setItem;
      window.restorePublishing = () => {
        Storage.prototype.setItem = save;
      };
      Storage.prototype.setItem = function (key, value) {
        if (
          key === "worthit:local:v1" &&
          value.includes("Light enough for the afternoon.")
        )
          throw new Error("Test storage failure");
        return save.call(this, key, value);
      };
    });
    await button("Publish post").click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Could not save" }),
    ).toBeVisible();
    await expect(field("Caption")).toHaveValue(
      "Light enough for the afternoon.",
    );
    await page.evaluate(() => window.restorePublishing());
  }
  await button("Publish post").click();
  await expect(page).toHaveURL(/\/p\//);
  const post = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("worthit:local:v1")).polls.find(
      (p) => p.question === "Light enough for the afternoon.",
    ),
  );
  expect(post.contentKind).toBe("post");
  expect(post.productUrl).toContain("title-only");
  expect(post.media).toBeUndefined();
  await expect(page.getByText("Linen jacket", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View product", exact: true }),
  ).toBeVisible();

  await page.goto(
    base + "/add?productUrl=" + encodeURIComponent(origin + "no-original/buy"),
  );
  await expect(card().getByText("Everyday court sneakers")).toBeVisible();
  await expect(card().getByText(/899/)).toBeVisible();
  await expect(card().getByText(/off$/)).toHaveCount(0);
  await link.fill(target);
  await expect(card().getByText("50% off")).toBeVisible();
  await button("Post").click();
  await field("Caption").fill("Kept through theme changes");
  await button("Profile").click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(localStorage).some((record) =>
          record.includes("Kept through theme changes"),
        ),
      ),
    )
    .toBe(true);
  for (const [appearance, mode, name] of [
    ["Normal", "Light", "08-preview-light-normal"],
    ["Liquid Glass", "Light", "09-preview-light-glass"],
    ["Liquid Glass", "Dark", "10-preview-dark-glass"],
  ]) {
    await page.goto(base + "/settings/appearance");
    await page.getByRole("radio", { name: appearance, exact: true }).click();
    await page.getByRole("radio", { name: mode, exact: true }).click();
    await page.goto(base + "/add");
    await expect(card().getByText("Everyday court sneakers")).toBeVisible();
    await expect(field("Caption")).toHaveValue("Kept through theme changes");
    expect(
      await page.evaluate(() => document.documentElement.style.colorScheme),
    ).toBe(mode.toLowerCase());
    await screenshot(name);
  }
  await button("Close creation").click();
  await button("Discard").click();
  await expect(page).toHaveURL(base + "/");

  // Expo Router's share handoff can be tested in the browser independently of Android delivery.
  const ordinaryUrl = origin + "ordinary-draft/buy";
  await page.goto(base + "/add?productUrl=" + encodeURIComponent(ordinaryUrl));
  await expect(link).toHaveValue(ordinaryUrl);
  await expect(card()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (url) =>
          Object.keys(localStorage).some(
            (key) =>
              key.startsWith("worthit:poll-draft:") &&
              localStorage.getItem(key)?.includes(url),
          ),
        ordinaryUrl,
      ),
    )
    .toBe(true);

  const blockedShare = "https://shop.example/blocked-shared";
  await page.goto(
    base + "/add?sharedProductUrl=" + encodeURIComponent(blockedShare),
  );
  await expect(link).toHaveValue(blockedShare);
  await expect(
    page.getByText("The store blocked automatic access for this link."),
  ).toBeVisible();
  await expect(button("Add manually")).toBeVisible();
  await expect(button("Upload photo")).toBeVisible();

  const sharedUrl = "https://www.ajio.com/p/shared?variant=navy";
  const sharedPath =
    base + "/add?sharedProductUrl=" + encodeURIComponent(sharedUrl);
  await page.goto(sharedPath);
  await expect(link).toHaveValue(sharedUrl);
  await expect(card().getByText("Relaxed cotton hoodie")).toBeVisible();
  for (const action of ["Poll", "Compare", "Post"])
    await expect(button(action)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (url) =>
          Object.keys(localStorage).some(
            (key) =>
              key.startsWith("worthit:shared-product-draft:") &&
              JSON.parse(localStorage.getItem(key)).creationDraft?.products[0]
                ?.resolvedUrl === url,
          ),
        sharedUrl,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(card().getByText("Relaxed cotton hoodie")).toBeVisible();
  expect(calls.get("rich|" + sharedUrl)).toBe(1);

  await page.goto(base + "/add");
  await expect(link).toHaveValue(ordinaryUrl);

  console.log(
    width +
      "px creation: preview, races, partial data, manual media, themes and all publish actions passed.",
  );
};
