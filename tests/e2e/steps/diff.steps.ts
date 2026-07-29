import { Given, When, Then } from "../../_testkit/e2e/bdd/bdd-fixtures";
import { expect } from "@playwright/test";

const openChat = async (page: any) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const { callJsonApi } = await import("/js/api.js");
    const r = await callJsonApi("/chat_create", {});
    const id = (r && (r.ctxid || r.context)) || "";
    if (id) (globalThis as any).setContext(id);
  });
  await page.waitForTimeout(9000); // let the sidebar-end extension's CDN import + observer install
};

// A complete git-style unified diff (diff2html needs the diff --git / index headers to render).
const DIFF = "diff --git a/greeting.txt b/greeting.txt\nindex 1111111..2222222 100644\n--- a/greeting.txt\n+++ b/greeting.txt\n@@ -1,2 +1,2 @@\n-hello world\n+hello there\n goodbye\n";
const postDiff = (page: any) =>
  page.evaluate((c: string) => {
    const wrap = document.createElement("div");
    wrap.className = "markdown-block-wrap dv-fixture";
    const cbw = document.createElement("div"); cbw.className = "code-block-wrapper";
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.className = "language-diff";
    codeEl.textContent = c;
    pre.appendChild(codeEl); cbw.appendChild(pre); wrap.appendChild(cbw);
    (document.querySelector("#chat-history") || document.body).appendChild(wrap);
  }, DIFF);

Given("I am in a chat", async ({ loggedInPage }: any) => { await openChat(loggedInPage); });
When("a unified diff is posted in the chat", async ({ loggedInPage }: any) => { await postDiff(loggedInPage); });

Then("it is rendered as a visual diff", async ({ loggedInPage }: any) => {
  // The plugin replaces the raw code block with a diff2html render (.d2h-wrapper).
  await expect(loggedInPage.locator(".d2h-wrapper").first()).toBeVisible({ timeout: 30000 });
});

Then("the rendered diff has a maximize and a copy control", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".diff-visualizer-toolbar").first()).toBeVisible({ timeout: 30000 });
  expect(await loggedInPage.locator(".diff-copy-source").count()).toBeGreaterThan(0);
});

// ── Interaction + edge-case steps (20-diff-interactions.feature) ─────────────

// A two-file git-style diff (auth.py + util.py) for the multi-file scenario.
const MULTI_FILE_DIFF =
  "diff --git a/src/auth.py b/src/auth.py\nindex 1111111..2222222 100644\n--- a/src/auth.py\n+++ b/src/auth.py\n@@ -1,2 +1,3 @@\n def login(user):\n+    log(user)\n     return check(user)\ndiff --git a/src/util.py b/src/util.py\nindex 3333333..4444444 100644\n--- a/src/util.py\n+++ b/src/util.py\n@@ -1,1 +1,1 @@\n-def log(msg): pass\n+def log(msg): print(msg)\n";

const postBlock = (page: any, text: string, lang: string) =>
  page.evaluate(({ c, l }: any) => {
    const wrap = document.createElement("div");
    wrap.className = "markdown-block-wrap dv-fixture";
    const cbw = document.createElement("div"); cbw.className = "code-block-wrapper";
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.className = l;
    codeEl.textContent = c;
    pre.appendChild(codeEl); cbw.appendChild(pre); wrap.appendChild(cbw);
    (document.querySelector("#chat-history") || document.body).appendChild(wrap);
  }, { c: text, l: lang });

When("I maximize the rendered diff", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".diff-maximize").first()).toBeVisible({ timeout: 30000 });
  await loggedInPage.locator(".diff-maximize").first().click();
});

Then("a fullscreen diff overlay is shown with the rendered diff", async ({ loggedInPage }: any) => {
  const overlay = loggedInPage.locator(".diff-visualizer-overlay");
  await expect(overlay).toHaveCount(1, { timeout: 15000 });
  await expect(overlay.locator(".d2h-wrapper").first()).toBeVisible({ timeout: 15000 });
  await expect(overlay.locator(".diff-overlay-close")).toBeVisible();
});

When("I close the overlay with its close button", async ({ loggedInPage }: any) => {
  await loggedInPage.locator(".diff-overlay-close").click();
});

