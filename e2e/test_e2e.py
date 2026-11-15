"""
End-to-end test of ContentPilot's Phase 1 workflow in real Chrome (this-device mode, no AI key).
Run:  npm run build && python3 -m http.server 4173 -d out &  python3 e2e/test_e2e.py
Media: set CP_MEDIA to a folder with keychain.jpg, clip-vertical.mp4, clip-horizontal.mov, fake.jpg
"""
import json, os, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("CP_BASE", "http://localhost:4173")
MEDIA = Path(os.environ.get("CP_MEDIA", "/home/claude/testmedia"))
SHOTS = Path(__file__).parent / "shots"
SHOTS.mkdir(exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))

def no_h_overflow(page, width=None):
    # On mobile, Chrome zooms out to fit overflowing content, which also widens innerWidth,
    # so compare against the real viewport width as well.
    w = width or page.viewport_size["width"]
    return page.evaluate(f"document.documentElement.scrollWidth <= {w} + 1 && window.innerWidth <= {w} + 1")

def overflow_report(page):
    w = page.viewport_size["width"]
    return page.evaluate(f"""() => [...document.querySelectorAll('main *')].filter(e => {{ const r = e.getBoundingClientRect(); return r.width > 0 && r.right > {w} + 1; }})
      .slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 50) + ' «' + (e.textContent || '').slice(0, 30) + '»')""")

