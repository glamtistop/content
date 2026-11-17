"""
End-to-end test of ContentPilot's evolving memory (feature 5) in real Chrome, this-device mode.
Run:  npm run build && python3 -m http.server 4173 -d out &  python3 e2e/test_memory.py
"""
import os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("CP_BASE", "http://localhost:4173")
MEDIA = Path(os.environ.get("CP_MEDIA", "/home/claude/testmedia"))
SHOTS = Path(__file__).parent / "shots"
SHOTS.mkdir(exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))

def idle(page):
    page.wait_for_selector('[data-testid="busy"]', state="detached", timeout=60000)
    page.wait_for_timeout(300)

def db_count(page, store):
    return page.evaluate(f"""async () => {{ const req = indexedDB.open('contentpilot'); await new Promise(r => req.onsuccess = r);
      const db = req.result; return await new Promise(r => {{ const q = db.transaction('{store}').objectStore('{store}').count(); q.onsuccess = () => r(q.result); }}); }}""")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, timezone_id="America/Los_Angeles")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/")
    page.get_by_test_id("onboard-done").click()

    # a picture post to work on
    page.goto(BASE + "/create/?mode=one-photo")
    page.get_by_test_id("file-input").set_input_files(str(MEDIA / "keychain.jpg"))
    page.get_by_test_id("continue").click(timeout=20000)
    page.wait_for_url(re.compile(r"/workspace/\?id="))
    project_url = page.url
    page.get_by_test_id("pic-photo").click()
    page.get_by_test_id("idea").fill("personalized acrylic photo keychain with a name, for bridal party gifts")
    page.get_by_test_id("generate").click()
    idle(page)
    page.get_by_test_id("wtab-script").click()

    # reject a hook: it is swapped right away and the reason bar appears
    rejected = page.get_by_test_id("hook-1").input_value()
    page.get_by_test_id("reject-hook-1").click()
    page.wait_for_function(f"() => document.querySelector('[data-testid=hook-1]').value !== {rejected!r}", timeout=10000)
    swapped = page.get_by_test_id("hook-1").input_value()
    check("rejected hook is swapped for a different one", swapped and swapped != rejected, swapped)
    expect(page.get_by_test_id("reason-bar")).to_contain_text("Why not this hook?")
    page.screenshot(path=SHOTS / "m1-reason-bar.png", full_page=True)
    page.get_by_test_id("reason-cringe").click()
    check("picking a reason closes the reason bar", page.get_by_test_id("reason-bar").count() == 0)

    # regenerating one section asks a clear question too
    page.get_by_test_id("rewrite-hook").click()
    idle(page)
    expect(page.get_by_test_id("reason-bar")).to_contain_text("Why replace the hooks?")
    check("section regenerate asks a clear question", True)
    page.get_by_test_id("reason-skip").click()
    hooks_now = [page.get_by_test_id(f"hook-{i}").input_value() for i in range(3)]
    check("rewriting hooks doesn't bring the rejected one back", rejected not in hooks_now, str(hooks_now))

    # an edit is recorded after a short pause
    page.get_by_test_id("wtab-post").click()
    page.get_by_test_id("tab-instagram").click()
    page.get_by_test_id("caption-instagram").fill("Custom photo keychains for your bridal party. DM me to order.")
    page.wait_for_timeout(3500)
    check("edits and the rejection are saved as decisions", db_count(page, "decisions") >= 2, str(db_count(page, "decisions")))

    # regenerate everything: the rejected hook never comes back
    page.get_by_test_id("wtab-setup").click()
    for _ in range(3):
        page.get_by_test_id("generate").click()
        idle(page)
        if page.get_by_test_id("reason-bar").count():
            page.get_by_test_id("reason-skip").click()
        page.get_by_test_id("wtab-script").click()
        hooks = [page.get_by_test_id(f"hook-{i}").input_value() for i in range(3)]
        if rejected in hooks:
            break
        page.get_by_test_id("wtab-setup").click()
    check("the rejected hook never returns after regenerating", rejected not in hooks, str(hooks))

    # it survives a reload
    page.reload()
    page.get_by_test_id("wtab-script").click()
    hooks = [page.get_by_test_id(f"hook-{i}").input_value() for i in range(3)]
    check("still avoided after reloading", rejected not in hooks)

    # the panel shows what was learned, and the user can switch it off and reset
    page.goto(BASE + "/brand/")
    panel = page.get_by_test_id("memory-panel")
    expect(panel).to_be_visible()
    rule = page.get_by_test_id("rule-rejected_hook").first
    expect(rule).to_contain_text(rejected)
    expect(rule).to_contain_text("On")
    check("panel lists the rejected hook as an active rule", True)
    check("panel shows the reason as a pattern still being learned", page.get_by_test_id("rule-tone").count() >= 1)
    check("panel counts decisions", int(re.search(r"(\d+) decision", page.get_by_test_id("memory-count").inner_text()).group(1)) >= 3)
    check("memory panel fits a 390 px phone", page.evaluate("document.documentElement.scrollWidth <= 391 && window.innerWidth <= 391"))
    page.screenshot(path=SHOTS / "m2-memory-panel.png", full_page=True)
    rule.get_by_test_id("rule-toggle").click()
    expect(page.get_by_test_id("rule-rejected_hook").first).to_contain_text("Off")
    page.reload()
    expect(page.get_by_test_id("rule-rejected_hook").first).to_contain_text("Off")
    check("switching a rule off sticks after reload", True)
    page.once("dialog", lambda d: d.accept())
    page.get_by_test_id("memory-reset").click()
    expect(page.get_by_test_id("memory-panel")).to_contain_text("Nothing learned yet")
    check("reset forgets everything learned", db_count(page, "decisions") == 0 and db_count(page, "rules") == 0)

    check("no uncaught page errors", not errors, "; ".join(errors[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
