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
      hero.innerHTML = `<div><small>LİDYA · AYRICALIKLAR</small><h2>VIP ${d.level} <span>Ödül sarayın</span></h2><p>${d.points.toLocaleString("tr-TR")} VIP puanı · Günlük ${d.daily_points} puan</p></div>`;
      button(hero, "? Nasıl kullanılır", help);
      area.append(hero);
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
          `VIP ${lvl.value}: önceki seviyelerin tüm ödülleri dahildir. Günlük ${d.levels[+lvl.value - 1].daily_points} puan · Aylık %${d.levels[+lvl.value - 1].coupon_percent} kupon.`,
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
            ["daily", "weekly_trial", "weekly_box", "monthly_trial"].includes(
              item.id,
            )
          ) {
            const select = item.id === "daily" ? null : trialSelect(card, d);
            if (select) button(card, "Önizle", () => preview(select.value));
            button(
              card,
              d.period_claimed[item.id]
                ? "Bu dönem alındı ✓"
                : item.id === "daily"
                  ? `${d.daily_points} puanı al`
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
      inventory.append(
        el("summary", "", "Deneme kartlarım ve VIP puan mağazası"),
      );
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
      for (const item of d.shop) {
        const row = el("article", "vp-reward");
        row.append(
          el("h3", "", item.name),
          el("p", "", item.cost + " VIP puanı"),
        );
        button(
          row,
          item.owned ? "Alındı ✓" : "Puanla al",
          async () => {
            await api("/me/vip/benefits/shop/" + item.id, "POST");
            await refresh();
          },
          item.owned || d.points < item.cost || d.level < 1,
        );
        if (item.owned && !item.id.startsWith("trial-")) {
          const key = item.id.startsWith("cover-")
            ? "point_cover"
            : "point_seal";
          button(
            row,
            d.active[key] === item.id ? "Seçili ✓" : "Kullan",
            () => set(key, item.id),
            d.active[key] === item.id,
          );
          if (d.active[key] === item.id)
            button(row, "Kapat", () => set(key, null));
        }
        inventory.append(row);
      }
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
        "Günlük puan ve puan mağazası",
        "Ödüller kategorisinden günlük puanını al. “Deneme kartlarım ve VIP puan mağazası” alanından puanla ürün alıp ayrıca “Kullan” seç. Puanlar Lidya veya elmasa çevrilmez, devredilemez ve oyunlarda kullanılamaz.",
      ],
      [
        "Günlük, haftalık ve aylık yenileme",
        "Tüm dönemler Türkiye saatine göre hesaplanır. Günlük hak gece 00.00’da; haftalık hak pazartesi 00.00’da; aylık hak ayın ilk günü yenilenir. Kullanılmayan dönem hakları birikmez. VIP seviyen yükselse de aynı dönem hakkı tekrar verilmez.",
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
        : d.scenes || d.trial_scene || d.point_cover || d.cover || "";
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
    const names = card.querySelectorAll(
      ".name h2,.eris-mini-name,.eris-mini-title h2,.eris-mini-top h2",
    );
    names.forEach((n) => {
      n.classList.toggle("vp-gold-name", !!d.name_gold || !!d.crown_name);
      n.classList.toggle("vp-crown-name", !!d.crown_name);
    });
    if (d.cover || d.cover_pack || scene) {
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
      cover.style.backgroundImage = `url("${asset + path + ".png"}")`;
      cover.dataset.variant = d.cover_pack || "";
      cover.setAttribute("aria-label", "Lidya profil kapağı");
      card.prepend(cover);
    }
    const extra = el("section", "vp-profile-extras");
    if (d.crest || d.royal_scene) {
      const img = el("img", "vp-crest");
      img.src = asset + "lion.png";
      img.alt = "Lidya altın aslan arması";
      extra.append(img);
    }
    if (d.status && d.status_text) {
      const status = el("p", "vp-status", d.status_text);
      status.dataset.style = d.status;
      extra.append(status);
    }
    if (d.home_decor) {
      const house = el("div", "vp-home-decor");
      house.textContent =
        d.home_decor === "couple" && relationship
          ? "Hanedan Bağı · İlişki vitrini"
          : "Lidya · Kişisel saray";
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
    box.dataset.seal = d.gift_seal || d.point_seal || "";
    box.dataset.motion = d.gift_motion || "";
    box.dataset.scene = d.gift_scene ? "palace" : "";
    const img = el("img");
    img.src = asset + "lion.png";
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