def generate_and_wait(page):
    page.get_by_test_id("generate").click()
    page.wait_for_selector('[data-testid="busy"]', state="detached", timeout=60000)
    page.wait_for_timeout(400)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    # ---------- iPhone-size phone ----------
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              accept_downloads=True, permissions=["clipboard-read", "clipboard-write"], timezone_id="America/Los_Angeles")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/")
    page.get_by_test_id("onboard-done").click()
    expect(page.get_by_test_id("create-cta")).to_have_text(re.compile("CREATE MY NEXT POST"))
    page.screenshot(path=SHOTS / "01-dashboard-mobile.png", full_page=True)
    check("dashboard has primary CTA and no horizontal overflow", no_h_overflow(page), str(overflow_report(page)))

    # invalid file is rejected with an actionable message
    page.goto(BASE + "/create/?mode=one-photo")
    page.get_by_test_id("file-input").set_input_files(str(MEDIA / "fake.jpg"))
    page.wait_for_selector("text=isn't a supported photo or video", timeout=10000)
    check("renamed non-image file rejected with clear error", True)

    # ---------- single picture → photo post ----------
    page.goto(BASE + "/create/?mode=one-photo")
    page.get_by_test_id("file-input").set_input_files(str(MEDIA / "keychain.jpg"))
    page.get_by_test_id("continue").click(timeout=20000)
    page.wait_for_url(re.compile(r"/workspace/\?id="))
    project_url = page.url
    expect(page.get_by_text("How do you want to use this picture?")).to_be_visible()
    check("single picture shows 6 choices", page.locator('[role="radio"][data-testid^="pic-"]').count() == 6)
    check("generate disabled until a picture use is chosen", page.get_by_test_id("generate").is_disabled())
    page.get_by_test_id("pic-photo").click()
    page.get_by_test_id("idea").fill("personalized acrylic photo keychain with a name, for bridal party gifts")
    page.screenshot(path=SHOTS / "02-single-picture-choice.png", full_page=True)
    generate_and_wait(page)
    page.get_by_test_id("wtab-script").click()
    caps = [page.get_by_test_id(f"photo-caption-{i}").input_value() for i in range(3)]
    check("photo post has 3 caption alternatives", all(len(c) > 20 for c in caps), str(caps))
    check("alt text present", len(page.get_by_test_id("alt-text").input_value()) > 10)
    check("photo stays a photo (no script segments)", page.get_by_test_id("segment").count() == 0)
    page.screenshot(path=SHOTS / "03-photo-post-script-tab.png", full_page=True)

    page.get_by_test_id("wtab-post").click()
    capt = {}
    for pl in ["tiktok", "instagram", "facebook"]:
        page.get_by_test_id(f"tab-{pl}").click()
        capt[pl] = page.get_by_test_id(f"caption-{pl}").input_value()
    check("three platform captions are distinct", len(set(capt.values())) == 3)
    check("captions contain no invented prices/discounts", not any(re.search(r"\$\d|% off|only \d+ left", c, re.I) for c in capt.values()))
    page.get_by_test_id("tab-tiktok").click()
    page.get_by_test_id("copy-caption-tiktok").click()
    clip = page.evaluate("navigator.clipboard.readText()")
    check("copy button copies the TikTok caption + hashtags", clip.startswith(capt["tiktok"][:40]) and "#" in clip, clip[:80])
    page.screenshot(path=SHOTS / "04-packages-mobile.png", full_page=True)
    check("packages tab fits the phone screen", no_h_overflow(page), str(overflow_report(page)))

    # edit Instagram caption, then rewrite hooks → caption must survive
    page.get_by_test_id("tab-instagram").click()
    page.get_by_test_id("caption-instagram").fill("MY OWN APPROVED CAPTION")
    page.wait_for_timeout(900)
    page.get_by_test_id("wtab-script").click()
    hook_before = page.get_by_test_id("hook-0").input_value()
    for _ in range(4):
        page.get_by_test_id("rewrite-hook").click()
        page.wait_for_selector('[data-testid="busy"]', state="detached", timeout=30000)
        if page.get_by_test_id("hook-0").input_value() != hook_before: break
    page.get_by_test_id("wtab-post").click()
    page.get_by_test_id("tab-instagram").click()
    check("regenerating hooks preserves the edited caption", page.get_by_test_id("caption-instagram").input_value() == "MY OWN APPROVED CAPTION")

    # persistence across refresh
    page.reload()
    page.get_by_test_id("wtab-post").click()
    page.get_by_test_id("tab-instagram").click()
    check("draft persists after refresh", page.get_by_test_id("caption-instagram").input_value() == "MY OWN APPROVED CAPTION")

    # export
    with page.expect_download() as dl:
        page.get_by_test_id("export-md").click()
    md = Path(dl.value.path()).read_text()
    check("content plan export is a real file with all platforms", all(x in md for x in ["## TikTok", "## Instagram", "## Facebook", "MY OWN APPROVED CAPTION"]))

    # cover PNG export
    page.get_by_test_id("open-cover").click()
    page.wait_for_timeout(1500)
    with page.expect_download() as dl:
        page.get_by_test_id("export-cover").click()
    png = Path(dl.value.path()).read_bytes()
    check("cover export is a real PNG", png[:8] == b"\x89PNG\r\n\x1a\n" and len(png) > 50000, f"{len(png)} bytes")
    page.keyboard.press("Escape")

    # ---------- multiple clips → video script ----------
    page.goto(BASE + "/create/?mode=clips")
    page.get_by_test_id("file-input").set_input_files([str(MEDIA / "clip-vertical.mp4"), str(MEDIA / "clip-horizontal.mov")])
    page.get_by_test_id("continue").click(timeout=60000)
    page.wait_for_url(re.compile(r"/workspace/\?id="))
    page.get_by_test_id("idea").fill("unboxing my new xTool UV printer and the first custom keychain")
    generate_and_wait(page)
    page.get_by_test_id("wtab-script").click()
    segs = page.get_by_test_id("seg-spoken")
    spoken = [segs.nth(i).input_value() for i in range(segs.count())]
    check("video script has complete spoken lines", len(spoken) >= 3 and all(len(s.split()) >= 3 for s in spoken), str(spoken))
    est = float(page.get_by_test_id("estimate").inner_text().rstrip("s"))
    tgt = int(page.get_by_test_id("target").input_value())
    check("estimated duration fits the target", est <= tgt + 0.3, f"{est} vs {tgt}")
    body = page.inner_text("body")
    stamps = re.findall(r"Clip (\d) at (\d+(?:\.\d)?)s", body)
    frames = page.evaluate("""async () => {
      const req = indexedDB.open('contentpilot'); await new Promise(r => req.onsuccess = r);
      const db = req.result; const tx = db.transaction('media'); const st = tx.objectStore('media');
      const all = await new Promise(r => { const q = st.getAll(); q.onsuccess = () => r(q.result); });
      return all.filter(a => a.kind === 'video').map(a => ({ name: a.name, frames: (a.tech.frames||[]).map(f => f.t), dur: a.tech.durationSec }));
    }""")
    real = set()
    for i, f in enumerate(sorted(frames, key=lambda x: x["name"] != "clip-vertical.mp4")):
        for t in f["frames"]: real.add((str(i + 1), t))
    bad = [s for s in stamps if (s[0], float(s[1])) not in real]
    check("every timestamp shown is a real extracted frame", not bad, f"unknown: {bad}; real: {sorted(real)}")
    check("video durations measured", any(abs(f["dur"] - 14) < 0.5 for f in frames) and any(abs(f["dur"] - 9) < 0.5 for f in frames), str(frames))
    check("horizontal clip flagged for 9:16 crop", "horizontal" in body.lower() and "9:16" in body)
    page.screenshot(path=SHOTS / "05-video-script-mobile.png", full_page=True)

    # rewrite: shorter
    before = est
    page.get_by_test_id("rw-shorter").click()
    try:
        page.wait_for_function(f"() => parseFloat(document.querySelector('[data-testid=estimate]').textContent) < {before}", timeout=15000)
    except Exception:
        pass
    after = float(page.get_by_test_id("estimate").inner_text().rstrip("s"))
    check("Make shorter reduces the estimated length", after < before, f"{before} → {after}")

    # teleprompter
    page.get_by_test_id("open-teleprompter").click()
    check("teleprompter shows the spoken script", len(page.get_by_test_id("prompter-text").inner_text()) > 30)
    page.screenshot(path=SHOTS / "06-teleprompter.png")
    page.get_by_role("button", name="Done").click()

    # SRT export
    page.get_by_test_id("wtab-post").click()
    with page.expect_download() as dl:
        page.get_by_test_id("export-srt").click()
    srt = Path(dl.value.path()).read_text()
    check("SRT export is valid", re.match(r"1\n00:00:00,000 --> 00:00:0\d,\d{3}\n", srt) is not None, srt[:80])

    # best time page: LA clock with PST
    page.goto(BASE + "/best-time/")
    check("Los Angeles clock shows PST in November", "PST" in page.get_by_test_id("clock").inner_text())
    check("post-right-now gives a recommendation", len(page.get_by_test_id("post-now-headline").inner_text()) > 10)
    check("posting windows show exact dates", re.search(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun), Nov \d+, \d+:\d\d\s?[AP]M PST", page.inner_text("body")) is not None)
    page.screenshot(path=SHOTS / "07-best-time-mobile.png", full_page=True)

    check("no uncaught page errors on phone", not errors, "; ".join(errors[:3]))

    # ---------- narrow fold cover screen + desktop ----------
    for name, vp in [("fold-cover-344", {"width": 344, "height": 882}), ("fold-open-884", {"width": 884, "height": 1104}), ("desktop-1440", {"width": 1440, "height": 900})]:
        page.set_viewport_size(vp)
        for path in ["/", project_url.replace(BASE, ""), "/brand/", "/settings/", "/best-time/", "/create/", "/library/", "/trending/"]:
            page.goto(BASE + path)
            page.wait_for_timeout(500)
            tabs = ["setup", "script", "post", "review"] if "workspace" in path and vp["width"] < 1280 else [None]
            for t in tabs:
                if t: page.get_by_test_id(f"wtab-{t}").click(); page.wait_for_timeout(200)
                ok = no_h_overflow(page)
                if not ok: check(f"{name} {path} {t or ''} has no horizontal overflow", ok, str(overflow_report(page)))
        page.goto(project_url)
        page.wait_for_timeout(800)
        page.screenshot(path=SHOTS / f"08-workspace-{name}.png", full_page=False)
    check("narrow, foldable and desktop layouts have no horizontal overflow", all(r[1] for r in results if "horizontal overflow" in r[0]))

    # ---------- delete everything ----------
    page.goto(BASE + "/settings/")
    page.once("dialog", lambda d: d.accept())
    page.get_by_test_id("delete-all").click()
    page.wait_for_timeout(1500)
    left = page.evaluate("""async () => { const req = indexedDB.open('contentpilot'); await new Promise(r => req.onsuccess = r);
      const db = req.result; const c = s => new Promise(r => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => r(q.result); });
      return { projects: await c('projects'), media: await c('media'), blobs: await c('blobs') }; }""")
    check("delete all removes projects, media and files", left == {"projects": 0, "media": 0, "blobs": 0}, str(left))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
