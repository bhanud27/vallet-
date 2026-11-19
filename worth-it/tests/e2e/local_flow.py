"""
End-to-end check of the author -> friend -> author flow in LOCAL DEMO MODE using one browser profile
(the "friend" is simulated with the in-app "Act as a new guest" demo tool).

  npx expo export -p web && npx serve -s dist -l 8081 &
  pip install playwright && python -m playwright install chromium
  python tests/e2e/local_flow.py http://localhost:8081 [screenshot_dir]
"""
import re, sys, pathlib
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8081"
SHOTS = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else None
PHOTO = str(pathlib.Path(__file__).with_name("test-sneaker.jpg"))
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
checks = []

def ok(label):
    checks.append(label); print("  ok  ", label)

def shot(page, name):
    if SHOTS: page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Home: local-mode banner + 3 labelled demo polls
    page.goto(BASE)
    expect(page.get_by_test_id("mode-banner")).to_contain_text("Local demo mode")
    cards = page.locator('[data-testid^="poll-card-"]')
    expect(cards).to_have_count(3)
    expect(page.get_by_text("DEMO", exact=True)).to_have_count(3)
    ok("home shows local-mode banner and 3 demo polls labelled DEMO")
    shot(page, "01-home")

    # 2. Demo poll with purchase update shows the affiliate disclosure
    cards.nth(2).click()
    expect(page.get_by_test_id("demo-banner")).to_be_visible()
    expect(page.get_by_test_id("affiliate-disclosure")).to_contain_text("Affiliate link")
    expect(page.get_by_test_id("paid-line")).to_contain_text("₹5,299")
    ok("demo poll 3 shows 'Bought' update, price paid and affiliate disclosure")
    shot(page, "02-demo-poll-update")

    # 3. Create a poll with defaults + photo
    page.goto(BASE + "/new")
    expect(page.get_by_test_id("price")).to_have_value("2499")
    expect(page.get_by_test_id("question")).to_have_value("Worth it for daily walking?")
    page.get_by_test_id("publish").click()
    expect(page.get_by_text("Add a photo, video, or product link.").first).to_be_visible()
    ok("publishing without a photo shows a clear validation error")
    with page.expect_file_chooser() as fc:
        page.get_by_test_id("pick-photo").click()
    fc.value.set_files(PHOTO)
    expect(page.get_by_label("Selected product photo")).to_be_visible()
    shot(page, "03-new-poll")
    page.get_by_test_id("publish").click()
    page.wait_for_url(re.compile(r"/p/[0-9a-f-]{36}$"))
    poll_url = page.url
    expect(page.get_by_test_id("item-title")).to_have_text("Sneakers")
    expect(page.get_by_test_id("share-url")).to_contain_text("/p/")
    expect(page.get_by_text("Anyone with this link can view the photo").first).to_be_visible()
    expect(page.get_by_test_id("total-votes")).to_have_text("0 votes")
    expect(page.get_by_test_id("submit-vote")).to_have_count(0)
    ok("poll created: photo, price tag, share link, public-visibility warning; author has no vote form")
    page.get_by_test_id("copy-link").click()
    expect(page.get_by_text("Link copied")).to_be_visible()
    clip = page.evaluate("navigator.clipboard.readText()")
    assert clip == poll_url, (clip, poll_url)
    ok("Copy link puts the poll URL on the clipboard")
    expect(page.get_by_test_id("unreachable-note")).to_be_visible()  # localhost warning
    shot(page, "04-author-view")

    # 4. 'Friend' (new guest identity) opens the link, votes
    page.goto(BASE + "/account")
    page.get_by_test_id("act-as-guest").click()
    page.goto(poll_url)
    expect(page.get_by_test_id("item-title")).to_have_text("Sneakers")
    expect(page.get_by_label("Photo of Sneakers")).to_be_visible()
    expect(page.get_by_label("Asking price ₹2,499")).to_be_visible()
    shot(page, "05a-guest-top")
    expect(page.get_by_test_id("share-url")).to_have_count(0)
    expect(page.get_by_test_id("update-form")).to_have_count(0)
    page.get_by_test_id("submit-vote").click()
    expect(page.get_by_test_id("vote-error")).to_contain_text("Pick Buy")
    page.get_by_test_id("vote-wait").click()
    page.get_by_test_id("reason-input").fill("Went on sale for ₹1,999 last month. Wait.")
    page.get_by_test_id("owns-toggle").click()
    shot(page, "05-guest-voting")
    page.get_by_test_id("submit-vote").click()
    expect(page.get_by_test_id("voted-banner")).to_contain_text("Vote submitted")
    expect(page.get_by_test_id("voted-banner")).to_contain_text("Wait for a sale")
    expect(page.get_by_test_id("total-votes")).to_have_text("1 vote")
    expect(page.get_by_test_id("count-wait")).to_contain_text("1 · 100%")
    expect(page.get_by_test_id("reason")).to_contain_text("Went on sale")
    expect(page.get_by_test_id("reason")).to_contain_text("Owns this item")
    expect(page.get_by_test_id("submit-vote")).to_have_count(0)
    ok("guest voted 'Wait for a sale' with reason + 'I own this item'; confirmation and results shown")
    shot(page, "06-guest-after-vote")
    page.reload()
    expect(page.get_by_test_id("voted-banner")).to_be_visible()
    expect(page.get_by_test_id("submit-vote")).to_have_count(0)
    ok("one vote per guest session: after reload the vote form is gone")

    # 5. Guest cannot edit; author sees the vote after refresh
    expect(page.get_by_test_id("status-bought")).to_have_count(0)
    page.goto(BASE + "/account")
    page.get_by_test_id("back-to-me").click()
    page.goto(poll_url)
    page.get_by_test_id("refresh").click()
    expect(page.get_by_test_id("total-votes")).to_have_text("1 vote")
    expect(page.get_by_test_id("reason")).to_contain_text("Went on sale")
    ok("author refreshes and sees the friend's vote and reason")

    # 6. Author posts the purchase update
    page.get_by_test_id("status-bought").click()
    page.get_by_test_id("paid-input").fill("2199")
    page.get_by_test_id("review-input").fill("Comfy for 5 km walks. Sole is firm.")
    page.get_by_test_id("url-input").fill("not a url")
    page.get_by_test_id("save-update").click()
    expect(page.get_by_test_id("update-error")).to_contain_text("http")
    ok("invalid store link rejected with a clear message")
    page.get_by_test_id("url-input").fill("https://example.com/sneakers-demo")
    page.get_by_test_id("affiliate-toggle").click()
    expect(page.get_by_text("Visitors will see this next to your link")).to_be_visible()
    shot(page, "07-update-form")
    page.get_by_test_id("save-update").click()
    expect(page.get_by_test_id("update-card")).to_be_visible()
    expect(page.get_by_test_id("paid-line")).to_contain_text("₹2,199")
    expect(page.get_by_test_id("paid-line")).to_contain_text("₹300 less")
    expect(page.get_by_test_id("review-text")).to_contain_text("Comfy")
    expect(page.get_by_test_id("affiliate-disclosure")).to_be_visible()
    ok("author marked Bought: paid price, review, store link and affiliate disclosure shown")
    shot(page, "08-author-after-update")

    # 7. Visitor sees update, cannot edit
    page.goto(BASE + "/account")
    page.get_by_test_id("act-as-guest").click()
    page.goto(poll_url)
    expect(page.get_by_test_id("update-card")).to_be_visible()
    expect(page.get_by_test_id("paid-line")).to_contain_text("₹2,199")
    expect(page.get_by_test_id("affiliate-disclosure")).to_be_visible()
    expect(page.get_by_test_id("edit-update")).to_have_count(0)
    expect(page.get_by_test_id("update-form")).to_have_count(0)
    expect(page.get_by_test_id("store-link")).to_have_attribute("role", "link")
    ok("visitor sees the purchase update but has no edit controls")
    shot(page, "09-visitor-update")

    # 8. Unknown poll id
    page.goto(BASE + "/p/00000000-0000-4000-8000-00000000ffff")
    expect(page.get_by_text("Poll not found")).to_be_visible()
    ok("unknown poll link shows 'Poll not found'")

    assert not errors, errors
    ok("no uncaught page errors")
    browser.close()

print(f"\n{len(checks)} checks passed")
