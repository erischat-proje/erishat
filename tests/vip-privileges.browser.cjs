const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: process.env.ERIS_CHROMIUM_EXECUTABLE,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const p = await b.newPage({ viewport: { width: 393, height: 852 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:8767/");
  await p.click("#open");
  await p.waitForSelector("[data-benefit=daily]");
  for (const theme of ["light", "dark"])
    for (const width of [320, 393, 768]) {
      await p.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await p.setViewportSize({ width, height: 852 });
      const bad = await p
        .locator(".vp-hub button,.vp-reward,.vp-hero,.vp-tabs select")
        .evaluateAll((xs) =>
          xs
            .filter((x) => x.getClientRects().length)
            .filter(
              (x) =>
                x.getBoundingClientRect().left < 0 ||
                x.getBoundingClientRect().right > innerWidth + 1,
            )
            .map((x) => x.outerHTML.slice(0, 100)),
        );
      assert.deepEqual(bad, []);
      if (width === 393)
        await p.screenshot({
          path: "/workspace/scratch/4be49aab6706/vip-" + theme + ".png",
          fullPage: true,
        });
    }
  await p
    .locator("[data-benefit=name_gold] button")
    .filter({ hasText: "Altın" })
    .click();
  await p.waitForSelector("[data-benefit=name_gold] [aria-pressed=true]");
  await p.locator("[data-benefit=daily] button").click();
  await p.waitForFunction(() =>
    document.querySelector(".vp-hero p").textContent.includes("150 VIP puanı"),
  );
  assert(await p.locator("[data-benefit=daily] button").isDisabled());
  await p
    .locator("[data-benefit=monthly_trial] button")
    .filter({ hasText: "Ödülünü seç ve al" })
    .click();
  await p.waitForFunction(() =>
    [...document.querySelectorAll("[data-benefit=monthly_trial] button")].some(
      (b) => b.textContent.includes("Bu dönem alındı"),
    ),
  );
  await p
    .locator(".vp-details>summary")
    .filter({ hasText: "Deneme kartlarım" })
    .click();
  await p
    .locator(".vp-reward")
    .filter({
      has: p.getByRole("heading", { name: "Sardis Işığı", exact: true }),
    })
    .getByRole("button", { name: "Kullan", exact: true })
    .click();
  await p.waitForFunction(
    () => document.querySelector(".vp-reward button") !== null,
  );
  await p
    .getByRole("button", { name: "VIP kullanım rehberi", exact: true })
    .click();
  await p.waitForSelector(".vp-overlay");
  assert.equal(await p.locator(".vp-overlay details").count(), 25);
  await p.keyboard.press("Escape");
  assert.equal(await p.locator(".vp-overlay").count(), 0);
  await p.locator(".vp-tabs select").first().selectOption("1");
  await p.waitForFunction(
    () => document.querySelectorAll(".vp-grid .vp-reward").length === 4,
  );
  await p.getByRole("button", { name: "VIP merkezini kapat" }).click();
  await p.click("#open");
  await p.waitForSelector("[data-benefit=daily]");
  assert(await p.locator("[data-benefit=daily] button").isDisabled());
  await p.evaluate(() =>
    ErisVIPPrivileges.profile(
      document.querySelector("#profile"),
      {
        cover: "palace",
        crest: "lion",
        name_gold: "gold",
        status: "gold",
        status_text: "Lidya",
        aura: "gold",
      },
      null,
    ),
  );
  assert.equal(await p.locator(".vp-profile-cover").count(), 1);
  assert.equal(await p.locator(".vp-crest").count(), 1);
  assert.deepEqual(errors, []);
  await b.close();
  console.log(
    "PASS: real API claim/equip/persistence, 6 theme-width combinations, help, filters, profile surface",
  );
})();
