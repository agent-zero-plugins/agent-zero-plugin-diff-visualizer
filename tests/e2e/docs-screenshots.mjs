// Docs screenshot capture (NOT a test) — run via the devkit lifecycle harness
// with BEHAVIOUR_FILE pointed here. Renders a realistic diff in a live A0 chat
// with the plugin installed, then saves the inline render and the maximized
// overlay to ARTIFACT_DIR for use in README/docs.
export default async function behaviour({ page, expect, baseURL }) {
  const OUT = process.env.ARTIFACT_DIR || "/artifacts";
  await page.goto(baseURL + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  // Open a REAL chat first (proven sequence from the green BDD steps): with no
  // chat selected, #chat-history is hidden and anything injected inside it
  // reports hidden — observed twice in this harness (EXIT=1 runs).
  await page.evaluate(async () => {
    const { callJsonApi } = await import("/js/api.js");
    const r = await callJsonApi("/chat_create", {});
    const id = (r && (r.ctxid || r.context)) || "";
    if (id) globalThis.setContext(id);
  });
  await page.waitForTimeout(9000); // let the sidebar-end extension's CDN import + observer install

  const DIFF = [
    "diff --git a/src/auth.py b/src/auth.py",
    "index 1111111..2222222 100644",
    "--- a/src/auth.py",
    "+++ b/src/auth.py",
    "@@ -8,6 +8,8 @@ class AuthService:",
    "     def login(self, user, password):",
    "-        session = self.check(user, password)",
    "+        self.audit_log.record(user, action=\"login\")",
    "+        session = self.check(user, password, mfa=True)",
    "         if session is None:",
    "-            raise AuthError(\"denied\")",
    "+            raise AuthError(f\"denied for {user}\")",
    "         return session",
    "diff --git a/src/util.py b/src/util.py",
    "index 3333333..4444444 100644",
    "--- a/src/util.py",
    "+++ b/src/util.py",
    "@@ -1,2 +1,3 @@",
    "-def log(msg): pass",
    "+def log(msg):",
    "+    print(f\"[audit] {msg}\")",
  ].join("\n");

  await page.evaluate((c) => {
    const wrap = document.createElement("div");
    wrap.className = "markdown-block-wrap dv-shot";
    const cbw = document.createElement("div"); cbw.className = "code-block-wrapper";
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.className = "language-diff";
    codeEl.textContent = c;
    pre.appendChild(codeEl); cbw.appendChild(pre); wrap.appendChild(cbw);
    (document.querySelector("#chat-history") || document.body).appendChild(wrap);
  }, DIFF);

  // Wait for END STATE with the selector proven visible in the green BDD runs:
  // the plugin's container (the inner .d2h-file-wrapper can report hidden in
  // this harness even when rendered — observed in run EXIT=1).
  await expect(page.locator(".diff-visualizer-container").first())
    .toBeVisible({ timeout: 60000 });
  // Both files parsed (existence, not visibility).
  await expect(page.locator(".diff-visualizer-container .d2h-file-wrapper"))
    .toHaveCount(2, { timeout: 30000 });
  await page.waitForTimeout(1000); // let CSS/fonts settle

  const container = page.locator(".diff-visualizer-container").first();
  await container.screenshot({ path: `${OUT}/diff-inline.png` });

  // Maximized overlay shot.
  await page.locator(".diff-maximize").first().click();
  await expect(page.locator(".diff-visualizer-overlay").first())
    .toBeVisible({ timeout: 30000 });
  await expect(page.locator(".diff-visualizer-overlay .d2h-file-wrapper"))
    .toHaveCount(2, { timeout: 30000 });
  await page.waitForTimeout(700); // fade-in transition to opacity 1
  await page.screenshot({ path: `${OUT}/diff-maximized.png` });

  console.log("[docs-screenshots] wrote diff-inline.png + diff-maximized.png");
}
