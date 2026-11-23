const fs = require("node:fs");
const path = require("node:path");

exports.verifyGlossy = async ({
  page,
  base,
  project,
  shots,
  width,
  expect,
}) => {
  const buttons = (name) => page.getByRole("button", { name, exact: true });
  const radio = (name) => page.getByRole("radio", { name, exact: true });
  const field = (name) => page.getByRole("textbox", { name, exact: true });
  const tag = (scope) => scope.locator('[aria-label*=" price "]').first();
  const backdrop = page.getByTestId("app-theme-root");
  const dock = page.getByTestId("navigation-surface");
  const reflected = (surface) =>
    surface.evaluate((node) =>
      [...node.children].some((child) =>
        getComputedStyle(child).backgroundImage.startsWith("linear-gradient("),
      ),
    );
  const blur = (surface) =>
    surface.evaluate((node) =>
      [...node.children].some((child) =>
        getComputedStyle(child).backdropFilter.includes("blur("),
      ),
    );
  const capture = async (label, anchor) => {
    if (width !== 390 && !(width === 414 && label === "01-shopping-feed"))
      return;
    if (anchor) {
      await anchor.scrollIntoViewIfNeeded();
      await anchor.evaluate((node) => node.scrollIntoView({ block: "center" }));
    }
    await page.evaluate(() => document.activeElement?.blur());
    await page.screenshot({
      path: path.join(shots, width + "-" + label + ".png"),
      animations: "disabled",
    });
  };
  const fit = async () =>
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);

  await page.goto(base + "/settings/appearance");
  await radio("Normal").click();
  await radio("Light").click();
  await expect(backdrop).toHaveCSS("background-color", "rgb(246, 245, 249)");
  await radio("Glossy Dark").click();
  await expect(radio("Glossy Dark")).toBeChecked();
  await expect(radio("Light")).toBeDisabled();
  await expect(backdrop).toHaveCSS("background-color", "rgb(16, 16, 17)");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.colorScheme))
    .toBe("dark");
  await capture("08-appearance-settings");

  await page.reload();
  await expect(radio("Glossy Dark")).toBeChecked();
  await expect
    .poll(() => reflected(page.getByTestId("appearance-preview")))
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => reflected(page.getByTestId("appearance-preview")))
    .toBe(false);
  await expect
    .poll(() => blur(page.getByTestId("appearance-preview")))
    .toBe(false);
  await expect(backdrop).toHaveCSS("background-color", "rgb(16, 16, 17)");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.goto(base);
  const discover = page.getByRole("link", { name: "Discover questions" });
  const feedCard = page.getByTestId("feed-poll-surface").first();
  await expect(discover).toHaveCSS("background-color", "rgb(36, 36, 38)");
  await expect(discover.getByText("Discover questions")).toHaveCSS(
    "color",
    "rgb(250, 250, 250)",
  );
  await expect(
    discover.getByText("Browse buying advice by category and price."),
  ).toHaveCSS("color", "rgb(161, 161, 170)");
  await expect.poll(() => reflected(discover)).toBe(true);
  await expect.poll(() => reflected(feedCard)).toBe(true);
  expect(await blur(feedCard)).toBe(false);
  await expect(feedCard.locator("img").first()).toHaveCSS("filter", "none");
  await expect(tag(feedCard)).toHaveCSS(
    "background-color",
    "rgb(206, 255, 102)",
  );
  await expect(dock).toHaveCSS("background-color", "rgba(29, 29, 32, 0.92)");
  await expect.poll(() => reflected(dock)).toBe(true);
  await expect(buttons("Feed")).toHaveAttribute("aria-pressed", "true");
  await expect(buttons("Feed").getByText("Feed")).toHaveCSS(
    "color",
    "rgb(228, 228, 231)",
  );
  await expect(buttons("Profile").getByText("Profile")).toHaveCSS(
    "color",
    "rgb(180, 180, 189)",
  );
  await expect(page.getByTestId("brand-logo").first()).toBeVisible();
  await fit();
  await capture("01-shopping-feed");
  if (width === 390) {
    await dock.screenshot({
      path: path.join(shots, "390-02-floating-navigation.png"),
    });
  }
  await discover.click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(backdrop).toHaveCSS("background-color", "rgb(16, 16, 17)");

  await page.goto(base);
  const star = feedCard.getByRole("button", { name: "Star poll", exact: true });
  if (await star.isEnabled()) {
    await star.click();
    await expect(
      feedCard.getByRole("button", { name: "Unstar poll", exact: true }),
    ).toBeVisible();
  }
  await feedCard.locator('[data-testid^="comments-toggle-poll-"]').click();
  const comments = page.getByTestId("comments-panel");
  await expect(comments).toBeVisible();
  await expect(comments).toHaveCSS("background-color", "rgb(44, 44, 48)");
  await expect.poll(() => reflected(comments)).toBe(true);
  if (width === 390) {
    await field("Add a comment").fill("The material and fit look practical.");
    await buttons("Post comment").click();
    await expect(
      comments.getByText("The material and fit look practical.", {
        exact: true,
      }),
    ).toBeVisible();
  }
  await capture("07-comments-sheet");
  await buttons("Close comments").click();

  const image = (file) =>
    fs.readFileSync(path.join(project, file)).toString("base64");
  const first = image("assets/demo/city-backpack.png");
  const second = image("assets/demo/everyday-hoodie.png");
  await page.route("**/api/product-preview", (route) => {
    const { url, detailsOnly } = route.request().postDataJSON();
    const alternate = url.includes("second");
    return route.fulfill({
      json: {
        name: alternate
          ? "Everyday cotton hoodie"
          : "City backpack with padded laptop sleeve",
        brand: alternate ? "Clothing studio" : "City goods",
        description: "Fixture product details",
        price: alternate ? 1299 : 1599,
        originalPrice: alternate ? 1799 : 2399,
        currency: "INR",
        platform: alternate ? "ajio" : "myntra",
        productUrl: url,
        images: detailsOnly
          ? []
          : [{ mimeType: "image/png", base64: alternate ? second : first }],
      },
    });
  });
  await buttons("Add").click();
  await expect(page).toHaveURL(/\/add$/);
  await field("Paste any product link").fill(
    "https://www.myntra.com/bags/demo/10001/buy",
  );
  await expect(page.getByTestId("product-link-input")).toHaveCSS(
    "border-top-color",
    "rgb(228, 228, 231)",
  );
  const product = page.getByTestId("product-preview-card");
  await expect(
    product.getByText("City backpack with padded laptop sleeve"),
  ).toBeVisible();
  await expect(tag(product)).toHaveCSS(
    "background-color",
    "rgb(206, 255, 102)",
  );
  await expect(
    product
      .getByRole("link", { name: "View product" })
      .getByText(/View product/),
  ).toHaveCSS("color", "rgb(228, 228, 231)");
  await expect(buttons("Preview")).toHaveCSS(
    "background-color",
    "rgb(228, 228, 231)",
  );
  await fit();
  await capture("03-product-import");

  await buttons("Poll").click();
  await expect(buttons("Poll")).toHaveAttribute("aria-pressed", "true");
  await field("Poll question").fill(
    "Is this city backpack worth buying for a daily train commute and occasional weekend trips?",
  );
  await expect(field("Option 1")).toHaveValue("Worth it");
  await capture("04-poll", buttons("Publish poll"));

  await buttons("Compare").click();
  await field("Paste another product link").fill(
    "https://www.ajio.com/p/second",
  );
  const compared = page.getByTestId("comparison-product-card");
  await expect(compared).toHaveCount(2);
  await expect(
    compared.last().getByText("Everyday cotton hoodie"),
  ).toBeVisible();
  await expect(tag(compared.last())).toHaveCSS(
    "background-color",
    "rgb(206, 255, 102)",
  );
  await capture("05-compare", buttons("Publish comparison"));

  await buttons("Post").click();
  await field("Caption").fill(
    "The padded sleeve keeps my laptop separate, and there is room for a rain jacket and lunch.",
  );
  await capture("06-post", buttons("Publish post"));
  await buttons("Edit product").click();
  await expect(field("Product title")).toHaveValue(
    "City backpack with padded laptop sleeve",
  );
  await capture("09-product-edit-sheet");
  await buttons("Cancel").click();
  await buttons("Poll").click();
  await expect(field("Poll question")).toHaveValue(/occasional weekend trips/);
  await buttons("Publish poll").click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByText(/occasional weekend trips/)).toBeVisible();
  await expect(backdrop).toHaveCSS("background-color", "rgb(16, 16, 17)");

  await page.goto(base + "/profile");
  await expect
    .poll(() => reflected(page.getByTestId("profile-surface")))
    .toBe(true);
  await buttons("Spot").click();
  await expect(field("Find people and products")).toHaveCSS(
    "background-color",
    "rgb(27, 27, 30)",
  );
  await buttons("Checks").click();
  await expect
    .poll(() => reflected(page.getByTestId("checks-floating-header")))
    .toBe(true);
  await page.goto(base + "/notifications");
  await expect(backdrop).toHaveCSS("background-color", "rgb(16, 16, 17)");

  await page.goto(base + "/settings/appearance");
  await radio("Liquid Glass").click();
  await expect(radio("Light")).toBeChecked();
  await expect(radio("Light")).toBeEnabled();
  await expect
    .poll(() => blur(page.getByTestId("appearance-preview")))
    .toBe(true);
  await radio("Normal").click();
  await expect(backdrop).toHaveCSS("background-color", "rgb(246, 245, 249)");
  await expect
    .poll(() => reflected(page.getByTestId("appearance-preview")))
    .toBe(false);
  await fit();
  console.log(
    width +
      "px Glossy Dark appearance, routing, product preview, and local publishing passed.",
  );
};
