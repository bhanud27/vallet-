// Isolated browser verification. Builds with Supabase disabled; never uses a live account.
const { chromium, expect } = require("@playwright/test");
const { spawnSync } = require("node:child_process");
const { createServer } = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const project = path.resolve(__dirname, "../..");
const output = path.join(project, process.env.SETTINGS_UI_ONLY === "1" ? ".expo/settings-ui-check" : ".expo/social-ui-check");
const shots = path.join(project, ".expo/social-ui-shots");
async function main() {
  const cli = path.join(
    path.dirname(require.resolve("expo/package.json")),
    "bin/cli",
  );
  const built = spawnSync(
    process.execPath,
    [cli, "export", "--platform", "web", "--output-dir", output],
    {
      cwd: project,
      encoding: "utf8",
      env: {
        ...process.env,
        EXPO_NO_DOTENV: "1",
        APP_ENV: "preview",
        EXPO_PUBLIC_SUPABASE_URL: "",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "",
        EXPO_PUBLIC_TURNSTILE_SITE_KEY: "",
        EXPO_PUBLIC_PRODUCT_IMPORT_URL: "",
        EXPO_PUBLIC_WEB_URL: "",
      },
    },
  );
  if (built.status !== 0)
    throw new Error(
      "Demo export failed: " + (built.stderr || built.stdout).slice(-1200),
    );
  console.log("Isolated local demo export passed.");
  fs.mkdirSync(shots, { recursive: true });
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".mp4": "video/mp4",
    ".ico": "image/x-icon",
  };
  const server = createServer((req, res) => {
    let file = path.resolve(
      output,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (file !== output && !file.startsWith(output + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile())
      file = path.join(output, "index.html");
    const bytes = fs.readFileSync(file),
      type = mime[path.extname(file)] || "application/octet-stream";
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    if (range) {
      const start = Number(range[1]),
        end = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
      if (start > end) {
        res.writeHead(416).end();
        return;
      }
      res.writeHead(206, {
        "Content-Type": type,
        "Accept-Ranges": "bytes",
        "Content-Range": "bytes " + start + "-" + end + "/" + bytes.length,
        "Content-Length": end - start + 1,
      });
      res.end(bytes.subarray(start, end + 1));
    } else {
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": bytes.length,
        "Accept-Ranges": "bytes",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const channel =
    process.env.PLAYWRIGHT_CHANNEL ||
    (process.platform === "win32" ? "msedge" : undefined);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(channel ? { channel } : {}),
    });
    for (const [width, height] of [
      [390, 844],
      [414, 900],
      [1024, 800],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: "light",
        isMobile: width < 600,
        hasTouch: width < 600,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.route("**/*", (route) => {
          const url = route.request().url();
          return url.startsWith(base) ||
            url.startsWith("blob:") ||
            url.startsWith("data:")
            ? route.continue()
            : route.abort();
        });
        await page.goto(base);
        await expect(page.getByTestId("mode-banner")).toBeVisible();
        if (process.env.SETTINGS_UI_ONLY === "1") {
          await require("./settings-grid-flows.cjs").verifySettingsGrids({
            page,
            base,
            shots,
            width,
            expect,
          });
          if (process.env.CREATION_UI_ONLY === "1")
            await require("./creation-flows.cjs").verifyCreation({
              page,
              base,
              project,
              shots,
              width,
              expect,
            });
          expect(errors).toEqual([]);
          console.log(width + "px Settings editing and activity grids passed");
          await context.close();
          continue;
        }
        if (process.env.NAV_UI_ONLY === "1") {
          await require("./navigation-flows.cjs").verifyFloatingNavigation({
            page,
            base,
            shots,
            width,
            expect,
          });
          expect(errors).toEqual([]);
          console.log(width + "px floating navigation flows passed");
          await context.close();
          continue;
        }
        if (process.env.TOUCH_UI_ONLY === "1") {
          await require("./touch-star-flows.cjs").verifyTouchStars({
            page,
            base,
            project,
            width,
            expect,
          });
          expect(errors).toEqual([]);
          console.log(width + "px touch Star flows passed");
          await context.close();
          continue;
        }
        if (process.env.APPEARANCE_UI_ONLY === "1") {
          await require("./appearance-flows.cjs").verifyAppearance({
            page,
            base,
            shots,
            width,
            expect,
          });
          expect(errors).toEqual([]);
          await require("./touch-star-flows.cjs").verifyTouchStars({
            page,
            base,
            project,
            width,
            expect,
          });
          expect(errors).toEqual([]);
          console.log(width + "px appearance and touch Star flows passed");
          await context.close();
          continue;
        }
        if (process.env.CREATION_UI_ONLY === "1") {
          await require("./creation-flows.cjs").verifyCreation({
            page,
            base,
            project,
            shots,
            width,
            expect,
          });
          expect(errors).toEqual([]);
          console.log(width + "px creation flows passed");
          await context.close();
          continue;
        }
        const photo = page.locator('[data-testid^="poll-card-"]').first();
        await expect(photo).toBeVisible();
        const bounds = await photo.boundingBox();
        if (width < 600)
          expect(bounds.width).toBeGreaterThanOrEqual(width - 24);
        else expect(bounds.width).toBeGreaterThanOrEqual(590);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width + 1);
        await page.screenshot({ path: path.join(shots, width + "-feed.png") });
        const startUrl = page.url();
        await page
          .locator('[data-testid^="comments-toggle-poll-"]')
          .first()
          .click();
        const pollComments = page.getByTestId("comments-panel");
        await expect(
          pollComments.getByRole("textbox", { name: "Add a comment" }),
        ).toBeVisible();
        expect(page.url()).toBe(startUrl);
        await expect
          .poll(async () => {
            const bounds = await pollComments.boundingBox();
            return width < 900
              ? Math.abs(bounds.y + bounds.height - height)
              : Math.abs(bounds.x + bounds.width - width);
          })
          .toBeLessThan(2);
        const panelBox = await pollComments.boundingBox();
        if (width < 900) {
          expect(Math.abs(panelBox.y + panelBox.height - height)).toBeLessThan(
            2,
          );
          const before = panelBox.height;
          await pollComments
            .getByRole("button", { name: "Expand comments", exact: true })
            .click();
          await expect
            .poll(async () => (await pollComments.boundingBox()).height)
            .toBeGreaterThan(before + 50);
          await pollComments
            .getByRole("button", { name: "Collapse comments", exact: true })
            .click();
        } else {
          expect(Math.abs(panelBox.x + panelBox.width - width)).toBeLessThan(2);
          expect(panelBox.width).toBe(400);
        }
        await page.screenshot({
          path: path.join(shots, width + "-post-comments.png"),
        });
        await pollComments
          .getByRole("button", { name: "Close comments", exact: true })
          .click();
        await expect(pollComments).toHaveCount(0);
        const reel = page.locator('[data-testid^="feed-reel-"]').first();
        await reel.scrollIntoViewIfNeeded();
        await expect(reel.locator("video")).toHaveCount(1, { timeout: 15000 });
        await expect
          .poll(() => reel.locator("video").evaluate((video) => video.paused))
          .toBe(false);
        expect(
          await page.locator('[data-testid^="feed-reel-"] video').count(),
        ).toBe(1);
        await page.screenshot({
          path: path.join(shots, width + "-inline-reel.png"),
        });
        await reel.getByRole("button", { name: /Show comments for/ }).click();
        await expect(
          page
            .getByTestId("comments-panel")
            .getByRole("textbox", { name: "Add a comment" }),
        ).toBeVisible();
        expect(page.url()).toBe(startUrl);
        await expect
          .poll(() =>
            page
              .locator("video")
              .evaluateAll((videos) => videos.some((video) => !video.paused)),
          )
          .toBe(false);
        await page
          .getByTestId("comments-panel")
          .getByRole("button", { name: "Close comments", exact: true })
          .click();
        await expect(page.getByTestId("comments-panel")).toHaveCount(0);
        await page.getByRole("button", { name: "Spot", exact: true }).click();
        await expect(page).toHaveURL(/\/search$/);
        await expect(page.getByTestId("explore-grid")).toBeVisible();
        const tiles = page.locator(
          '[data-testid^="explore-poll:"], [data-testid^="explore-reel:"]',
        );
        await expect(tiles).toHaveCount(30, { timeout: 15000 });
        const boxes = await Promise.all(
          [0, 1, 2].map(async (i) => tiles.nth(i).boundingBox()),
        );
        expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(2);
        expect(boxes[2].x + boxes[2].width).toBeLessThanOrEqual(width + 1);
        expect(boxes[0].width).toBeLessThan(width / 2);
        const thumbnail = await tiles
          .first()
          .locator('[aria-label^="Photo of"]')
          .first()
          .boundingBox();
        expect(thumbnail.width).toBeLessThanOrEqual(boxes[0].width + 1);
        expect(thumbnail.height).toBeLessThanOrEqual(boxes[0].height + 1);
        await expect
          .poll(() =>
            page
              .locator("video")
              .evaluateAll((videos) => videos.some((video) => !video.paused)),
          )
          .toBe(false);
        const preview = page
          .locator('[data-testid^="explore-reel:"] video')
          .first();
        await expect(preview).toHaveCount(1, { timeout: 10000 });
        await expect
          .poll(() => preview.evaluate((video) => video.readyState))
          .toBeGreaterThanOrEqual(2);
        await page.screenshot({
          path: path.join(shots, width + "-search.png"),
        });
        await page.locator('[data-testid^="explore-reel:"]').first().click();
        await expect(page).toHaveURL(/\/reels\?/);
        const pager = page.getByTestId("reels-list");
        const requestedId = new URL(page.url()).searchParams.get("reel");
        const firstPage = page.getByTestId("reel-page-" + requestedId);
        await expect(firstPage).toBeVisible();
        await expect
          .poll(() =>
            firstPage
              .locator("video")
              .evaluateAll((videos) => videos.some((video) => !video.paused)),
          )
          .toBe(true);
        const checkSurface = firstPage.getByRole("button", {
          name: "Pause video",
          exact: true,
        });
        await checkSurface.dblclick({ delay: 65 });
        await expect(
          firstPage.getByRole("button", { name: "Unstar check", exact: true }),
        ).toBeVisible();
        await checkSurface.dblclick({ delay: 65 });
        await expect
          .poll(() =>
            page.evaluate(
              (id) =>
                (
                  JSON.parse(localStorage.getItem("worthit:social:v1") || "{}")
                    .likes?.[id] || []
                ).length,
              requestedId,
            ),
          )
          .toBe(1);
        await expect
          .poll(() =>
            firstPage
              .locator("video")
              .evaluateAll((videos) => videos.some((video) => !video.paused)),
          )
          .toBe(true);
        await expect(
          page.getByRole("button", { name: "Notifications", exact: true }),
        ).toHaveCount(0);
        const soundBox = await firstPage
          .getByRole("button", { name: "Unmute video", exact: true })
          .boundingBox();
        const bellBox = await page
          .getByRole("button", { name: "New check", exact: true })
          .boundingBox();
        expect(soundBox.y).toBeGreaterThanOrEqual(bellBox.y + bellBox.height);
        const pagerBox = await pager.boundingBox();
        const firstBox = await firstPage.boundingBox();
        expect(Math.abs(firstBox.height - pagerBox.height)).toBeLessThan(2);
        expect(Math.abs(firstBox.y - pagerBox.y)).toBeLessThan(2);
        expect(
          await pager.evaluate((node) => getComputedStyle(node).scrollSnapType),
        ).toBe("y mandatory");
        await page.mouse.move(
          pagerBox.x + pagerBox.width / 2,
          pagerBox.y + pagerBox.height / 2,
        );
        await page.mouse.wheel(0, pagerBox.height * 0.7);
        await expect(page.getByTestId("reel-position")).toHaveText("2 / 10", {
          timeout: 15000,
        });
        await expect
          .poll(async () =>
            Math.abs(
              (await pager.evaluate((node) => node.scrollTop)) -
                pagerBox.height,
            ),
          )
          .toBeLessThan(2);
        await expect
          .poll(() =>
            pager
              .locator("video")
              .evaluateAll(
                (videos) => videos.filter((video) => !video.paused).length,
              ),
          )
          .toBe(1);
        const activeId = await pager.locator("video").evaluateAll((videos) =>
          videos
            .find((video) => !video.paused)
            .closest('[data-testid^="reel-page-"]')
            .getAttribute("data-testid"),
        );
        const reelPost = page.getByTestId(activeId);
        await page.evaluate((id) => {
          const key = "worthit:comments:v1";
          const threads = JSON.parse(localStorage.getItem(key) || "{}");
          threads["reel:" + id.replace("reel-page-", "")] = Array.from(
            { length: 16 },
            (_, index) => ({
              id: "ui-comment-" + index,
              username: "demo_member_" + index,
              body:
                index === 0
                  ? "A detailed product opinion. ".repeat(17)
                  : "Sample shopper opinion number " +
                    index +
                    ": compare comfort, quality and value before buying.",
              created_at: new Date(Date.now() - index * 60000).toISOString(),
            }),
          );
          localStorage.setItem(key, JSON.stringify(threads));
        }, activeId);

        const reelUrl = page.url();
        await reelPost
          .getByRole("button", { name: "Show check comments" })
          .click();
        const sheet = page.getByTestId("reel-sheet");
        const composer = sheet.getByRole("textbox", { name: "Add a comment" });
        await expect(composer).toBeVisible();
        expect(page.url()).toBe(reelUrl);
        await expect(sheet.getByTestId("comment-ui-comment-0")).toBeVisible();
        await sheet
          .getByRole("button", { name: "Read full comment by demo_member_0" })
          .click();
        await expect(
          sheet.getByRole("button", {
            name: "Collapse comment by demo_member_0",
          }),
        ).toBeVisible();
        const fixedComposer = sheet.getByTestId("comment-composer");
        await expect
          .poll(async () => {
            const bounds = await sheet.boundingBox();
            return width < 900
              ? Math.abs(bounds.y + bounds.height - height)
              : Math.abs(bounds.x + bounds.width - width);
          })
          .toBeLessThan(2);
        const composeY = (await fixedComposer.boundingBox()).y;
        await composer.fill("Keep my draft");
        await sheet
          .getByRole("button", { name: "Oldest comments", exact: true })
          .click();
        await expect(composer).toHaveValue("Keep my draft");
        await expect(
          sheet.getByTestId("comment-ui-comment-15"),
        ).toBeInViewport();
        await sheet
          .getByRole("button", { name: "Newest comments", exact: true })
          .click();
        await composer.fill("");
        await expect(
          sheet.getByRole("button", { name: "Post comment", exact: true }),
        ).toBeDisabled();
        await sheet
          .getByRole("button", { name: "Add thumbs up", exact: true })
          .click();
        await expect(composer).toHaveValue("\u{1F44D}");
        await sheet.getByTestId("comments-list").evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        await expect
          .poll(async () =>
            Math.abs((await fixedComposer.boundingBox()).y - composeY),
          )
          .toBeLessThan(2);
        await expect(composer).toBeVisible();
        if (width >= 900) {
          const bounds = await sheet.boundingBox();
          const videoBounds = await pager.boundingBox();
          expect(videoBounds.x + videoBounds.width).toBeLessThanOrEqual(
            bounds.x,
          );
        }

        await expect
          .poll(() =>
            page
              .locator("video")
              .evaluateAll(
                (videos) => videos.filter((video) => !video.paused).length,
              ),
          )
          .toBe(0);
        await composer.fill("A sample comment from the reel viewer.");
        await composer.press("ArrowDown");
        await sheet
          .getByRole("button", { name: "Post comment", exact: true })
          .click();
        await expect(
          sheet.getByText("A sample comment from the reel viewer.", {
            exact: true,
          }),
        ).toBeInViewport();
        await expect(page.getByTestId("reel-position")).toHaveText("2 / 10");
        await sheet
          .getByRole("button", { name: "Oldest comments", exact: true })
          .click();
        await composer.fill("Posted while reading oldest first.");
        await sheet
          .getByRole("button", { name: "Post comment", exact: true })
          .click();
        await expect(
          sheet.getByText("Posted while reading oldest first.", {
            exact: true,
          }),
        ).toBeInViewport();
        await page.screenshot({
          path: path.join(shots, width + "-reel-comments.png"),
        });
        if (width === 390) {
          const handle = await sheet
            .getByTestId("comment-sheet-handle")
            .boundingBox();
          const touch = await context.newCDPSession(page);
          const x = Math.round(handle.x + handle.width / 2),
            y = Math.round(handle.y + handle.height / 2);
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y }],
          });
          for (let step = 1; step <= 6; step++) {
            await touch.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ x, y: y + step * 25 }],
            });
            await new Promise((resolve) => setTimeout(resolve, 35));
          }
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await touch.detach();
        } else if (width >= 900) {
          await page.keyboard.press("Escape");
        } else {
          await sheet
            .getByRole("button", { name: "Close comments", exact: true })
            .click();
        }
        await expect(sheet).toHaveCount(0);
        await expect
          .poll(async () =>
            Math.abs(
              (await pager.evaluate((node) => node.scrollTop)) -
                pagerBox.height,
            ),
          )
          .toBeLessThan(2);
        await expect
          .poll(() =>
            pager
              .locator("video")
              .evaluateAll(
                (videos) => videos.filter((video) => !video.paused).length,
              ),
          )
          .toBe(1);
        await page.keyboard.press("ArrowDown");
        await expect(page.getByTestId("reel-position")).toHaveText("3 / 10");
        await expect
          .poll(async () =>
            Math.abs(
              (await pager.evaluate((node) => node.scrollTop)) -
                2 * pagerBox.height,
            ),
          )
          .toBeLessThan(2);
        if (width === 390) {
          await page.setViewportSize({ width, height: height - 130 });
          await expect
            .poll(async () => {
              const box = await pager.boundingBox();
              return Math.abs(
                (await pager.evaluate((node) => node.scrollTop)) -
                  2 * box.height,
              );
            })
            .toBeLessThan(2);
          await expect(page.getByTestId("reel-position")).toHaveText("3 / 10");
          await page.setViewportSize({ width, height });
          await expect
            .poll(async () =>
              Math.abs(
                (await pager.evaluate((node) => node.scrollTop)) -
                  2 * pagerBox.height,
              ),
            )
            .toBeLessThan(2);
          await expect(page.getByTestId("reel-position")).toHaveText("3 / 10");
        }
        await page.keyboard.press("ArrowUp");
        await expect(page.getByTestId("reel-position")).toHaveText("2 / 10");
        await expect
          .poll(async () =>
            Math.abs(
              (await pager.evaluate((node) => node.scrollTop)) -
                pagerBox.height,
            ),
          )
          .toBeLessThan(2);
        await page.screenshot({
          path: path.join(shots, width + "-reels-pager.png"),
        });
        if (width === 390) {
          // A touch swipe advances a full page on mobile web.
          const touch = await context.newCDPSession(page);
          const x = Math.round(pagerBox.x + pagerBox.width / 2);
          const startY = Math.round(pagerBox.y + pagerBox.height * 0.7);
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y: startY }],
          });
          for (let step = 1; step <= 8; step++) {
            await touch.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [
                {
                  x,
                  y: startY - Math.round((pagerBox.height * 0.65 * step) / 8),
                },
              ],
            });
            await new Promise((resolve) => setTimeout(resolve, 35));
          }
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await touch.detach();
          await expect(page.getByTestId("reel-position")).toHaveText("3 / 10");
          await expect
            .poll(async () =>
              Math.abs(
                (await pager.evaluate((node) => node.scrollTop)) -
                  2 * pagerBox.height,
              ),
            )
            .toBeLessThan(2);
          // Let touch inertia finish before switching to keyboard input.
          await pager.evaluate(
            (node) =>
              new Promise((resolve) => {
                let previous = node.scrollTop,
                  stable = 0;
                const frame = () => {
                  stable =
                    Math.abs(node.scrollTop - previous) < 0.5 ? stable + 1 : 0;
                  previous = node.scrollTop;
                  if (stable >= 6) resolve();
                  else requestAnimationFrame(frame);
                };
                requestAnimationFrame(frame);
              }),
          );
          // Exercise virtualization well beyond the initial render window.
          for (let next = 4; next <= 8; next++) {
            await page.keyboard.press("ArrowDown");
            await expect(page.getByTestId("reel-position")).toHaveText(
              next + " / 10",
            );
            await expect
              .poll(async () =>
                Math.abs(
                  (await pager.evaluate((node) => node.scrollTop)) -
                    (next - 1) * pagerBox.height,
                ),
              )
              .toBeLessThan(2);
          }
          await expect
            .poll(() =>
              pager
                .locator("video")
                .evaluateAll(
                  (videos) => videos.filter((video) => !video.paused).length,
                ),
            )
            .toBe(1);
        }
        // Settings routes, real local preference persistence, and draft/help content.
        await page.goto(base + "/account");
        for (const label of [
          "Personal Information",
          "Password & Security",
          "Privacy & Account Visibility",
          "Appearance",
          "Notifications",
          "Language",
          "Content Preferences",
          "Archive",
          "Saved Content",
          "Your Stars",
          "Poll Activity",
          "Your Comments",
          "Help & Support",
          "Report a Problem",
          "Community Guidelines",
          "Terms of Service",
          "Privacy Policy",
          "About Worth It",
          "Log Out",
          "Deactivate Account",
          "Delete Account",
        ]) {
          await expect(
            page.getByRole("button", { name: label, exact: true }),
          ).toBeVisible();
        }
        await page
          .getByRole("button", { name: "Personal Information", exact: true })
          .click();
        await expect(
          page.getByRole("textbox", { name: "Display name", exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByRole("textbox", { name: "Display name", exact: true }),
        ).not.toBeEditable();
        await page
          .getByRole("button", { name: "Edit Display name", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Display name", exact: true })
          .fill("Settings Tester");
        await page
          .getByRole("button", { name: "Edit Username", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Username", exact: true })
          .fill("settings_tester");
        await page
          .getByRole("button", { name: "Edit Profile bio", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Profile bio", exact: true })
          .fill("Testing my fashion preferences");
        await page
          .getByRole("button", {
            name: "Save personal information",
            exact: true,
          })
          .click();
        await expect(
          page.getByText(
            "Personal information saved. Your profile is updated.",
          ),
        ).toBeVisible();
        await page.goto(base + "/settings/content");
        await expect(
          page.getByRole("switch", { name: "Video autoplay", exact: true }),
        ).toBeEnabled();
        await page
          .getByRole("switch", { name: "Video autoplay", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Edit Preferred brands", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Preferred brands", exact: true })
          .fill("Cotton Lane");
        await page
          .getByRole("button", { name: "Save preferences", exact: true })
          .click();
        await expect(
          page.getByText("Preferences saved.", { exact: true }),
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByRole("switch", { name: "Video autoplay", exact: true }),
        ).not.toBeChecked();
        await expect(
          page.getByRole("textbox", { name: "Preferred brands", exact: true }),
        ).toHaveValue("Cotton Lane");
        await page
          .getByRole("switch", { name: "Video autoplay", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Edit Preferred brands", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Preferred brands", exact: true })
          .fill("");
        await page
          .getByRole("button", { name: "Save preferences", exact: true })
          .click();
        await expect(
          page.getByText("Preferences saved.", { exact: true }),
        ).toBeVisible();
        await page.goto(base + "/settings/notifications");
        await expect(
          page.getByRole("switch", { name: "New votes", exact: true }),
        ).toBeEnabled();
        await page
          .getByRole("switch", { name: "New votes", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Save preferences", exact: true })
          .click();
        await expect(
          page.getByText("Preferences saved.", { exact: true }),
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByRole("switch", { name: "New votes", exact: true }),
        ).not.toBeChecked();
        for (const section of [
          "security",
          "privacy",
          "language",
          "stars",
          "polls",
          "comments",
          "help",
          "guidelines",
          "terms",
          "policy",
          "about",
          "logout",
          "deactivate",
          "delete",
          "blocked",
          "muted",
        ]) {
          await page.goto(base + "/settings/" + section);
          const expected = {
            security:
              "Password settings require a registered connected account.",
            privacy: "Who can comment",
            language: "English",
            stars:
              "Older Stars may use the original content date because their Star time was not recorded.",
            help: "Help & FAQs",
            guidelines: "Community Guidelines",
            terms: "Terms of Service — draft",
            policy: "Privacy Policy — draft",
            about: "Version",
            logout: "This is a local demo without a server account.",
            deactivate: "This is a local demo without a server account.",
            delete: "This is a local demo without a server account.",
            blocked: "No accounts here.",
            muted: "No accounts here.",
          };
          if (expected[section])
            await expect(
              page
                .getByText(expected[section], {
                  exact: !["logout", "deactivate", "delete", "about"].includes(
                    section,
                  ),
                })
                .last(),
            ).toBeVisible();
          else
            await expect(
              page.getByRole("button", { name: "Try again", exact: true }),
            ).toHaveCount(0);
          await expect(
            page.getByText("This settings page is unavailable.", {
              exact: true,
            }),
          ).toHaveCount(0);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width + 1);
        }
        await page.goto(base + "/settings/report");
        await page
          .getByRole("button", {
            name: "Edit Describe the problem",
            exact: true,
          })
          .click();
        await page
          .getByRole("textbox", { name: "Describe the problem", exact: true })
          .fill("The profile layout needs checking on my phone.");
        await page
          .getByRole("button", { name: "Submit problem report", exact: true })
          .click();
        await expect(
          page.getByText(/Demo report saved on this device/),
        ).toBeVisible();
        await page.goto(base + "/settings/appearance");
        await expect(
          page.getByText("Normal theme", { exact: true }),
        ).toBeVisible();
        await page.getByRole("radio", { name: "System", exact: true }).click();
        await page.emulateMedia({ colorScheme: "dark" });
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.style.colorScheme),
          )
          .toBe("dark");
        await page.emulateMedia({ colorScheme: "light" });
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.style.colorScheme),
          )
          .toBe("light");
        await page.getByRole("radio", { name: "Light", exact: true }).click();
        await page.goto(base + "/account");
        await expect(
          page.getByRole("button", {
            name: "Personal Information",
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(shots, width + "-settings-home.png"),
          fullPage: true,
        });
        // Sample visibility persists across reloads without resetting the catalog.
        await page.goto(base + "/settings/content");
        const sampleSwitch = page.getByRole("switch", {
          name: "Show sample content",
        });
        await expect(sampleSwitch).toBeChecked();
        await sampleSwitch.click();
        await expect(sampleSwitch).not.toBeChecked();
        await page.goto(base + "/search");
        await expect(
          page.getByText("No posts or checks found.", { exact: true }),
        ).toBeVisible();
        await expect(
          page.locator(
            '[data-testid^="explore-poll:"], [data-testid^="explore-reel:"]',
          ),
        ).toHaveCount(0);
        await page.goto(base + "/");
        await expect(
          page.getByText("Your feed is empty", { exact: true }),
        ).toBeVisible();
        await page.goto(base + "/settings/content");
        await page.getByRole("switch", { name: "Show sample content" }).click();
        await page.goto(base + "/search");
        await expect(
          page.locator(
            '[data-testid^="explore-poll:"], [data-testid^="explore-reel:"]',
          ),
        ).toHaveCount(30, { timeout: 15000 });

        // Appearance applies to existing controls, survives reloads, and reaches modal portals.
        await page.goto(base + "/settings/appearance");
        const darkSwitch = page.getByRole("radio", {
          name: "Dark",
          exact: true,
        });
        await expect(darkSwitch).not.toBeChecked();
        const existingControl = await darkSwitch.elementHandle();
        await darkSwitch.click();
        await expect(darkSwitch).toBeChecked();
        expect(await existingControl.evaluate((node) => node.isConnected)).toBe(
          true,
        );
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.style.colorScheme),
          )
          .toBe("dark");
        await expect
          .poll(() =>
            page
              .getByTestId("app-theme-root")
              .evaluate((node) => getComputedStyle(node).backgroundColor),
          )
          .toBe("rgb(0, 0, 0)");
        await page.reload();
        await expect(
          page.getByRole("radio", { name: "Dark", exact: true }),
        ).toBeChecked();
        await page.screenshot({
          path: path.join(shots, width + "-dark-settings.png"),
        });
        await page.goto(base + "/");
        await expect(
          page.locator('[data-testid^="poll-card-"]').first(),
        ).toBeVisible();
        const title = page
          .getByText("Cotton Lane oversized T-shirt", { exact: true })
          .first();
        await expect
          .poll(() => title.evaluate((node) => getComputedStyle(node).color))
          .toBe("rgb(245, 245, 245)");
        await expect
          .poll(() =>
            page
              .getByText("Asking", { exact: true })
              .first()
              .evaluate((node) => getComputedStyle(node).color),
          )
          .toBe("rgb(39, 52, 11)");
        await page.screenshot({
          path: path.join(shots, width + "-dark-feed.png"),
        });
        await page
          .locator('[data-testid^="comments-toggle-poll-"]')
          .first()
          .click();
        const darkComments = page.getByTestId("comments-panel");
        await expect(
          darkComments.getByRole("textbox", { name: "Add a comment" }),
        ).toBeVisible();
        await expect
          .poll(() =>
            darkComments.evaluate(
              (node) => getComputedStyle(node).backgroundColor,
            ),
          )
          .toBe("rgb(17, 17, 17)");
        await expect
          .poll(() =>
            darkComments
              .getByRole("textbox", { name: "Add a comment" })
              .evaluate((node) => getComputedStyle(node).backgroundColor),
          )
          .toBe("rgb(28, 28, 28)");
        await expect
          .poll(async () => {
            const bounds = await darkComments.boundingBox();
            return width < 900
              ? Math.abs(bounds.y + bounds.height - height)
              : Math.abs(bounds.x + bounds.width - width);
          })
          .toBeLessThan(2);
        await page.screenshot({
          path: path.join(shots, width + "-dark-comments.png"),
          animations: "disabled",
        });
        await darkComments
          .getByRole("button", { name: "Close comments", exact: true })
          .click();
        await page.goto(base + "/new");
        await page
          .getByRole("textbox", {
            name: "Product link (optional)",
            exact: true,
          })
          .fill("https://example.com/draft");
        const itemName = page.getByRole("textbox", {
          name: "Product name",
          exact: true,
        });
        await itemName.fill("Saved dark draft");
        await expect
          .poll(() =>
            itemName.evaluate((node) => getComputedStyle(node).borderTopColor),
          )
          .toBe("rgb(206, 255, 102)");
        await expect
          .poll(() => itemName.evaluate((node) => getComputedStyle(node).color))
          .toBe("rgb(245, 245, 245)");
        await expect
          .poll(() =>
            page.evaluate(() =>
              Object.values(localStorage).some((value) =>
                value.includes("Saved dark draft"),
              ),
            ),
          )
          .toBe(true);
        await page.screenshot({
          path: path.join(shots, width + "-dark-form.png"),
        });
        await page.goto(base + "/settings/appearance");
        await page.getByRole("radio", { name: "Light", exact: true }).click();
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.style.colorScheme),
          )
          .toBe("light");
        await page.goto(base + "/new");
        await expect(
          page.getByRole("textbox", { name: "Product name", exact: true }),
        ).toHaveValue("Saved dark draft");
        await expect
          .poll(() =>
            page
              .getByRole("textbox", { name: "Product name", exact: true })
              .evaluate((node) => getComputedStyle(node).color),
          )
          .toBe("rgb(29, 27, 45)");

        // Own-profile fixtures are confined to this isolated local browser context.
        const previewImage =
          "data:image/png;base64," +
          fs
            .readFileSync(path.join(project, "assets/demo/oversized-tee.png"))
            .toString("base64");
        await page.evaluate((image) => {
          const local = JSON.parse(localStorage.getItem("worthit:local:v1"));
          const author = local.home;
          const id = (kind, index) =>
            kind +
            "0000000-0000-4000-8000-" +
            String(index + 1).padStart(12, "0");
          for (let index = 0; index < 7; index++)
            local.polls.push({
              id: id("1", index),
              authorId: author,
              itemName: "Profile outfit " + (index + 1),
              priceInr: 699 + index * 100,
              question: "Would you choose this outfit?",
              imageUrl: image,
              demoImage: null,
              isDemo: false,
              category: "fashion",
              media: [{ kind: "image", value: image }],
              createdAt: new Date(Date.now() - index * 60000).toISOString(),
            });
          localStorage.setItem("worthit:local:v1", JSON.stringify(local));
          const social = JSON.parse(
            localStorage.getItem("worthit:social:v1") ||
              '{"profiles":{},"reels":[],"likes":{}}',
          );
          social.profiles[author] = {
            username: "profile_tester",
            displayName: "Profile tester",
            bio: "Outfits and everyday finds.",
            avatar: null,
          };
          for (let index = 0; index < 6; index++)
            social.reels.push({
              id: id("2", index),
              authorId: author,
              caption: "Profile styling reel " + (index + 1),
              poster: image,
              createdAt: new Date(Date.now() - index * 60000).toISOString(),
            });
          localStorage.setItem("worthit:social:v1", JSON.stringify(social));
        }, previewImage);
        await page.goto(base + "/profile");
        await expect(
          page.getByRole("tab", { name: "Polls & posts", exact: true }),
        ).toBeVisible();
        const gallery = page.getByTestId("profile-collection");
        const profilePolls = page.locator(
          '[data-testid^="profile-tile-poll:"]',
        );
        await expect(profilePolls).toHaveCount(7);
        const profileBoxes = await Promise.all(
          [0, 1, 2].map((index) => profilePolls.nth(index).boundingBox()),
        );
        expect(Math.abs(profileBoxes[0].y - profileBoxes[2].y)).toBeLessThan(2);
        expect(profileBoxes[2].x + profileBoxes[2].width).toBeLessThanOrEqual(
          width + 1,
        );
        expect(
          Math.abs(profileBoxes[0].width - profileBoxes[0].height),
        ).toBeLessThan(2);
        await expect
          .poll(() =>
            profilePolls
              .first()
              .locator("img")
              .evaluateAll((images) =>
                images.some(
                  (image) => image.complete && image.naturalWidth > 0,
                ),
              ),
          )
          .toBe(true);
        await page.screenshot({
          path: path.join(shots, width + "-profile-poll-grid.png"),
        });
        await page
          .getByRole("button", { name: "Edit profile", exact: true })
          .click();
        const usernameDraft = page.getByRole("textbox", {
          name: "Username",
          exact: true,
        });
        await usernameDraft.fill("unsaved_profile");
        const originalEditor = await usernameDraft.elementHandle();
        await page
          .getByRole("button", { name: "List view", exact: true })
          .click();
        await expect(
          page.locator('[data-testid^="profile-row-poll:"]'),
        ).toHaveCount(7);
        await expect(usernameDraft).toHaveValue("unsaved_profile");
        expect(await originalEditor.evaluate((node) => node.isConnected)).toBe(
          true,
        );
        await page
          .getByRole("button", { name: "Grid view", exact: true })
          .click();
        await expect(usernameDraft).toHaveValue("unsaved_profile");
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.getByRole("tab", { name: "Checks", exact: true }).click();
        const profileReels = page.locator(
          '[data-testid^="profile-tile-reel:"]',
        );
        await expect(profileReels).toHaveCount(6);
        const profileReelBox = await profileReels.first().boundingBox();
        expect(profileReelBox.height).toBeGreaterThan(
          profileReelBox.width * 1.25,
        );
        await expect
          .poll(() =>
            profileReels
              .first()
              .locator("img")
              .evaluateAll((images) =>
                images.some(
                  (image) => image.complete && image.naturalWidth > 0,
                ),
              ),
          )
          .toBe(true);
        expect(
          await gallery
            .locator("video")
            .evaluateAll((videos) => videos.some((video) => !video.paused)),
        ).toBe(false);
        await page.screenshot({
          path: path.join(shots, width + "-profile-reel-grid.png"),
        });
        await page
          .getByRole("button", { name: "List view", exact: true })
          .click();
        await expect(
          page.locator('[data-testid^="profile-row-reel:"]'),
        ).toHaveCount(6);
        await page.screenshot({
          path: path.join(shots, width + "-profile-reel-list.png"),
        });
        await page
          .locator('[data-testid^="profile-row-reel:"]')
          .first()
          .click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get("mine"))
          .toBe("1");
        await expect(page).toHaveURL(/\/reels\?/);
        await page.goto(base + "/profile");
        await page
          .locator('[data-testid^="profile-tile-poll:"]')
          .first()
          .click();
        await expect(page).toHaveURL(/\/p\/10000000-/);
        await page.goto(base + "/settings/appearance");
        await page.getByRole("radio", { name: "Dark", exact: true }).click();
        await page.goto(base + "/profile");
        await expect
          .poll(() =>
            gallery.evaluate((node) => getComputedStyle(node).backgroundColor),
          )
          .toBe("rgb(0, 0, 0)");
        await page.getByRole("tab", { name: "Checks", exact: true }).click();
        await expect(
          page.locator('[data-testid^="profile-tile-reel:"]'),
        ).toHaveCount(6);
        await expect
          .poll(() =>
            page
              .locator('[data-testid^="profile-tile-reel:"]')
              .first()
              .locator("img")
              .evaluateAll((images) =>
                images.some(
                  (image) => image.complete && image.naturalWidth > 0,
                ),
              ),
          )
          .toBe(true);
        await page.screenshot({
          path: path.join(shots, width + "-profile-dark-grid.png"),
        });

        // Mutations use isolated fixture posts, never a connected account.
        await page.goto(base + "/profile");
        await page
          .getByRole("button", {
            name: "Manage poll: Profile outfit 1",
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(/manage-post/);
        await page
          .getByRole("textbox", { name: "Item name", exact: true })
          .fill("Updated profile outfit");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page).toHaveURL(/\/profile$/);
        await page
          .getByRole("button", {
            name: "Manage poll: Updated profile outfit",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Archive post", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Confirm archive", exact: true })
          .click();
        await expect(page).toHaveURL(/\/profile$/);
        await expect(
          page.getByRole("button", {
            name: "Manage poll: Updated profile outfit",
            exact: true,
          }),
        ).toHaveCount(0);
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Archive", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Manage poll: Updated profile outfit",
            exact: true,
          })
          .click();
        await expect(
          page.getByText("Archived. Only you can see this post.", {
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Restore post", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Confirm restore", exact: true })
          .click();
        await expect(page).toHaveURL(/\/archive$/);
        await page.goto(base + "/profile");
        await page
          .getByRole("button", {
            name: "Manage poll: Updated profile outfit",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Delete post", exact: true })
          .click();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(
          page.getByRole("textbox", { name: "Item name", exact: true }),
        ).toHaveValue("Updated profile outfit");
        await page
          .getByRole("button", { name: "Delete post", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Delete permanently", exact: true })
          .click();
        await expect(page).toHaveURL(/\/profile$/);
        await expect(
          page.getByRole("button", {
            name: "Manage poll: Updated profile outfit",
            exact: true,
          }),
        ).toHaveCount(0);
        await page.getByRole("tab", { name: "Checks", exact: true }).click();
        await page
          .getByRole("button", {
            name: "Manage check: Profile styling reel 1",
            exact: true,
          })
          .click();
        await page
          .getByRole("textbox", { name: "Caption", exact: true })
          .fill("Updated styling reel");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page).toHaveURL(/\/profile$/);
        await page.getByRole("tab", { name: "Checks", exact: true }).click();
        await page
          .getByRole("button", {
            name: "Manage check: Updated styling reel",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Archive post", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Confirm archive", exact: true })
          .click();
        await expect(page).toHaveURL(/\/profile$/);
        await page.goto(base + "/archive");
        await page.getByRole("tab", { name: "Checks", exact: true }).click();
        await page
          .getByRole("button", {
            name: "Manage check: Updated styling reel",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("button", { name: "Restore post", exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(shots, width + "-archived-reel-management.png"),
        });
        await page
          .getByRole("button", { name: "Restore post", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Confirm restore", exact: true })
          .click();
        await expect(page).toHaveURL(/\/archive$/);
        await page.goto(base + "/profile");
        await page.getByRole("tab", { name: "Checks", exact: true }).click();
        await page
          .getByRole("button", {
            name: "Manage check: Updated styling reel",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Delete post", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Delete permanently", exact: true })
          .click();
        await expect(page).toHaveURL(/\/profile$/);
        await page.getByRole("tab", { name: "Checks", exact: true }).click();
        await expect(
          page.locator('[data-testid^="profile-tile-reel:"]'),
        ).toHaveCount(5);

        // Phase 1/2: navigation, settings relocation, gesture exclusion and both creation paths.
        await page.goto(base);
        await expect(
          page.getByRole("button", { name: "Notifications", exact: true }),
        ).toHaveCount(1);
        for (const name of ["Feed", "Spot", "Add", "Checks", "Profile"])
          await expect(
            page.getByRole("button", { name, exact: true }),
          ).toBeVisible();
        const starPhoto = page.locator('[data-testid^="poll-card-"]').first();
        const beforeUrl = page.url(),
          pollKey = (await starPhoto.getAttribute("data-testid")).slice(
            "poll-card-".length,
          );
        const beforeStars = await page.evaluate((id) => {
          const data = JSON.parse(
            localStorage.getItem("worthit:local:v1") || "{}",
          );
          const people = data.stars?.[id] || [];
          return { count: people.length, mine: people.includes(data.me) };
        }, pollKey);
        await starPhoto.dblclick({ delay: 70 });
        await expect
          .poll(() =>
            page.evaluate((id) => {
              const data = JSON.parse(
                localStorage.getItem("worthit:local:v1") || "{}",
              );
              return (data.stars?.[id] || []).length;
            }, pollKey),
          )
          .toBe(beforeStars.count + (beforeStars.mine ? 0 : 1));
        await page.waitForTimeout(350);
        expect(page.url()).toBe(beforeUrl);
        await starPhoto.dblclick({ delay: 70 });
        await page.waitForTimeout(350);
        expect(page.url()).toBe(beforeUrl);
        expect(
          await page.evaluate((id) => {
            const data = JSON.parse(
              localStorage.getItem("worthit:local:v1") || "{}",
            );
            return (data.stars?.[id] || []).length;
          }, pollKey),
        ).toBe(beforeStars.count + (beforeStars.mine ? 0 : 1));
        await starPhoto.click();
        await expect(page).toHaveURL(/\/p\//);
        await expect(
          page.getByRole("button", { name: "Notifications", exact: true }),
        ).toHaveCount(0);
        await page.goto(base + "/profile");
        await expect(
          page.getByRole("button", { name: "Settings", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Archive", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Follow requests", exact: true }),
        ).toHaveCount(0);
        await page
          .getByRole("button", { name: "View followers", exact: true })
          .click();
        await expect(
          page.getByText("No followers yet.", { exact: true }),
        ).toBeVisible();
        await page.goto(base + "/profile");
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Archive", exact: true }),
        ).toBeVisible();
        await page.goto(base);
        await page.getByRole("button", { name: "Add", exact: true }).click();
        await page.getByRole("button", { name: "Poll", exact: true }).click();
        await expect(page).toHaveURL(/\/new$/);
        await expect(
          page.getByRole("textbox", {
            name: "Product link (optional)",
            exact: true,
          }),
        ).toBeVisible();
        await require("./creation-flows.cjs").verifyCreation({
          page,
          base,
          project,
          shots,
          width,
          expect,
        });
        await require("./appearance-flows.cjs").verifyAppearance({
          page,
          base,
          shots,
          width,
          expect,
        });
        await require("./touch-star-flows.cjs").verifyTouchStars({
          page,
          base,
          project,
          width,
          expect,
        });
        await require("./navigation-flows.cjs").verifyFloatingNavigation({
          page,
          base,
          shots,
          width,
          expect,
        });
        expect(errors).toEqual([]);
        console.log(
          width +
            "px: feed/grid, full-height reel paging, playback handoff, comment sheet, resize, sample preferences, light/dark appearance, and profile grid/list views passed.",
        );
      } catch (error) {
        await page.screenshot({
          path: path.join(shots, width + "-failure.png"),
        });
        console.error((await page.locator("body").innerText()).slice(-1500));
        console.error(
          await page.getByTestId("comments-list").evaluateAll((nodes) =>
            nodes.map((node) => ({
              top: node.scrollTop,
              content: node.scrollHeight,
              viewport: node.clientHeight,
            })),
          ),
        );
        throw error;
      }
      await context.close();
    }
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
