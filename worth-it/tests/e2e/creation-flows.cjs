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
  const button = (name) => page.getByRole("button", { name, exact: true }),
    field = (name) => page.getByRole("textbox", { name, exact: true });
  const photo = path.join(project, "assets/demo/oversized-tee.png");
  async function upload(label) {
    const chooser = page.waitForEvent("filechooser");
    await button(label).click();
    await (await chooser).setFiles(photo);
    await expect(button("Remove photo 1")).toBeVisible();
  }
  async function saved() {
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(localStorage).some((v) => v.includes("creationDraft")),
        ),
      )
      .toBe(true);
  }
  // Old draft is intentionally isolated from this fresh test flow.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (
        key.startsWith("worthit:poll-draft:") ||
        key.startsWith("worthit:post-draft:")
      )
        localStorage.removeItem(key);
  });
  let requests = 0,
    releaseOld,
    releasePhotos;
  const data = fs.readFileSync(photo).toString("base64");
  await page.route("**/api/product-preview", async (route) => {
    requests++;
    const payload = route.request().postDataJSON();
    const url = payload.url;
    if (!payload.detailsOnly && url.includes("progressive"))
      await new Promise((resolve) => {
        releasePhotos = resolve;
      });
    if (!payload.detailsOnly && !url.includes("blocked"))
      await new Promise((resolve) => setTimeout(resolve, 250));
    if (url.includes("blocked"))
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "The store does not allow automatic previews. Add details manually.",
        }),
      });
    if (url.includes("late"))
      await new Promise((resolve) => {
        releaseOld = resolve;
      });
    const second = url.includes("ajio");
    await route
      .fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          schema_version: 2,
          status: "partial",
          code: "PARTIAL_EXTRACTION",
          source: {
            retailer: second ? "ajio" : "myntra",
            original_url: url,
            canonical_url: url,
          },
          product: {
            title: second ? "Linen trousers" : "Cotton shirt",
            brand: second ? "Brand B" : "Brand A",
            price: {
              current: second ? 1499 : 999,
              original: 1999,
              currency: "INR",
              discount_percentage: second ? 25 : 50,
              state: "extracted_unverified",
            },
            images: [
              {
                url: "https://cdn.example/front.jpg",
                status: "validated",
                width: 600,
                height: 800,
              },
            ],
            variants: [
              {
                id: "m",
                attributes: { size: "M" },
                price: 999,
                availability: "in_stock",
              },
            ],
            specifications: { Fabric: "Cotton" },
            retailer_rating: { value: 4.3, best: 5, rating_count: 12 },
            availability: "in_stock",
          },
          extraction: {
            method: "structured_data",
            cache: "miss",
            extracted_at: new Date().toISOString(),
            missing_fields: ["description"],
            provenance: {},
          },
          name: second ? "Linen trousers" : "Cotton shirt",
          brand: second ? "Brand B" : "Brand A",
          category: second ? "Trousers" : "T-shirts",
          description: "Public product metadata",
          currency: "INR",
          price: second ? 1499 : 999,
          platform: second ? "ajio" : "myntra",
          productUrl: url,
          imagesPending: payload.detailsOnly === true,
          images: payload.detailsOnly
            ? []
            : [{ mimeType: "image/png", base64: data }],
        }),
      })
      .catch(() => {});
  });
  await page.goto(base + "/add");
  await expect(button("Poll")).toBeVisible();
  await expect(button("Post")).toBeVisible();
  await expect(button("Compare")).toHaveCount(0);
  await button("Poll").click();
  await expect(field("Product link (optional)")).toBeVisible();
  await expect(button("Compare")).toHaveCount(0);
  await field("Product link (optional)").fill(
    "https://www.myntra.com/shirts/progressive/buy",
  );
  await expect.poll(() => !!releasePhotos).toBe(true);
  await expect(
    page.getByText("Product details ready. Loading photos...", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Store price ₹999", { exact: true }),
  ).toBeVisible();
  await expect(button("Remove photo 1")).toHaveCount(0);
  releasePhotos();
  await expect(button("Remove photo 1")).toBeVisible();
  await button("Clear product link").click();
  await field("Product link (optional)").fill(
    "https://www.myntra.com/shirts/late/buy",
  );
  await expect.poll(() => !!releaseOld).toBe(true);
  await field("Product name").fill("My edited shirt");
  await field("Product link (optional)").fill(
    "https://www.myntra.com/shirts/first/buy",
  );
  releaseOld();
  await expect(button("Remove photo 1")).toBeVisible();
  await expect(field("Product name")).toHaveValue("My edited shirt");
  const clear = button("Clear product link");
  const inputBounds = await field("Product link (optional)").boundingBox();
  const clearBounds = await clear.boundingBox();
  expect(clearBounds.x).toBeGreaterThan(inputBounds.x);
  expect(clearBounds.x + clearBounds.width).toBeLessThanOrEqual(
    inputBounds.x + inputBounds.width,
  );
  await clear.click();
  await expect(field("Product link (optional)")).toHaveValue("");
  await expect(clear).toHaveCount(0);
  await expect(button("Remove photo 1")).toHaveCount(0);
  await field("Product link (optional)").fill(
    "https://www.myntra.com/shirts/replacement/buy",
  );
  await expect(button("Remove photo 1")).toBeVisible();
  await expect(field("Product name")).toHaveValue("My edited shirt");

  await button("View store facts").click();
  await expect(page.getByText("Fabric: Cotton", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Store rating 4.3/5 · 12 ratings", { exact: true }),
  ).toBeVisible();
  await button("Hide store facts").click();
  await button("Edit product details").click();
  await expect(field("Brand")).toHaveValue("Brand A");
  await field("Brand").fill("My brand");
  await button("Continue").click();
  await expect(button("Compare")).toBeVisible();
  await expect(button("Poll — Worth It?")).toBeVisible();
  await button("Compare").click();
  await expect(
    page.getByText("Already selected", { exact: true }),
  ).toBeVisible();
  await field("Product link (optional)").fill(
    "https://www.ajio.com/trousers/second",
  );
  await expect(field("Product name")).toHaveValue("Linen trousers");
  await expect(button("Remove photo 1")).toBeVisible();
  await button("Continue").click();
  await expect(field("Comparison question")).toHaveValue(
    "Which one should I buy?",
  );
  await expect(field("Option 1")).toHaveCount(0);
  await button("Preview").click();
  await expect(button("Publish Comparison")).toBeVisible();
  await expect(
    page.getByText("My edited shirt", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Linen trousers", { exact: true }).first(),
  ).toBeVisible();
  await expect(button("Worth it")).toHaveCount(0);
  await expect(page.getByText("My brand", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Store rating 4.3/5", { exact: true }),
  ).toHaveCount(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width + 1);
  await page.screenshot({
    path: path.join(shots, width + "-comparison-preview.png"),
  });
  await button("Back to editing").click();
  await expect(field("Comparison question")).toHaveValue(
    "Which one should I buy?",
  );
  await button("Preview").click();
  await button("Publish Comparison").evaluate((el) => {
    el.click();
    el.click();
  });
  await expect(page).toHaveURL(/\/p\//);
  const comparison = page.url();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("worthit:local:v1")).polls.filter(
      (p) => p.creationSpec?.subtype === "compare",
    ),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0].creationSpec.products[0].url).toContain("myntra");
  expect(stored[0].creationSpec.products[1].url).toContain("ajio");
  expect(stored[0].creationSpec.products[0].details.brand).toBe("My brand");
  await page.goto(base + "/settings/demo");
  await button("Act as a new guest").click();
  await page.goto(comparison);
  await button("Linen trousers").click();
  await button("Submit vote").click();
  await expect(page.getByText(/100%.*Leading/)).toBeVisible();
  await expect(button("Submit vote")).toHaveCount(0);
  await page.goto(base + "/settings/demo");
  await button("Back to my identity").click();
  await page.goto(base + "/new");
  await upload("Upload product photo");
  await field("Product name").fill("Canvas jacket");
  await button("Continue").click();
  await button("Poll — Worth It?").click();
  await expect(field("Poll question")).toHaveValue("Is this worth buying?");
  await expect(field("Option 1")).toHaveValue("Worth it");
  await button("Add option").click();
  await expect(button("Add option")).toBeDisabled();
  await field("Option 4").fill("Worth IT");
  await button("Preview").click();
  await expect(
    page.getByText(/distinct, nonempty voting options/),
  ).toBeVisible();
  await field("Option 4").fill("Ask me later");
  await button("Remove option 4").click();
  await button("Preview").click();
  await expect(page.getByText("₹0", { exact: true })).toHaveCount(0);
  await button("Publish Poll").click();
  await expect(page).toHaveURL(/\/p\//);
  await page.goto(base + "/add");
  await button("Post").click();
  await expect(field("Caption")).toHaveCount(0);
  await expect(field("Product link (optional)")).toBeVisible();
  await button("Continue").click();
  await expect(
    page.getByText("Add photos or a video first.", { exact: true }),
  ).toBeVisible();
  await field("Product link (optional)").fill(
    "https://www.meesho.com/fixture/p/post",
  );
  await expect(button("Remove photo 1")).toBeVisible();
  await expect(field("Product name")).toHaveValue("Cotton shirt");
  await button("Edit product details").click();
  await field("Brand").fill("My post brand");
  await field("Store price").fill("invalid");
  await button("Continue").click();
  await expect(page.getByText(/valid store price/)).toBeVisible();
  await field("Store price").fill("999");
  await button("Continue").click();
  await field("Caption").fill("A fresh weekend look #style");
  await button("More Options").click();
  await field("Location (optional)").fill("Bengaluru");
  await button("Preview").click();
  await expect(button("Publish Post")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(localStorage).some(
          (v) =>
            v.includes("A fresh weekend look #style") &&
            v.includes('"step":"preview"'),
        ),
      ),
    )
    .toBe(true);
  await page.goto(base + "/settings/appearance");
  await page.getByRole("radio", { name: "Liquid Glass", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Liquid Glass", exact: true }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await page.goto(base + "/new-post");
  await expect(button("Publish Post")).toBeVisible();
  await expect(
    page.getByText("A fresh weekend look #style", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Bengaluru", { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-testid="creation-surface-glass"]').first(),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(shots, width + "-glass-post-preview.png"),
  });
  await button("Publish from header").click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(button("Star post")).toBeVisible();
  const attachedPost = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("worthit:local:v1")).polls.find(
      (p) =>
        p.contentKind === "post" &&
        p.question === "A fresh weekend look #style",
    ),
  );
  expect(attachedPost.productUrl).toContain("meesho");
  expect(attachedPost.productDetails.brand).toBe("My post brand");
  await expect(button("Save for later")).toBeVisible();
  await expect(
    page.getByText("Votes from the community", { exact: true }),
  ).toHaveCount(0);
  await page.goto(base + "/settings/appearance");
  await page.getByRole("radio", { name: "Normal", exact: true }).click();
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  // Retailer restrictions retain manual entry and do not manufacture extracted products.
  await page.goto(base + "/new");
  await field("Product link (optional)").fill("https://www.ajio.com/blocked");
  await expect(
    page.getByText(/store does not allow automatic previews/),
  ).toBeVisible();
  await field("Product name").fill("Manual fashion find");
  await button("Continue").click();
  await expect(button("Compare")).toBeVisible();
  expect(requests).toBeGreaterThanOrEqual(3);
};
