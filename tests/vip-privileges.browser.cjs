const fs = require("node:fs");
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
  fs.mkdirSync("vip-browser-results", { recursive: true });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:8767/");
  await p.click("#open");
  await p.waitForSelector('[data-reward="vip-level-01"]');
  assert.equal(await p.locator(".vp-level-reward").count(), 12);
  assert.equal(await p.locator(".vp-level-reward [data-gender]").count(), 24);
  assert.equal(await p.locator("[data-benefit=daily]").count(), 0);
  assert(
    (await p.locator(".eris-vip-cycle").innerText()).includes("1 kademe"),
  );
  const data = await p.evaluate(() =>
    fetch("/v1/me/vip/benefits").then((r) => r.json()),
  );
  assert.equal(data.reward_basis, "vip_level");
  assert.equal(data.membership.retention_target, 500000);
  assert(!("points" in data));
  for (const theme of ["light", "dark"])
    for (const width of [320, 393, 768]) {
      await p.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await p.setViewportSize({ width, height: 852 });
      const bad = await p
        .locator(
          ".vp-hub button,.vp-reward,.vp-hero,.vp-tabs select,.vp-membership",
        )
        .evaluateAll((xs) =>
          xs
            .filter((x) => x.getClientRects().length)
            .filter(
              (x) =>
                x.getBoundingClientRect().left < 0 ||
                x.getBoundingClientRect().right > innerWidth + 1,
            )
            .map((x) => x.outerHTML.slice(0, 90)),
        );
      assert.deepEqual(bad, []);
      if (width === 393)
        await p.screenshot({
          path: "vip-browser-results/vip-levels-" + theme + ".png",
          fullPage: true,
        });
    }
  for (const theme of ["light", "dark"]) {
    await p.evaluate(t => {
      document.documentElement.dataset.theme = t;
    }, theme);

    for (const width of [320, 393, 768]) {
      await p.setViewportSize({ width, height: 852 });

      for (const pane of ["levels", "benefits"]) {
        await p.locator(`[data-pane="${pane}"]`).click();

        const overflow = await p.locator(
          ".eris-vip-row,.eris-vip-buttons button,.vp-reward,.vp-hub button,.vp-tabs select"
        ).evaluateAll(nodes => nodes
          .filter(n => n.getClientRects().length)
          .filter(n => {
            const r = n.getBoundingClientRect();
            return r.left < -1 || r.right > innerWidth + 1;
          })
          .map(n => n.outerHTML.slice(0, 120))
        );

        assert.deepEqual(overflow, [], `${theme}/${width}/${pane}`);

        if (width === 393) {
          await p.screenshot({
            path: `vip-browser-results/${theme}-${pane}.png`
          });
        }
      }
    }
  }

  await p.locator('[data-pane="levels"]').click();
  await p.setViewportSize({ width: 393, height: 852 });

  await p.locator(".vp-level-reward img").evaluateAll(
    images => images.forEach(i => i.loading = "eager")
  );

  await p.waitForFunction(() =>
    [...document.querySelectorAll(".vp-level-reward img")]
      .every(i => i.complete && i.naturalWidth > 0)
  );

  assert.equal(await p.locator(".vp-level-reward img").count(), 24);

  await p.locator('[data-reward="vip-level-03"] [data-gender=female]').click();
  await p.waitForSelector(".vp-art-stage img");
  assert(
    (await p.locator(".vp-art-stage img").getAttribute("src")).includes(
      "/female/sardis.png",
    ),
  );
  await p.keyboard.press("Escape");
  await p
    .locator('[data-reward="vip-level-03"]')
    .getByRole("button", { name: "Erkek tasarımını kullan", exact: true })
    .click();
  await p.waitForFunction(() =>
    document
      .querySelector('[data-reward="vip-level-03"]')
      .textContent.includes("Seçili"),
  );
  let selected = await p.evaluate(() =>
    fetch("/v1/me/vip/benefits").then((r) => r.json()),
  );
  assert.equal(selected.active.level_cover.gender, "male");
  assert.equal(await p.locator(".vp-level-collection").count(), 1);
  assert.equal(await p.locator(".vp-level-reward").count(), 12);
  assert.equal(await p.locator(".vp-membership").count(), 0);

  assert(selected.active.level_cover.asset.includes("/male/"));
  await p
    .getByRole("button", { name: "VIP kullanım rehberi", exact: true })
    .click();
  await p.waitForSelector(".vp-overlay");
  assert.equal(await p.locator(".vp-threshold-table tbody tr").count(), 12);
  assert(
    (await p.locator(".vp-overlay").innerText()).includes("VIP seviye sistemi"),
  );
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "VIP merkezini kapat" }).click();
  await p.request.post("http://127.0.0.1:8767/test/profile", {
    data: { gender: "female" },
  });
  await p.click("#open");
  await p.waitForSelector(".vp-level-reward");
  selected = await p.evaluate(() =>
    fetch("/v1/me/vip/benefits").then((r) => r.json()),
  );
  assert.equal(selected.active.level_cover.gender, "female");
  assert(selected.active.level_cover.asset.includes("/female/"));
  await p
    .locator('[data-reward="vip-level-11"]')
    .getByRole("button", { name: "Kadın tasarımını kullan", exact: true })
    .click();
  await p.waitForFunction(() =>
    document
      .querySelector('[data-reward="vip-level-11"]')
      .textContent.includes("Seçili"),
  );
  const active = await p.evaluate(() =>
    fetch("/v1/me/vip/benefits")
      .then((r) => r.json())
      .then((d) => d.active),
  );
  await p.evaluate(
    (d) =>
      ErisVIPPrivileges.profile(document.querySelector("#profile"), d, null),
    active,
  );
  assert(
    (await p.locator(".vp-level-frame").getAttribute("src")).includes(
      "/female/imperial.png",
    ),
  );
  await p.getByRole("button", { name: "VIP merkezini kapat" }).click();
  await p.request.post("http://127.0.0.1:8767/test/profile", {
    data: { level: 2 },
  });
  await p.click("#open");
  await p.waitForSelector(".vp-level-reward");
  assert(
    await p
      .locator('[data-reward="vip-level-03"]')
      .getByRole("button", { name: "Kadın tasarımını kullan", exact: true })
      .isDisabled(),
  );
  const after = await p.evaluate(() =>
    fetch("/v1/me/vip/benefits").then((r) => r.json()),
  );
  assert(!after.active.level_cover);
  assert(!after.active.level_profile_frame);
  await p.emulateMedia({ reducedMotion: "reduce" });

  await p.evaluate(() => {
    window.dispatchEvent(new CustomEvent(
      "lidyachat:vip-gift-effect",
      {
        detail: {
          id: "visual-test",
          room_id: "isolated",
          sender_name: "VIP Test",
          nobility_replaced: true,
          vip_benefits: {
            gift_seal: "lion",
            gift_motion: "rain",
            gift_scene: "enabled"
          }
        }
      }
    ));
  });

  await p.waitForSelector(".vp-gift-seal");

  assert.equal(
    await p.locator(".vp-gift-seal").evaluate(
      n => getComputedStyle(n).animationName
    ),
    "none"
  );

  assert.deepEqual(errors, []);
  await b.close();
  console.log(
    "PASS: 12 tier/24 gender previews, direct free equip, persistence, gender switch, downgrade gates, 30-day guide, 6 theme-width combinations",
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
