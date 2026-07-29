// Behaviour test (SPEC DEC-056) — agent-zero-plugin-diff-visualizer.
//
// The plugin injects a headless script at the `sidebar-end` extension point.
// It has NO always-visible chrome of its own: a MutationObserver watches the
// chat DOM for unified-diff fenced code blocks (`pre > code.language-diff`,
// the shape A0's markdown renderer emits) and transforms each into a
// `.diff-visualizer-container` whose body holds a diff2html `.d2h-wrapper`.
//
// To exercise that transform deterministically (without depending on the LLM
// emitting a ```diff fence), we inject a code.language-diff block into the live
// page exactly as the markdown renderer would, then assert the plugin's own
// observer rewrites it into the plugin's unique container + toolbar.
export default async function behaviour({ page, expect, baseURL }) {
  await page.goto(baseURL + "/", { waitUntil: "domcontentloaded" });

  // The extension HTML loads client-side via <x-extension> AFTER page load.
  // Wait for the plugin's script to have registered its observer by polling for
  // the function/global it defines on window — but since the script runs in an
  // isolated scope, instead wait for the body to be ready and then drive it via
  // a fixture and assert the OBSERVED side effect (the plugin's transform).
  await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });

  // Give the async <x-extension> loader time to inject + run the plugin script
  // (it attaches a MutationObserver to document.body on load).
  await page.waitForTimeout(2_000);

  const DIFF_SAMPLE = [
    "--- a/hello.txt",
    "+++ b/hello.txt",
    "@@ -1,2 +1,2 @@",
    " context line",
    "-old line",
    "+new line",
  ].join("\n");

  // Inject a block matching what A0's markdown renderer produces for a ```diff
  // fence: a <pre><code class="language-diff"> inside a .markdown-block-wrap.
  // The plugin's MutationObserver fires on this insertion and processes it.
  await page.evaluate((sample) => {
    const wrap = document.createElement("div");
    wrap.className = "markdown-block-wrap a0-diff-behaviour-fixture";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "language-diff";
    code.textContent = sample;
    pre.appendChild(code);
    wrap.appendChild(pre);
    document.body.appendChild(wrap);
  }, DIFF_SAMPLE);

  // 1. The plugin's UNIQUE injected container appears, replacing the raw block.
  //    `.diff-visualizer-container` is a class the plugin's OWN js creates.
  const container = page.locator(".diff-visualizer-container");
  await expect(container).toBeVisible({ timeout: 20_000 });

  // 2. Assert the plugin's toolbar chrome + label it builds inside the container.
  await expect(
    container.locator(".diff-visualizer-toolbar"),
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    container.locator(".diff-visualizer-label", { hasText: "Diff" }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // 3. Assert the rendered diff produced by the plugin's renderHtml() — a
  //    diff2html `.d2h-wrapper` — is present inside the plugin's container.
  //    (The plugin only swaps in the container when render yields a d2h-wrapper.)
  await expect(
    container.locator(".d2h-wrapper").first(),
  ).toBeVisible({ timeout: 20_000 });

  // 4. Assert the side-by-side output format the plugin requests from diff2html
  //    (renderHtml passes outputFormat: 'side-by-side'). diff2html emits a
  //    `.d2h-file-side-diff` element ONLY in side-by-side mode, so its presence
  //    proves the plugin's specific render options took effect (not just any
  //    diff2html render). Two sides for the one file in DIFF_SAMPLE.
  await expect(
    container.locator(".d2h-file-side-diff").first(),
  ).toBeVisible({ timeout: 20_000 });

  // 5. Assert the toolbar's action buttons the plugin builds: a copy-raw-diff
  //    button and a Maximize button. These are plugin-specific chrome, distinct
  //    from anything diff2html produces.
  const maximizeBtn = container.locator(".diff-maximize");
  await expect(maximizeBtn).toBeVisible({ timeout: 5_000 });
  await expect(
    container.locator(".diff-copy-source"),
  ).toBeVisible({ timeout: 5_000 });

  // 6. Exercise the Maximize feature: clicking it opens the plugin's fullscreen
  //    overlay (`.diff-visualizer-overlay`), which re-renders the diff in a
  //    larger surface and exposes a close button. This is the plugin's primary
  //    secondary feature ("a maximize view for reviewing large diffs").
  await maximizeBtn.click();
  const overlay = page.locator(".diff-visualizer-overlay");
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  // The overlay re-renders the same diff (its own d2h-wrapper) + a close button.
  await expect(overlay.locator(".d2h-wrapper").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(overlay.locator(".diff-overlay-close")).toBeVisible({
    timeout: 5_000,
  });

  // 7. The overlay closes on its close button, leaving the inline container intact.
  await overlay.locator(".diff-overlay-close").click();
  await expect(overlay).toHaveCount(0, { timeout: 20_000 });
  await expect(container).toBeVisible({ timeout: 5_000 });

  console.log(
    "[behaviour] diff-visualizer: language-diff block → .diff-visualizer-container with side-by-side d2h render; maximize overlay opens + closes ✓",
  );
}