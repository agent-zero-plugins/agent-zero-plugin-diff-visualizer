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
