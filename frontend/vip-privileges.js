/* Lidya rewards: every state-changing action is verified by the API. */
(() => {
  "use strict";
  const base = () =>
    String(
      window.ERIS_API || "https://erischat-api-production.up.railway.app/v1",
    ).replace(/\/$/, "");
  const token = () =>
    localStorage.getItem("erischat_access_token") ||
    localStorage.getItem("erischat.accessToken.v1") ||
    localStorage.getItem("token") ||
    "";
  const appRoot = new URL("./", document.currentScript?.src || document.baseURI)
    .href;
  const rewardAsset = (path) => new URL(path, appRoot).href;
  const asset = new URL(
    "./assets/vip-privileges-v1/",
    document.currentScript?.src || document.baseURI,
  ).href;
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const labels = {
    paktolos_gold: "Altın Paktolos",
    palace_night: "Gece Sarayı",
    gold: "Altın",
    champagne: "Şampanya",
    lion: "Altın Aslan",
    laurel: "Defne",
    dust: "Altın Tozu",
    seal: "Mühür",
    marble: "Mermer",
    sardis: "Sardis",
    paktolos: "Paktolos",
    palace: "Saray",
    pearl: "İnci",
    ivory: "Fildişi",
    onyx: "Koyu Mermer",
    personal: "Kişisel",
    couple: "İlişki",
    harp: "Lidya Arpı",
    chime: "Saray Çanı",
    rain: "Altın Yağmuru",
    enabled: "Etkinleştir",
  };
  const categories = {
    profile: "Profil",
    entry: "Oda girişi",
    rooms: "Odalar",
    gifts: "Hediyeler",
    chat: "Sohbet",
    rewards: "Ödüller",
    shop: "Mağaza",
    collection: "Koleksiyon",
    support: "Destek",
  };
  async function api(path, method = "GET", body) {
    const r = await fetch(base() + path, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok)
      throw Error(
        typeof d.detail === "string"
          ? d.detail
          : "İşlem tamamlanamadı. Tekrar dene.",
      );
    return d;
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function button(parent, text, fn, disabled = false) {
    const b = el("button", "", text);
    b.type = "button";
    b.disabled = disabled;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        message(parent, e.message);
      } finally {
        if (b.isConnected) b.disabled = disabled;
      }
    };
    parent.append(b);
    return b;
  }
  function message(parent, text) {
    let s = parent.querySelector(":scope > .vp-message");
    if (!s) {
      s = el("p", "vp-message");
      s.setAttribute("role", "status");
      parent.append(s);
    }
    s.textContent = text;
  }
  function modal(title) {
    const previous = document.activeElement,
      shade = el("section", "vp-overlay");
    shade.setAttribute("role", "dialog");
    shade.setAttribute("aria-modal", "true");
    shade.setAttribute("aria-label", title);
    const box = el("div", "vp-modal"),
      h = el("header"),
      heading = el("h2", "", title),
      body = el("div", "vp-modal-body");
    h.append(heading);
    const close = () => {
      shade.remove();
      if (previous?.isConnected) previous.focus();
    };
    button(h, "Kapat ×", close);
    box.append(h, body);
    shade.append(box);
    document.body.append(shade);
    shade.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...shade.querySelectorAll(
            "button:not(:disabled),input,select,textarea,a[href]",
          ),
        ].filter((x) => x.getClientRects().length);
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    h.querySelector("button").focus();
    return { body, close, shade };
  }
  let latest = null;
  const mounts = new Set();
  async function refresh() {
    await Promise.all([...mounts].filter((x) => x.isConnected).map(mount));
    window.dispatchEvent(new Event("erischat:cosmetics-updated"));
  }
  async function set(key, value) {
    await api("/me/vip/benefits/selection", "PUT", { key, value });
    await refresh();
  }
  function trialSelect(parent, data) {
    const select = el("select");
    select.setAttribute("aria-label", "Deneme sahnesi");
    for (const x of data.trial_options) {
      const opt = el("option", "", x.name);
      opt.value = x.id;
      select.append(opt);
    }
    parent.append(select);
    return select;
  }
  async function editor(key, data) {
    const spec = data.items.find((x) => x.id === key),
      m = modal(spec?.name || "VIP ayrıcalığı");
    m.body.append(el("p", "", spec?.help || ""));
    if (key === "favorites" || key === "gift_favorites") {
      const kind = key === "favorites" ? "rooms" : "gifts";
      let list = (await api("/me/vip/benefits/favorites/" + kind)).items;
      const rows = el("div", "vp-list");
      m.body.append(rows);
      const paint = () => {
        rows.replaceChildren();
        for (const x of list) {
          const row = el("div", "vp-list-row");
          row.append(el("span", "", x.name));
          if (kind === "rooms")
            button(row, "Odaya git", () => {
              m.close();
              window.ErisChatVIP.close();
              window.openRoom?.(x.id);
            });
          button(row, "Çıkar", () => {
            list = list.filter((i) => i.id !== x.id);
            paint();
          });
          rows.append(row);
        }
      };
      paint();
      const label = el(
          "label",
          "",
          kind === "rooms" ? "Odanın 12 haneli ID’si" : "Hediye seç",
        ),
        input = el(kind === "rooms" ? "input" : "select");
      if (kind === "rooms") {
        input.maxLength = 12;
        input.inputMode = "numeric";
      } else {
        const options = await api("/me/vip/benefits/gift-options");
        for (const gift of options.items) {
          const o = el("option", "", gift.name + " · " + gift.price + " Lidya");
          o.value = gift.id;
          input.append(o);
        }
      }
      label.append(input);
      m.body.append(label);
      button(m.body, "Listeye ekle", async () => {
        const id = input.value.trim();
        if (!id || list.some((x) => x.id === id || x.public_id === id)) return;
        list.push({
          id,
          name: kind === "gifts" ? input.selectedOptions[0].textContent : id,
        });
        paint();
        if (kind === "rooms") input.value = "";
      });
      button(m.body, "Kaydet", async () => {
        await api("/me/vip/benefits/favorites/" + kind, "PUT", {
          ids: list.map((x) => x.id),
        });
        m.close();
        await refresh();
      });
      return;
    }
    if (key === "gallery" || key === "showcase") {
      const isGallery = key === "gallery",
        result = await api(
          isGallery ? "/me/vip/benefits/photos" : "/me/appearance-inventory",
        );
      const items = isGallery
        ? result.items
        : result.items.filter(
            (x) =>
              !x.expired &&
              ![
                "room_wallpaper",
                "relationship_status",
                "ring",
                "entrance",
              ].includes(x.type),
          );
      const picks = new Map();
      const saved = isGallery
        ? data.selections.gallery || []
        : data.selections.showcase || [];
      const max = isGallery ? 3 : data.showcase_capacity;
      if (!items.length)
        m.body.append(
          el(
            "p",
            "",
            isGallery
              ? "Önce Keşfet’te herkese açık bir fotoğraf paylaş."
              : "Önce VIP ödüllerini al veya mağazadan bir görünüm edin.",
          ),
        );
      for (const item of items) {
        const id = isGallery
            ? String(item.id)
            : item.type + ":" + item.asset_key,
          label = el("label", "vp-check"),
          input = el("input");
        input.type = "checkbox";
        input.checked = isGallery
          ? saved.includes(item.id)
          : saved.some((x) => x.type === item.type && x.key === item.asset_key);
        if (input.checked) picks.set(id, item);
        input.onchange = () => {
          if (input.checked && picks.size >= max) {
            input.checked = false;
            message(m.body, "En fazla " + max + " ürün seçebilirsin.");
            return;
          }
          if (input.checked) picks.set(id, item);
          else picks.delete(id);
        };
        label.append(
          input,
          el(
            "span",
            "",
            isGallery ? item.caption || "Fotoğraf #" + item.id : item.name,
          ),
        );
        m.body.append(label);
      }
      button(m.body, "Vitrini kaydet", async () => {
        await api(
          "/me/vip/benefits/" + (isGallery ? "gallery" : "showcase"),
          "PUT",
          isGallery
            ? { post_ids: [...picks.values()].map((x) => x.id) }
            : {
                items: [...picks.values()].map((x) => ({
                  type: x.type,
                  key: x.asset_key,
                })),
              },
        );
        m.close();
        await refresh();
      });
      return;
    }
    if (key === "friend_pass") {
      m.body.append(
        el(
          "p",
          "",
          `Bu ay ${data.friend_used}/${data.friend_limit} kart kullanıldı. Her kişiye ayda bir kart gönderilebilir.`,
        ),
      );
      const label = el("label", "", "Arkadaşının 12 haneli ID’si"),
        input = el("input");
      input.inputMode = "numeric";
      input.maxLength = 12;
      label.append(input);
      m.body.append(label);
      const select = trialSelect(m.body, data);
      let verified = null;
      input.oninput = () => {
        verified = null;
        confirm.disabled = true;
      };
      const confirm = button(
        m.body,
        "Kartı gönder",
        async () => {
          if (!verified || verified.public_id !== input.value.trim())
            throw Error("Önce kullanıcıyı doğrula.");
          await api("/me/vip/benefits/friend", "POST", {
            public_id: verified.public_id,
            item: select.value,
          });
          m.close();
          await refresh();
        },
        true,
      );
      button(m.body, "Kullanıcıyı doğrula", async () => {
        verified = await api(
          "/me/vip/benefits/friend/" + encodeURIComponent(input.value.trim()),
        );
        message(
          m.body,
          "Alıcı: " + verified.nickname + " · ID " + verified.public_id,
        );
        confirm.disabled = data.friend_used >= data.friend_limit;
      });
      return;
    }
    if (key === "vote") {
      const vote = await api("/me/vip/benefits/vote");
      m.body.append(el("p", "", vote.period + " koleksiyon oylaması"));
      for (const [choice, count] of Object.entries(vote.counts))
        button(
          m.body,
          `${labels[choice]} · ${count} oy ${vote.selected === choice ? "✓" : ""}`,
          async () => {
            await api("/me/vip/benefits/vote/" + choice, "POST");
            m.close();
            await editor(key, data);
          },
        );
      return;
    }
    if (key === "early_access") {
      m.body.append(el("img", "vp-collection"));
      m.body.lastChild.src = asset + "palace.png";
      m.body.lastChild.alt = "Yeni Lidya Saray koleksiyonu";
      m.body.append(
        el(
          "p",
          "",
          "Sardis Işığı, Paktolos Mermeri ve Kraliyet Sarayı yeni profil sahnelerini deneme kartlarıyla önceden inceleyebilirsin.",
        ),
      );
      const select = trialSelect(m.body, data);
      button(m.body, "Sahneyi önizle", () => preview(select.value));
      return;
    }
    if (key === "priority_support") {
      m.close();
      window.ErisChatVIP.close();
      window.ErisSupport?.open();
      return;
    }
    if (key === "stickers") {
      m.close();
      window.ErisChatVIP.close();
      window.ErisRoomEmojis?.open();
      return;
    }
  }
  function preview(key) {
    const m = modal("Lidya görünüm önizlemesi"),
      sample = el("section", "vp-preview vp-profile-surface");
    sample.dataset.vpScene = key;
    sample.append(el("img", "vp-preview-medallion"));
    sample.firstChild.src = asset + "lion.png";
    sample.firstChild.alt = "Lidya altın aslan arması";
    sample.append(
      el("h2", "", "Lidya Sarayı"),
      el("p", "", "Profil sahnesi · Altın ve mermer"),
    );
    m.body.append(sample);
    m.body.append(
      el(
        "p",
        "",
        "Bu bir önizlemedir. Etkinleştirmek için ödülü kazanıp “Kullan” düğmesine bas.",
      ),
    );
  }
  function membershipPanel(parent, m) {
    if (!m) return;
    const section = el("section", "vp-membership");
    section.setAttribute("aria-label", "VIP seviye sistemi");
    section.append(
      el("small", "", "SATIN ALIMLA YÜKSEL · 30 GÜNDE KORU"),
      el(
        "h3",
        "",
        m.level ? "VIP " + m.level + " koruma dönemin" : "VIP seviyeni başlat",
      ),
    );
    section.append(
      el(
        "p",
        "",
        Number(m.total_purchased).toLocaleString("tr-TR") +
          " Lidya doğrulanmış toplam satın alma",
      ),
    );
    if (m.level) {
      section.append(
        el(
          "p",
          "vp-retention-warning",
          `30 gün içinde ${m.retention_target.toLocaleString("tr-TR")} Lidya satın almazsan VIP seviyen 1 kademe düşecektir.`,
        ),
      );
      const progress = el("progress");
      progress.max = m.retention_target;
      progress.value = Math.min(m.retention_target, m.cycle_purchased);
      progress.setAttribute("aria-label", "30 günlük yükleme ilerlemesi");
      section.append(progress);
      section.append(
        el(
          "p",
          "",
          `Bu dönem: ${m.cycle_purchased.toLocaleString("tr-TR")} / ${m.retention_target.toLocaleString("tr-TR")} Lidya · Eksik: ${m.retention_remaining.toLocaleString("tr-TR")}`,
        ),
      );
      const timer = el("strong", "vp-countdown");
      section.append(
        timer,
        el(
          "p",
          "vp-note",
          "Bitiş: " + new Date(m.cycle_ends_at).toLocaleString("tr-TR"),
        ),
      );
      const deadline = Date.now() + m.seconds_remaining * 1000;
      const tick = () => {
        const seconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
        const days = Math.floor(seconds / 86400),
          hours = Math.floor((seconds % 86400) / 3600),
          minutes = Math.floor((seconds % 3600) / 60);
        timer.textContent = `${days} gün ${hours} saat ${minutes} dakika kaldı`;
      };
      const interval = setInterval(() => {
        if (!section.isConnected) {
          clearInterval(interval);
          return;
        }
        tick();
      }, 1000);
      tick();
      if (m.retention_met)
        section.append(
          el(
            "p",
            "vp-success",
            "✓ Bu dönemin koruma hedefi tamamlandı. Dönem bitiş tarihin değişmez.",
          ),
        );
    } else
      section.append(
        el(
          "p",
          "",
          m.recovery_target
            ? `VIP ${m.recovery_level} seviyesine yeniden çıkmak için ${m.recovery_remaining.toLocaleString("tr-TR")} Lidya daha satın al.`
            : "VIP 1 için toplam 4.000 Lidya satın alma gerekir.",
        ),
      );
    button(section, "? VIP seviye sistemi", help);
    parent.append(section);
  }
  function previewReward(item, gender) {
    const title = `VIP ${item.level} · ${item.name} · ${gender === "male" ? "Erkek" : "Kadın"}`;
    const m = modal(title);
    const stage = el("figure", "vp-art-stage");
    stage.dataset.slot = item.slot;
    const img = el("img");
    img.src = rewardAsset(item.variants[gender]);
    img.alt = title;
    stage.append(img, el("figcaption", "", title));
    m.body.append(stage, el("p", "", item.help));
    if (gender !== item.gender)
      m.body.append(
        el(
          "p",
          "vp-note",
          "Bu tasarım diğer koleksiyonun önizlemesidir. Etkinleştirmede hesabının cinsiyetine uygun görsel uygulanır.",
        ),
      );
  }
  function levelRewardGallery(parent, d) {
    const section = el("details", "vp-details vp-level-collection");
    section.open = true;
    section.append(el("summary", "", "VIP 1–12 · Yeni kadın / erkek ödülleri"));
    section.append(
      el(
        "p",
        "",
        "Her seviyede yeni ödül. Seviyene ulaştığında otomatik açılır; VIP puanı veya ek ücret gerekmez.",
      ),
    );
    const grid = el("div", "vp-grid");
    for (const item of d.level_rewards || []) {
      const card = el("article", "vp-reward vp-level-reward");
      card.dataset.reward = item.id;
      card.dataset.locked = String(!item.unlocked);
      card.append(
        el(
          "small",
          "",
          `VIP ${item.level} · ${item.unlocked ? "Kazanıldı" : "Kilitli"}`,
        ),
        el("h3", "", item.name),
      );
      const variants = el("div", "vp-gender-variants");
      for (const gender of ["female", "male"]) {
        const b = button(
          variants,
          gender === "female" ? "Kadın önizleme" : "Erkek önizleme",
          () => previewReward(item, gender),
        );
        b.dataset.gender = gender;
        const img = el("img");
        img.src = rewardAsset(
          item.thumbnails?.[gender] || item.variants[gender],
        );
        img.alt = `VIP ${item.level} ${gender === "female" ? "kadın" : "erkek"} ${item.name}`;
        img.loading = "lazy";
        b.prepend(img);
      }
      card.append(variants, el("p", "vp-note", item.help));
      button(
        card,
        item.equipped
          ? "Seçili ✓"
          : `${item.gender === "female" ? "Kadın" : "Erkek"} tasarımını kullan`,
        () => set(item.slot, item.id),
        !item.unlocked || item.equipped,
      );
      if (item.equipped) button(card, "Kapat", () => set(item.slot, null));
      grid.append(card);
    }
    section.append(grid);
    parent.append(section);
  }
  async function mount(root) {
    if (!root?.isConnected) return;
    mounts.add(root);
    for (const n of mounts) if (!n.isConnected) mounts.delete(n);
    let area = root.querySelector(":scope > .vp-hub");
    if (!area) {
      area = el("section", "vp-hub");
      root.prepend(area);
    }
    const ticket = {};
    area._ticket = ticket;
    const previous = area.querySelector("details")?.open;
    area.setAttribute("aria-busy", "true");
    try {
      const d = await api("/me/vip/benefits");
      if (!area.isConnected || area._ticket !== ticket) return;
      latest = d;
      area.replaceChildren();
      const hero = el("section", "vp-hero");
      hero.innerHTML = `<div><small>LİDYA · AYRICALIKLAR</small><h2>VIP ${d.level} <span>Ödül sarayın</span></h2><p>Her seviyede yeni ödül · Puan veya ek ücret yok</p></div>`;
      button(hero, "? Nasıl kullanılır", help);
      area.append(hero);
      membershipPanel(area, d.membership);
      levelRewardGallery(area, d);
      const details = el("details", "vp-details");
      details.open = previous ?? true;
      details.append(el("summary", "", "Ek ödüller ve etkinleştirme"));
      area.append(details);
      const filters = el("div", "vp-tabs");
      let selected = Number(root.dataset.vpLevel || d.level || 1),
        category = root.dataset.vpCategory || "all";
      const lvl = el("select");
      lvl.setAttribute("aria-label", "VIP ödül seviyesi");
      for (const x of d.levels) {
        const o = el("option", "", `VIP ${x.level} · ${x.name}`);
        o.value = x.level;
        o.selected = x.level === selected;
        lvl.append(o);
      }
      const cat = el("select");
      cat.setAttribute("aria-label", "Ödül kategorisi");
      for (const [key, name] of Object.entries({
        all: "Tüm kategoriler",
        ...categories,
      })) {
        const o = el("option", "", name);
        o.value = key;
        o.selected = key === category;
        cat.append(o);
      }
      filters.append(lvl, cat);
      details.append(filters);
      const list = el("div", "vp-grid");
      details.append(list);
      const draw = () => {
        root.dataset.vpLevel = lvl.value;
        root.dataset.vpCategory = cat.value;
        list.replaceChildren();
        const cumulative = el(
          "p",
          "vp-cumulative",
          `VIP ${lvl.value}: önceki seviyelerin tüm ödülleri dahildir. Yeni ödüller seviyende otomatik açılır · Aylık %${d.levels[+lvl.value - 1].coupon_percent} kupon.`,
        );
        list.append(cumulative);
        for (const item of d.items.filter(
          (x) =>
            x.level <= +lvl.value &&
            (cat.value === "all" || x.category === cat.value),
        )) {
          const card = el("article", "vp-reward");
          card.dataset.benefit = item.id;
          card.dataset.locked = String(!item.unlocked);
          const visual = el("img", "vp-reward-art");
          visual.alt = "";
          visual.loading = "lazy";
          visual.src =
            asset +
            (["cover", "room_decor", "early_access"].includes(item.id)
              ? "sardis"
              : item.id.includes("scene") ||
                  item.id.includes("room") ||
                  item.id === "throne"
                ? "palace"
                : "lion") +
            ".png";
          card.append(visual);
          const title = el("h3", "", item.name),
            info = el("p", "", item.help),
            tag = el(
              "small",
              "",
              `VIP ${item.level} · ${categories[item.category]}${item.unlocked ? "" : " · Kilitli"}`,
            );
          card.append(tag, title, info);
          if (item.options.length) {
            const controls = el("div", "vp-options");
            for (const option of item.options) {
              const b = button(
                controls,
                labels[option] || option,
                () => set(item.id, option),
                !item.unlocked,
              );
              b.setAttribute(
                "aria-pressed",
                String(d.active[item.id] === option),
              );
              if (d.active[item.id] === option) b.textContent += " ✓";
            }
            if (d.selections[item.id])
              button(
                controls,
                "Kapat",
                () => set(item.id, null),
                !item.unlocked,
              );
            card.append(controls);
          }
          if (
            ["status", "welcome", "room_board"].includes(item.id) &&
            item.unlocked
          ) {
            const key = {
                status: "status_text",
                welcome: "welcome_text",
                room_board: "board_text",
              }[item.id],
              limit = { status: 60, welcome: 80, room_board: 120 }[item.id];
            const label = el("label", "", "Metnin"),
              input = el("input");
            input.maxLength = limit;
            input.value = d.selections[key] || "";
            label.append(input);
            card.append(label);
            button(card, "Metni kaydet", () => set(key, input.value.trim()));
          }
          if (
            ["weekly_trial", "weekly_box", "monthly_trial"].includes(item.id)
          ) {
            const select = trialSelect(card, d);
            if (select) button(card, "Önizle", () => preview(select.value));
            button(
              card,
              d.period_claimed[item.id]
                ? "Bu dönem alındı ✓"
                : "Ödülünü seç ve al",
              async () => {
                await api("/me/vip/benefits/claim/" + item.id, "POST", {
                  item: select?.value || "trial-palace",
                });
                await refresh();
              },
              !item.unlocked || d.period_claimed[item.id],
            );
          } else if (!item.options.length)
            button(
              card,
              "Aç ve yönet",
              () => editor(item.id, d),
              !item.unlocked,
            );
          if (item.id === "coupon")
            card.append(
              el(
                "p",
                "vp-note",
                d.period_claimed.coupon
                  ? "Bu ayın kuponu kullanıldı."
                  : `Mevcut oran: %${d.coupon_percent}. Sadece standart kozmetik alımlarında geçerli; Lidya, oyun ve hediyelere uygulanmaz.`,
              ),
            );
          list.append(card);
        }
      };
      lvl.onchange = draw;
      cat.onchange = draw;
      draw();
      const inventory = el("details", "vp-details");
      inventory.append(el("summary", "", "Deneme kartlarım"));
      details.append(inventory);
      for (const trial of d.trials) {
        const row = el("article", "vp-reward");
        row.append(
          el("h3", "", trial.name),
          el(
            "p",
            "",
            `${trial.active ? "Kullanılabilir" : "Süresi doldu"} · ${new Date(trial.expires_at).toLocaleString("tr-TR")}`,
          ),
        );
        button(row, "Önizle", () => preview(trial.item));
        button(
          row,
          d.active.trial_scene === trial.item ? "Seçili ✓" : "Kullan",
          () => set("trial_scene", trial.item),
          !trial.active || d.active.trial_scene === trial.item,
        );
        inventory.append(row);
      }
      if (d.active.trial_scene)
        button(inventory, "Deneme sahnesini kapat", () =>
          set("trial_scene", null),
        );
      if (!d.trials.length)
        inventory.append(
          el(
            "p",
            "",
            "Henüz deneme kartın yok. Kazanılan kartlar ve arkadaşlarının gönderdikleri burada görünür.",
          ),
        );
    } catch (e) {
      if (area._ticket === ticket) {
        area.replaceChildren(el("p", "", e.message));
        button(area, "Tekrar dene", () => mount(root));
      }
    } finally {
      if (area._ticket === ticket) area.setAttribute("aria-busy", "false");
    }
  }
  function help() {
    const m = modal("VIP kullanım rehberi");
    const sections = [
      [
        "VIP seviye sistemi",
        "VIP seviyesi harcamaya değil, doğrulanmış Lidya satın alımlarının toplamına göre yükselir. Paketle yüklenen bonus dahil toplam Lidya sayılır. Hediye, oyun kazancı, transfer, yönetici tarafından karşılıksız ekleme ve harcama sayılmaz. VIP 12 eşiği 10.000.000 Lidya’dır.",
      ],
      [
        "30 günlük koruma süresi",
        "Her VIP seviyesine ulaştığın anda 30 günlük süre başlar. Koruma hedefi o seviyenin toplam gereksiniminin %5’idir. Bu süre içinde hedef kadar Lidya satın almazsan VIP seviyen 1 kademe düşer. 500 Lidya bakım ücreti veya otomatik bakiye kesintisi yoktur. Kalan süre, tarih, yüklenen ve eksik miktar merkezde görünür.",
      ],
      [
        "Seviye yükselince süre sıfırlanır",
        "Örnek: VIP 5’te 13 günün kalmışken VIP 6’ya yükselirsen süre yeniden tam 30 gün olur. Yeni hedef VIP 6 için 17.500 Lidya’dır. Yükselten satın alımın tamamı yeni dönemin hedefine sayılır; önceki işlemler yeniden sayılmaz. Aynı seviyedeki satın alımlar sayacı sıfırlamaz.",
      ],
      [
        "Dönem sonu ve seviye düşüşü",
        "Hedefi erken tamamlarsan dönem bitişi değişmez. Dönem sonunda seviyen korunur ve sıfır yükleme ilerlemesiyle yeni 30 gün başlar. Hedef tamamlanmazsa bir kademe düşersin ve düşük seviyenin yeni 30 günü başlar. Her başarısız dönemde tekrar bir kademe düşülür; VIP 1’in altı VIP 0’dır. Uygulamaya girmesen de dönemler ilerler.",
      ],
      [
        "Düşüşten sonra tekrar yükselme",
        "Geçmiş doğrulanmış satın alım toplamın silinmez; fakat eski toplam tek başına seviyeyi geri getirmez. Yeni bir satın alımla, daha önce kazandığın seviyenin %5’lik koruma hedefini mevcut dönemde tamamlarsan o seviyeye geri çıkabilirsin. Yeni bir toplam satın alma eşiğini aşmak da normal yükseliş sağlar. Her gerçek yükselişte 30 gün yeniden başlar.",
      ],
      [
        "Mevcut hesaplar ve ödüller",
        "Geçişte mevcut VIP seviyen korunur ve yeni sistemde ilk giriş/işleme alındığında tam 30 günlük koruma dönemi açılır. Yalnızca kayıtlı doğrulanmış ödemeler toplam satın alımına eklenir. Seviye düşüşünde üst seviye ek ödülleri kapanır; normal mağaza ürünlerin korunur. Süreli deneme kartların kendi bitiş tarihine tabidir.",
      ],
      [
        "VIP merkezine nasıl girerim?",
        "Profil → VIP bölümünü aç. Üstteki “Ek ödüller ve etkinleştirme” alanından seviye ve kategori seç. Her seviyenin önceki seviyeleri de kapsayan ödülleri listelenir. Kilitli ödüllerde gereken seviye yazar.",
      ],
      [
        "Mevcut avatar, çerçeve ve duvar kâğıdı",
        "Merkezin altındaki seviyenden “Ödülleri al” düğmesine bas. Ardından “Avatar uygula”, “Çerçeve uygula” veya “Duvar kâğıdı uygula” seç. Aynı ürünlere Profil → Koleksiyon bölümünden de ulaşabilirsin. Oda girişi için “Bu girişi kullan” seç.",
      ],
      [
        "Ek görünümleri nasıl açarım?",
        "Ek ödüllerde uygun tasarımın düğmesine bas. Seçili görünüm ✓ ile işaretlenir. “Kapat” yalnızca o ayrıcalığı devre dışı bırakır. Profil kapağı, arma, isim, ışık ve sahneler profilinde; oda dekorları sahibi olduğun odalarda görünür.",
      ],
      [
        "Seviye ödülleri ve kadın/erkek tasarımları",
        "VIP 1–12 seviyelerinin her birinde yeni ek ödül vardır. VIP puanı kazanma ve puanla alışveriş kaldırıldı. İlgili seviyeye ulaştığında ödül otomatik açılır. Kadın ve erkek görsellerini ayrı ayrı büyütüp inceleyebilirsin; etkinleştirme hesabının cinsiyetine uygun tasarımı kullanır. Kullan düğmesiyle aç, Kapat ile kaldır. Eski puan kayıtları hak veya ödeme koşulu olarak kullanılmaz.",
      ],
      [
        "Deneme kartlarının haftalık ve aylık yenilenmesi",
        "Tüm dönemler Türkiye saatine göre hesaplanır. Haftalık hak pazartesi 00.00’da; aylık hak ayın ilk günü yenilenir. Kullanılmayan dönem hakları birikmez. VIP seviyen yükselse de aynı dönem hakkı tekrar verilmez.",
      ],
      [
        "Deneme kartları ve seçim sandığı",
        "Sahneyi seçip önce önizle; “Ödülünü seç ve al” ile kartı kazan. Sonra Deneme kartlarım → Kullan. Haftalık deneme 1 gün, seçim sandığı 3 gün sürer. Aylık kart VIP 5–8: 3, VIP 9–10: 7, VIP 11: 15, VIP 12: 30 gündür. Aynı sahnede süreler toplanmaz; daha ileri bitiş korunur. Süre bitince görünüm otomatik kapanır.",
      ],
      [
        "Arkadaşıma nasıl kart gönderirim?",
        "VIP 8 ve üstünde Arkadaşa deneme kartı → Aç ve yönet. Arkadaşının 12 haneli ID’sini yaz, kullanıcıyı doğrula ve görünen adı kontrol et. Sahneyi seçip “Kartı gönder”e bas. Arkadaşın VIP üyesi olmasa da VIP merkezindeki Deneme kartlarım alanından kullanabilir. Aylık kart sayısı VIP 8–9: 2, VIP 10–11: 3, VIP 12: 5. Aynı kişiye ayda bir kart verilir.",
      ],
      [
        "Aylık mağaza kuponu",
        "Mağaza kategorisinden kuponu etkinleştir. Sonraki uygun standart kozmetik alışverişine otomatik uygulanır ve o ay için tüketilir. Ödeme ekranında indirimli tutarı kontrol et. Kuponlar birikmez ve oranlar toplanmaz.",
      ],
      [
        "Koleksiyon ve fotoğraf vitrini",
        "Koleksiyon vitrini → Aç ve yönet bölümünden sahip olduğun ürünleri seç. Kapasite VIP 6–8: 3, VIP 9–10: 6, VIP 11–12: 9 üründür. Fotoğraf vitrini yalnızca kendi herkese açık Keşfet fotoğraflarını gösterir. Fotoğrafı silmek veya gizlemek vitrinden de kaldırır. Ortak fotoğraf vitrini için iki eşin de özelliği açması gerekir; bu durumda her eşin seçtiği üç açık fotoğraf birlikte görünür.",
      ],
      [
        "Oda, giriş ve hediye efektleri",
        "Odalar kategorisinden dekor, koltuk ve duyuruyu seç. Dekor yalnızca sahibi olduğun odalara uygulanır. Giriş mesajını yazıp kaydet ve özelliği ayrıca etkinleştir. Hediye efektleri odada gönderdiğin hediyelerde görünür. Giriş sesleri izleyicinin ses tercihlerine tabidir; “Sesler” düğmesiyle kapatılabilir.",
      ],
      [
        "Favoriler, çıkartmalar ve oylama",
        "Favori odalara oda ID’siyle ekle, bu listeden odaya gir. Hediye favorilerini görsel katalogdan seçerek yönet. Çıkartmalar oda emoji menüsünde açılır. VIP 11 ve üstünde Koleksiyon oylaması bölümünden ayın temasını seç veya oyununu değiştir.",
      ],
      [
        "Gizlilik ve erişilebilirlik",
        "Ayarlar’daki VIP gizleme ve giriş gizleme tercihleri korunur. Telefonun hareket azaltma tercihi animasyonları durdurur. Sinematikler “Geç” düğmesiyle kapanır. Hesap değiştiğinde ödüller yeni hesabın sunucu verisiyle yeniden yüklenir.",
      ],
      [
        "VIP 12 öncelikli destek",
        "Destek kategorisinden Aç ve yönet ile mevcut destek merkezine git. Yeni taleplerin bekleyen talepler arasında öncelikli sıralanır. VIP yetkili rozeti veya yönetim yetkisi sağlamaz.",
      ],
    ];
    for (const [title, text] of sections) {
      const d = el("details", "vp-details");
      d.append(el("summary", "", title), el("p", "", text));
      m.body.append(d);
    }
    if (latest?.membership) {
      const table = el("table", "vp-threshold-table");
      table.innerHTML =
        "<thead><tr><th>VIP</th><th>Toplam satın alma</th><th>30 günlük hedef</th></tr></thead>";
      const body = el("tbody");
      for (const row of latest.membership.thresholds) {
        const tr = el("tr");
        for (const value of [
          row.level,
          row.total.toLocaleString("tr-TR"),
          row.retention.toLocaleString("tr-TR"),
        ])
          tr.append(el("td", "", String(value)));
        body.append(tr);
      }
      table.append(body);
      m.body.prepend(table);
    }
    if (latest)
      for (const level of latest.levels) {
        const d = el("details", "vp-details");
        d.append(el("summary", "", `VIP ${level.level} · ${level.name}`));
        for (const item of latest.items.filter((x) => x.level === level.level))
          d.append(el("p", "", item.name + " — " + item.help));
        m.body.append(d);
      }
  }
  window.ErisVIPPrivileges = {
    mount,
    help,
    profile: decorateProfile,
    assetUrl: rewardAsset,
    entry: decorateEntry,
  };
  function decorateProfile(root, data = {}, relationship) {
    const card = root.matches?.(".eris-mini-card,.profile.card")
      ? root
      : root.querySelector(".eris-mini-card,.profile.card");
    if (!card) return;
    card
      .querySelectorAll(
        ":scope > .vp-profile-extras,:scope > .vp-profile-cover",
      )
      .forEach((n) => {
        for (const url of n._urls || []) URL.revokeObjectURL(url);
        n.remove();
      });
    clearTimeout(card._vpExpiry);
    const d = data || {};
    if (d.trial_expires_at) {
      const expires = Date.parse(d.trial_expires_at) - Date.now();
      if (expires > 0)
        card._vpExpiry = setTimeout(
          () => {
            if (card.isConnected)
              decorateProfile(
                root,
                { ...d, trial_scene: null, trial_expires_at: null },
                relationship,
              );
          },
          Math.min(expires, 2147483647),
        );
    }
    card.classList.toggle("vp-profile-surface", !!Object.keys(d).length);
    card.dataset.vpAura = d.aura || "";
    card.dataset.vpPanel = d.info_panel || "";
    const scene = d.royal_scene
      ? "royal"
      : d.throne
        ? "throne"
        : d.scenes || d.trial_scene || d.cover || "";
    card.dataset.vpScene = scene;
    const sceneFile = scene.includes("sardis")
      ? "sardis"
      : scene.includes("paktolos")
        ? "paktolos"
        : scene === "lion"
          ? "lion"
          : "palace";
    if (scene)
      card.style.setProperty(
        "--vp-scene-image",
        `url("${asset + sceneFile + ".png"}")`,
      );
    else card.style.removeProperty("--vp-scene-image");
    if (d.level_scene) {
      card.dataset.vpScene = "direct";
      card.style.setProperty(
        "--vp-scene-image",
        `url("${rewardAsset(d.level_scene.asset)}")`,
      );
    }
    const names = card.querySelectorAll(
      ".name h2,.eris-mini-name,.eris-mini-title h2,.eris-mini-top h2",
    );
    names.forEach((n) => {
      n.classList.toggle("vp-gold-name", !!d.name_gold || !!d.crown_name);
      n.classList.toggle("vp-crown-name", !!d.crown_name);
    });
    if (d.level_cover || d.cover || d.cover_pack || scene) {
      const cover = el("div", "vp-profile-cover");
      const path = scene.includes("sardis")
        ? "sardis"
        : scene.includes("paktolos")
          ? "paktolos"
          : d.cover === "sardis"
            ? "sardis"
            : d.cover === "paktolos" || d.cover_pack === "paktolos_gold"
              ? "paktolos"
              : "palace";
      cover.style.backgroundImage = `url("${d.level_cover ? rewardAsset(d.level_cover.asset) : asset + path + ".png"}")`;
      cover.dataset.variant = d.cover_pack || "";
      cover.setAttribute("aria-label", "Lidya profil kapağı");
      card.prepend(cover);
    }
    card.querySelector(":scope>.vp-level-frame")?.remove();
    if (d.level_profile_frame) {
      const frame = el("img", "vp-level-frame");
      frame.alt = "İmparatorluk profil işlemesi";
      frame.src = rewardAsset(d.level_profile_frame.asset);
      card.prepend(frame);
    }
    const extra = el("section", "vp-profile-extras");
    if (d.level_crest || d.crest || d.royal_scene) {
      const img = el("img", "vp-crest");
      img.src = d.level_crest
        ? rewardAsset(d.level_crest.asset)
        : asset + "lion.png";
      img.alt = "Lidya altın aslan arması";
      extra.append(img);
    }
    if ((d.status && d.status_text) || d.level_status_frame) {
      const status = el("p", "vp-status", d.status_text || "Lidya Üyesi");
      if (d.level_status_frame) {
        status.classList.add("vp-direct-status");
        status.style.backgroundImage = `url("${rewardAsset(d.level_status_frame.asset)}")`;
      }
      status.dataset.style = d.status;
      extra.append(status);
    }
    if (d.home_decor || d.level_home_decor) {
      const house = el("div", "vp-home-decor");
      house.textContent =
        d.home_decor === "couple" && relationship
          ? "Hanedan Bağı · İlişki vitrini"
          : "Lidya · Kişisel saray";
      if (d.level_home_decor)
        house.style.backgroundImage = `linear-gradient(#24170788,#24170788),url("${rewardAsset(d.level_home_decor.asset)}")`;
      extra.append(house);
    }
    if (d.showcase?.length) {
      const list = el("div", "vp-showcase");
      list.setAttribute("aria-label", "Koleksiyon vitrini");
      for (const item of d.showcase) {
        const img = el("img");
        img.alt = "Koleksiyon · " + item.type;
        img.loading = "lazy";
        img.src =
          window.ErisChatCosmetics?.assetUrl?.(item.key) ||
          "./" + item.key.split("/").map(encodeURIComponent).join("/");
        list.append(img);
      }
      extra.append(list);
    }
    if (d.gallery?.length) {
      const gallery = el("div", "vp-gallery");
      gallery._urls = [];
      gallery.setAttribute(
        "aria-label",
        d.shared_gallery ? "Hanedan fotoğraf vitrini" : "Fotoğraf vitrini",
      );
      extra.append(gallery);
      for (const id of d.gallery) {
        const img = el("img");
        img.alt = "Keşfet fotoğrafı";
        img.loading = "lazy";
        gallery.append(img);
        fetch(base() + "/posts/" + encodeURIComponent(id) + "/media", {
          headers: { Authorization: "Bearer " + token() },
        })
          .then((r) => {
            if (!r.ok) throw Error();
            return r.blob();
          })
          .then((blob) => {
            if (!gallery.isConnected) return;
            const url = URL.createObjectURL(blob);
            gallery._urls.push(url);
            extra._urls = (extra._urls || []).concat(url);
            img.src = url;
          })
          .catch(() => img.remove());
      }
    }
    if (d.trial_expires_at) {
      extra.dataset.expires = d.trial_expires_at;
      extra.append(
        el(
          "small",
          "vp-note",
          "Deneme bitişi: " +
            new Date(d.trial_expires_at).toLocaleString("tr-TR"),
        ),
      );
    }
    if (extra.children.length) card.append(extra);
  }
  let audioMuted = localStorage.getItem("eris_vip_sounds") !== "on";
  let audioContext;
  function sound(kind) {
    if (audioMuted || document.hidden) return;
    try {
      audioContext =
        audioContext ||
        new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state !== "running") return;
      const notes =
        kind === "harp" ? [392, 493.88, 587.33] : [523.25, 659.25, 783.99];
      const t = audioContext.currentTime;
      notes.forEach((freq, i) => {
        const o = audioContext.createOscillator(),
          g = audioContext.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t + i * 0.16);
        g.gain.linearRampToValueAtTime(0.025, t + i * 0.16 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.16 + 0.65);
        o.connect(g);
        g.connect(audioContext.destination);
        o.start(t + i * 0.16);
        o.stop(t + i * 0.16 + 0.7);
      });
    } catch {}
  }
  document.addEventListener("click", () => {
    if (!audioMuted) {
      try {
        audioContext =
          audioContext ||
          new (window.AudioContext || window.webkitAudioContext)();
        audioContext.resume().catch(() => {});
      } catch {}
    }
  });
  function decorateEntry(node, event) {
    const d = event.vip_benefits || {};
    node.dataset.vpParticles = d.particles || "";
    node.classList.toggle("vp-royal-entry", !!d.cinematic);
    const note = node.querySelector(".eris-vip-entry-identity>span");
    if (note && d.welcome && d.welcome_text) note.textContent = d.welcome_text;
    if (d.entry_card) node.classList.add("vp-entry-card");
    if (d.duo_entry && event.partner_present) {
      const badge = el("span", "vp-duo-mark", "Hanedan birlikte");
      node.querySelector(".eris-vip-entry-identity")?.append(badge);
    }
    if (d.entry_sound) sound(d.entry_sound);
  }
  function decorateRoom(room) {
    const node = document.getElementById("erisRoomSurface");
    if (!node) return;
    const d = room.vip_benefits || {};
    node.dataset.vpRoom = d.royal_room
      ? "royal"
      : d.palace_room
        ? "palace"
        : d.room_decor || "";
    node.dataset.vpDirectRoom = String(!!d.level_room_decor);
    if (d.level_room_decor)
      node.style.setProperty(
        "--vp-direct-room",
        `url("${rewardAsset(d.level_room_decor.asset)}")`,
      );
    else node.style.removeProperty("--vp-direct-room");
    node.dataset.vpSeats = d.royal_room ? "gold" : d.seat_skin || "";
    node.dataset.vpCrest = d.royal_room ? "lion" : d.room_crest || "";
    node.querySelector(".vp-room-board")?.remove();
    if (d.room_board && d.board_text) {
      const board = el("p", "vp-room-board", d.board_text);
      node.querySelector(".eris-room-top")?.after(board);
      if (!board.isConnected) node.append(board);
    }
    let soundButton = node.querySelector(".vp-sound-toggle");
    if (!soundButton) {
      soundButton = el("button", "vp-sound-toggle");
      soundButton.type = "button";
      soundButton.onclick = () => {
        audioMuted = !audioMuted;
        localStorage.setItem("eris_vip_sounds", audioMuted ? "off" : "on");
        soundButton.textContent = audioMuted
          ? "VIP sesleri kapalı"
          : "VIP sesleri açık";
        soundButton.setAttribute("aria-pressed", String(!audioMuted));
      };
      node.append(soundButton);
    }
    soundButton.textContent = audioMuted
      ? "VIP sesleri kapalı"
      : "VIP sesleri açık";
    soundButton.setAttribute("aria-pressed", String(!audioMuted));
  }
  window.addEventListener("erischat:room-opened", (e) =>
    decorateRoom(e.detail.room),
  );
  window.addEventListener("erischat:room-state-updated", (e) =>
    decorateRoom(e.detail.room),
  );
  const seenGifts = new Set();
  window.addEventListener("erischat:room-gift", (e) => {
    const event = e.detail || {},
      d = event.vip_benefits || {};
    if (!Object.keys(d).length || event.global) return;
    const id = String(event.room_id) + ":" + event.id;
    if (seenGifts.has(id)) return;
    seenGifts.add(id);
    if (seenGifts.size > 100) seenGifts.delete(seenGifts.values().next().value);
    document.querySelector(".vp-gift-seal")?.remove();
    const box = el("aside", "vp-gift-seal");
    box.dataset.seal = d.gift_seal || "";
    box.dataset.motion = d.gift_motion || "";
    box.dataset.scene = d.gift_scene ? "palace" : "";
    const img = el("img");
    img.src = d.level_gift_seal
      ? rewardAsset(d.level_gift_seal.asset)
      : asset + "lion.png";
    img.alt = "Lidya hediye mührü";
    box.append(
      img,
      el(
        "span",
        "",
        event.sender_nickname || event.sender_name || "Lidya hediyesi",
      ),
    );
    document.body.append(box);
    setTimeout(() => box.remove(), 2400);
  });
  window.addEventListener("erischat:auth", (e) => {
    if (e.detail?.state !== "ready") {
      latest = null;
      seenGifts.clear();
      for (const m of mounts) {
        const area = m.querySelector(".vp-hub");
        if (area) area._ticket = {};
      }
      document
        .querySelectorAll(".vp-overlay,.vp-gift-seal")
        .forEach((n) => n.remove());
    }
  });
})();