When("I click the overlay backdrop", async ({ loggedInPage }: any) => {
  // The close handler keys on e.target === overlay; a bubbling click dispatched
  // on the overlay element itself exercises exactly that branch (padding-free).
  await loggedInPage.evaluate(() => {
    const ov = document.querySelector(".diff-visualizer-overlay");
    if (ov) ov.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
});

When("I press the Escape key", async ({ loggedInPage }: any) => {
  await loggedInPage.keyboard.press("Escape");
});

Then("the overlay is gone and the inline diff is still rendered", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".diff-visualizer-overlay")).toHaveCount(0, { timeout: 15000 });
  await expect(loggedInPage.locator(".diff-visualizer-container").first()).toBeVisible();
  await expect(loggedInPage.locator(".diff-visualizer-container .d2h-wrapper").first()).toBeVisible();
});

When("I copy the rendered diff", async ({ loggedInPage }: any) => {
  // Instrument clipboard BEFORE the click: capture what the plugin writes
  // (no clipboard-read permission needed in the harness browser).
  await loggedInPage.evaluate(() => {
    (globalThis as any).__dvCopied = null;
    // Pure capture stub: record what the plugin writes and resolve. We assert
    // on the captured value, so the real OS clipboard is not involved at all.
    (navigator.clipboard as any).writeText = (t: string) => {
      (globalThis as any).__dvCopied = t;
      return Promise.resolve();
    };
  });
  await loggedInPage.locator(".diff-visualizer-container .diff-copy-source").first().click();
});

Then("the clipboard holds the raw unified diff text", async ({ loggedInPage }: any) => {
  await expect
    .poll(async () => loggedInPage.evaluate(() => (globalThis as any).__dvCopied), { timeout: 10000 })
    .toContain("+hello there");
  const copied = await loggedInPage.evaluate(() => (globalThis as any).__dvCopied);
  expect(copied).not.toContain("d2h"); // raw source, not rendered HTML
});

When("a multi-file unified diff is posted in the chat", async ({ loggedInPage }: any) => {
  await postBlock(loggedInPage, MULTI_FILE_DIFF, "language-diff");
});

Then("one visual diff shows both files", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".diff-visualizer-container")).toHaveCount(1, { timeout: 30000 });
  await expect(loggedInPage.locator(".diff-visualizer-container .d2h-file-wrapper")).toHaveCount(2, { timeout: 15000 });
  const names = await loggedInPage.locator(".diff-visualizer-container .d2h-file-name").allTextContents();
  expect(names.join(" ")).toContain("auth.py");
  expect(names.join(" ")).toContain("util.py");
});

When("a valid and a malformed diff block are posted in the chat", async ({ loggedInPage }: any) => {
  // Positive anchor first: the valid diff MUST render (fails seam-off), which
  // also proves the observer is live before we judge the malformed block.
  await postDiff(loggedInPage);
  await postBlock(loggedInPage, "this is not a unified diff at all\njust some plain text lines\n", "language-diff");
});

Then("only the valid diff renders visually and the malformed block stays readable plain code", async ({ loggedInPage }: any) => {
  // The valid diff renders — positive plugin evidence (red seam-off).
  await expect(loggedInPage.locator(".diff-visualizer-container")).toHaveCount(1, { timeout: 30000 });
  // Give the observer + debounce ample time to (not) act on the malformed one.
  await loggedInPage.waitForTimeout(5000);
  await expect(loggedInPage.locator(".diff-visualizer-container")).toHaveCount(1);
  const raw = loggedInPage.locator(".dv-fixture pre > code.language-diff");
  await expect(raw.first()).toBeVisible();
  await expect(raw.first()).toContainText("not a unified diff");
});

When("a valid diff and a non-diff code block are posted in the chat", async ({ loggedInPage }: any) => {
  await postDiff(loggedInPage);
  await postBlock(loggedInPage, DIFF, "language-python");
});

Then("only the diff block renders visually and the non-diff block is untouched", async ({ loggedInPage }: any) => {
  // The language-diff block renders — positive plugin evidence (red seam-off).
  await expect(loggedInPage.locator(".diff-visualizer-container")).toHaveCount(1, { timeout: 30000 });
  await loggedInPage.waitForTimeout(5000);
  // Selector keys strictly on code.language-diff; the python block is untouched.
  await expect(loggedInPage.locator(".diff-visualizer-container")).toHaveCount(1);
  await expect(loggedInPage.locator(".dv-fixture pre > code.language-python").first()).toBeVisible();
});
