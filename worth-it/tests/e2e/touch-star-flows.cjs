const fs = require("node:fs");
const path = require("node:path");
exports.verifyTouchStars = async ({ page, base, project, width, expect }) => {
  const id = "91000000-0000-4000-8000-000000000001";
  const image =
    "data:image/png;base64," +
    fs
      .readFileSync(path.join(project, "assets/demo/oversized-tee.png"))
      .toString("base64");
  await page.evaluate(
    ({ id, image }) => {
      const local = JSON.parse(localStorage.getItem("worthit:local:v1"));
      local.polls = local.polls.filter((p) => p.id !== id);
      local.polls.unshift({
        id,
        authorId: local.home,
        itemName: "Touch gallery fixture",
        priceInr: 999,
        question: "Does this outfit work?",
        isDemo: false,
        demoImage: null,
        imageUrl: image,
        category: "fashion",
        media: [
          { kind: "image", value: image },
          { kind: "image", value: image + "#second" },
        ],
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem("worthit:local:v1", JSON.stringify(local));
    },
    { id, image },
  );
  const cdp = width < 600 ? await page.context().newCDPSession(page) : null;
  async function doubleTap(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const x = box.x + box.width * 0.5,
      y = box.y + box.height * 0.35;
    const start = async (px, py) =>
      cdp
        ? cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: px, y: py, id: 1 }],
          })
        : page.mouse.down();
    const end = async () =>
      cdp
        ? cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          })
        : page.mouse.up();
    if (!cdp) await page.mouse.move(x, y);
    await start(x, y);
    await page.waitForTimeout(45);
    await end();
    // The second press starts within the window but ends after it: previously opened mid-gesture.
    await page.waitForTimeout(240);
    await start(x + 8, y + 2);
    await page.waitForTimeout(180);
    await end();
  }
  const count = () =>
    page.evaluate(
      (id) =>
        (JSON.parse(localStorage.getItem("worthit:local:v1")).stars?.[id] || [])
          .length,
      id,
    );
  for (const [appearance, mode] of [
    ["Normal", "Light"],
    ["Liquid Glass", "Light"],
    ["Liquid Glass", "Dark"],
  ]) {
    await page.goto(base + "/settings/appearance");
    await page.getByRole("radio", { name: appearance, exact: true }).click();
    await page.getByRole("radio", { name: mode, exact: true }).click();
    await page.goto(base);
    const surface = page
      .getByTestId("feed-poll-surface")
      .filter({ hasText: "Touch gallery fixture" });
    await expect(surface).toBeVisible();
    const unstar = surface.getByRole("button", {
      name: "Unstar poll",
      exact: true,
    });
    if (await unstar.count()) {
      await unstar.click();
      await expect.poll(count).toBe(0);
    }
    const photo = page.getByTestId("poll-card-" + id);
    const before = page.url();
    await doubleTap(photo);
    await expect.poll(count).toBe(1);
    await expect(
      surface.getByRole("button", { name: "Unstar poll", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(400);
    expect(page.url()).toBe(before);
    await doubleTap(photo);
    await page.waitForTimeout(400);
    expect(page.url()).toBe(before);
    expect(await count()).toBe(1);
    await photo.click();
    await expect(page).toHaveURL(new RegExp("/p/" + id + "$"));
    await page.reload();
    await expect.poll(count).toBe(1);
    await page.goto(base + "/search");
    const tile = page
      .locator('[data-testid^="explore-reel:"]')
      .filter({ hasText: "Demo" })
      .first();
    const reelId = (await tile.getAttribute("data-testid")).slice(
      "explore-reel:".length,
    );
    await tile.click();
    await expect(page).toHaveURL(/\/reels\?/);
    const reel = page.getByTestId("reel-page-" + reelId);
    const reelCount = () =>
      page.evaluate(
        (id) =>
          (
            JSON.parse(localStorage.getItem("worthit:social:v1") || "{}")
              .likes?.[id] || []
          ).length,
        reelId,
      );
    const undo = reel.getByRole("button", {
      name: "Unstar check",
      exact: true,
    });
    if (await undo.count()) {
      await undo.click();
      await expect.poll(reelCount).toBe(0);
    }
    const playing = reel.getByRole("button", {
      name: "Pause video",
      exact: true,
    });
    await expect(playing).toBeVisible();
    await doubleTap(playing);
    await expect.poll(reelCount).toBe(1);
    await doubleTap(playing);
    await page.waitForTimeout(400);
    expect(await reelCount()).toBe(1);
    await expect(playing).toBeVisible();
    await expect(
      reel.getByRole("button", { name: "Unstar check", exact: true }),
    ).toBeVisible();
  }
  // Creation comparisons use the video's tap controller rather than nesting a play button.
  const video =
    "data:video/mp4;base64," +
    fs
      .readFileSync(path.join(project, "assets/demo/oversized-tee-reel.mp4"))
      .toString("base64");
  const compareId = "91000000-0000-4000-8000-000000000002",
    postId = "91000000-0000-4000-8000-000000000003";
  await page.evaluate(
    ({ id, compareId, postId, video, image }) => {
      const local = JSON.parse(localStorage.getItem("worthit:local:v1"));
      const original = local.polls.find((p) => p.id === id);
      local.polls.push({
        ...original,
        id: compareId,
        itemName: "Touch video comparison",
        media: [
          { kind: "video", value: video },
          { kind: "image", value: image },
        ],
        creationSpec: {
          version: 1,
          subtype: "compare",
          products: [
            { id: "a", name: "First look", media: [0] },
            { id: "b", name: "Second look", media: [1] },
          ],
          options: [
            { id: "a", label: "First look", productId: "a" },
            { id: "b", label: "Second look", productId: "b" },
          ],
        },
      });
      local.polls.push({
        ...original,
        id: postId,
        itemName: "Touch modern post",
        contentKind: "post",
        creationSpec: {
          version: 1,
          subtype: "post",
          products: [],
          options: [],
        },
      });
      localStorage.setItem("worthit:local:v1", JSON.stringify(local));
    },
    { id, compareId, postId, video, image },
  );
  await page.goto(base + "/p/" + compareId);
  const videoTap = page.getByRole("button", {
    name: "Open content",
    exact: true,
  });
  await expect(videoTap).toBeVisible();
  await doubleTap(videoTap);
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (
            JSON.parse(localStorage.getItem("worthit:local:v1")).stars?.[id] ||
            []
          ).length,
        compareId,
      ),
    )
    .toBe(1);
  await page.goto(base);
  const postPhoto = page.getByRole("link", {
    name: "Open Touch modern post",
    exact: true,
  });
  await doubleTap(postPhoto);
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (
            JSON.parse(localStorage.getItem("worthit:local:v1")).stars?.[id] ||
            []
          ).length,
        postId,
      ),
    )
    .toBe(1);
  await postPhoto.click();
  await expect(page).toHaveURL(new RegExp("/p/" + postId + "$"));
  await cdp?.detach();
  await page.goto(base + "/settings/appearance");
  await page.getByRole("radio", { name: "Normal", exact: true }).click();
  await page.getByRole("radio", { name: "Light", exact: true }).click();
};
