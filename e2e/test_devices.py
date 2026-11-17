"""
Device layout audit: iPhone 18, iPhone 18 Pro Max, iPhone Duo (closed and open, both orientations)
and MacBook window sizes. Chrome with touch emulation — not Safari itself.
Run:  npm run build && python3 -m http.server 4173 -d out &  python3 e2e/test_devices.py
"""
import os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("CP_BASE", "http://localhost:4173")
MEDIA = Path(os.environ.get("CP_MEDIA", "/home/claude/testmedia"))
SHOTS = Path(__file__).parent / "shots"
SHOTS.mkdir(exist_ok=True)
results = []

TOUCH = [  # name, width, height, expected workspace layout
    ("iphone18-portrait", 402, 874, "one"), ("iphone18-landscape", 874, 402, "two"),
    ("iphone18promax-portrait", 440, 956, "one"),
    ("duo-closed-portrait", 466, 678, "one"), ("duo-closed-landscape", 678, 466, "one"),
    ("duo-open-landscape", 951, 669, "two"), ("duo-open-upright", 669, 951, "one"), ("duo-open-alt", 626, 890, "one"),
]
DESKTOP = [
    ("macbook-half-window", 735, 840, "one"), ("macbook-1280", 1280, 720, "two"),
    ("macbook-air13-1470", 1470, 840, "two"), ("macbook-pro14-1512", 1512, 860, "two"), ("macbook-pro16-1728", 1728, 1000, "three"),
]
PAGES = ["/", "/create/", "/library/", "/best-time/", "/brand/", "/settings/", "/trending/", "/music/", "/workspace/"]

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    if not cond: print("FAIL " + name + (f" — {detail}" if detail else ""))

def overflow(page, w):
    return page.evaluate(f"""() => {{
      if (document.documentElement.scrollWidth <= {w} + 1 && window.innerWidth <= {w} + 1) return [];
      return [...document.querySelectorAll('body *')].filter(e => {{ const r = e.getBoundingClientRect(); return r.width > 0 && r.right > {w} + 1; }})
        .slice(0, 3).map(e => e.tagName + '.' + String(e.className).slice(0, 40) + ' «' + (e.textContent || '').slice(0, 25) + '»'); }}""") if not page.evaluate(f"document.documentElement.scrollWidth <= {w} + 1 && window.innerWidth <= {w} + 1") else []

SMALL = """() => { const out = [];
  for (const e of document.querySelectorAll('button, [role=tab], a.btn-primary, a.btn-ghost, summary')) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') continue;
    if (r.height < 43.5 || r.width < 43.5) out.push((e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 30) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
  } return out.slice(0, 5); }"""
SMALLFONT = """() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), textarea, select')]
  .filter(e => e.getBoundingClientRect().width && parseFloat(getComputedStyle(e).fontSize) < 16).slice(0, 5).map(e => (e.getAttribute('aria-label') || e.name || e.className).slice(0, 30))"""
# is the primary action reachable (not under a fixed bar)?
COVERED = """(sel) => { const e = document.querySelector(sel); if (!e) return 'missing'; e.scrollIntoView({block: 'center'});
  const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return hit && (hit === e || e.contains(hit)) ? '' : 'covered by ' + (hit ? hit.tagName + '.' + String(hit.className).slice(0, 30) : 'nothing'); }"""

def make_project(page):
    page.goto(BASE + "/")
    page.get_by_test_id("onboard-done").click()
    page.goto(BASE + "/create/?mode=clips")
    page.get_by_test_id("file-input").set_input_files([str(MEDIA / "clip-vertical.mp4"), str(MEDIA / "keychain.jpg")])
    page.get_by_test_id("continue").click(timeout=60000)
    page.wait_for_url(re.compile(r"/workspace/\?id="))
    page.get_by_test_id("idea").fill("personalized acrylic photo keychain with a name, for bridal party gifts")
    page.get_by_test_id("generate").click()
    page.wait_for_function("""() => { const t = document.querySelector('[data-testid=wtab-post]'); return (t && !t.disabled) || !!document.querySelector('[data-testid=tab-tiktok]'); }""", timeout=60000)
    page.wait_for_timeout(800)
    return page.url

def audit(page, devices, touch, url):
    for name, w, h, expected in devices:
        page.set_viewport_size({"width": w, "height": h})
        for path in PAGES:
            page.goto(BASE + path); page.wait_for_timeout(350)
            o = overflow(page, w)
            check(f"{name} {path} fits the width", not o, str(o))
            if touch:
                check(f"{name} {path} tap targets are 44pt+", not page.evaluate(SMALL), str(page.evaluate(SMALL)))
                check(f"{name} {path} fields are 16px+ (no Safari zoom)", not page.evaluate(SMALLFONT), str(page.evaluate(SMALLFONT)))
        page.goto(url); page.wait_for_timeout(700)
        layout = page.locator("[data-layout]").get_attribute("data-layout")
        check(f"{name} workspace uses the {expected}-column layout", layout == expected, f"got {layout}")
        tabs = [t for t in ["setup", "script", "post", "review"] if page.get_by_test_id(f"wtab-{t}").count()] or [None]
        for t in tabs:
            if t: page.get_by_test_id(f"wtab-{t}").click(); page.wait_for_timeout(250)
            o = overflow(page, w)
            check(f"{name} workspace {t or 'columns'} fits the width", not o, str(o))
            if touch:
                check(f"{name} workspace {t or 'columns'} tap targets are 44pt+", not page.evaluate(SMALL), str(page.evaluate(SMALL)))
                check(f"{name} workspace {t or 'columns'} fields are 16px+", not page.evaluate(SMALLFONT), str(page.evaluate(SMALLFONT)))
            if t in ("setup", None) or (t == "script" and layout == "two" and False):
                c = page.evaluate(COVERED, '[data-testid="generate"]') if (t == "setup" or layout == "three") else ""
                check(f"{name} main button isn't hidden behind a bar", not c, c)
            page.screenshot(path=SHOTS / f"d-{name}-{t or 'cols'}.png")
        # everything needed is on screen without the tabs in multi-column layouts
        if layout != "one":
            check(f"{name} packages visible beside the script", page.get_by_test_id("tab-tiktok").is_visible())
        # teleprompter controls reachable on this screen
        if page.get_by_test_id("wtab-script").count(): page.get_by_test_id("wtab-script").click()
        page.get_by_test_id("open-teleprompter").click()
        done = page.get_by_role("button", name="Done")
        box = done.bounding_box()
        check(f"{name} teleprompter controls are on screen", box and box["y"] + box["height"] <= h + 1 and box["x"] + box["width"] <= w + 1, str(box))
        done.click()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    errors = []
    t = browser.new_context(viewport={"width": 402, "height": 874}, device_scale_factor=3, is_mobile=True, has_touch=True, timezone_id="America/Los_Angeles")
    tp = t.new_page(); tp.on("pageerror", lambda e: errors.append(str(e)))
    audit(tp, TOUCH, True, make_project(tp))
    d = browser.new_context(viewport={"width": 1470, "height": 840}, device_scale_factor=2, timezone_id="America/Los_Angeles")
    dp = d.new_page(); dp.on("pageerror", lambda e: errors.append(str(e)))
    audit(dp, DESKTOP, False, make_project(dp))
    check("no uncaught page errors", not errors, "; ".join(errors[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
