const path = require("node:path");
const codes = require("../../shared/product-import-codes.json");

exports.verifyProductImportFailure = async ({
  page,
  base,
  fixtureImporter,
  expect,
}) => {
  const button = (name) => page.getByRole("button", { name, exact: true });
  const field = (name) => page.getByRole("textbox", { name, exact: true });
  const link = field("Paste any product link");
  const form = page.getByTestId("product-import-manual-form");
  const calls = [];
  await page.route(`${fixtureImporter}/api/product-preview`, async (route) => {
    const headers = {
      "access-control-allow-origin": base,
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const { url } = route.request().postDataJSON();
    calls.push(url);
    const code = new URL(url).pathname.slice(1);
    const partial = code === "PARTIAL_EXTRACTION";
    await route.fulfill({
      status: 422,
      headers,
      json: {
        code,
        error: "Internal fixture diagnostic",
        ...(partial ? { price: 1299, currency: "INR", images: [] } : {}),
      },
    });
  });

  for (const code of Object.keys(codes)) {
    const url = `https://shop.example/${code}`;
    const query = new URLSearchParams({
      sharedProductUrl: url,
      sharedProductTitle: "Shared lamp",
    });
    await page.goto(`${base}/add?${query}`);
    await expect(form).toBeVisible();
    await expect(link).toHaveValue(url);
    await expect(field("Product title")).toHaveValue("Shared lamp");
    await expect(field("Product title")).toBeFocused();
    await expect(field("Current price")).toHaveValue(
      code === "PARTIAL_EXTRACTION" ? "1299" : "",
    );
    await expect(field("Currency")).toHaveValue("INR");
    await expect(
      form.getByText(
        "Couldn't auto-fill this link. Add title, price and photo.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      form.getByText(
        "For automatic details, open Worth It in the Android app.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      form.getByText(/Internal fixture diagnostic|[A-Z]+_[A-Z_]+/),
    ).toHaveCount(0);
    await expect(button("Add photo")).toBeVisible();
    await expect(button("Add manually")).toHaveCount(0);
    await expect(button("Upload photo")).toHaveCount(0);
    await expect(button("Preview")).toBeDisabled();
    if (code === "FETCH_TIMEOUT" || code === "NETWORK_ERROR") {
      await expect(button("Try again")).toBeVisible();
      const callCount = calls.length;
      await button("Try again").click();
      await expect.poll(() => calls.length).toBe(callCount + 1);
      await expect(form).toBeVisible();
    } else {
      await expect(button("Try again")).toHaveCount(0);
    }
  }

  await button("Add photo").click();
  for (const label of ["Gallery", "Camera", "Paste image from clipboard"])
    await expect(button(label)).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await button("Gallery").click();
  await (await chooser).setFiles(path.join(__dirname, "test-sneaker.jpg"));
  await expect(button("Remove photo")).toBeVisible();
  await button("Remove photo").click();
  await expect(button("Remove photo")).toHaveCount(0);

  await field("Product title").fill("My lamp");
  await field("Current price").fill("1499");
  const nextUrl = "https://shop.example/ACCESS_RESTRICTED?variant=2";
  const automaticRequest = page
    .waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().startsWith(fixtureImporter),
      { timeout: 750 },
    )
    .then(
      () => true,
      () => false,
    );
  await link.fill(nextUrl);
  await expect(form).toBeVisible();
  await expect(field("Product title")).toHaveValue("My lamp");
  await expect(field("Current price")).toHaveValue("1499");
  await expect(button("Preview")).toBeEnabled();
  expect(await automaticRequest).toBe(false);
  const preview = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().startsWith(fixtureImporter),
  );
  await button("Preview").click();
  expect((await preview).postDataJSON().url).toBe(nextUrl);
  await expect(form).toBeVisible();
  await expect(field("Product title")).toHaveValue("My lamp");
};
