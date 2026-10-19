> Güncel sistem: [VIP satın alma V2](vip-purchase-v2.md). Aşağıdaki V1 kaydı tarihçedir; VIP puanı özellikleri kaldırılmıştır.

# VIP 1–12 Lidya ek ödülleri

Giriş: Profil → VIP. Üst sağdaki **?** düğmesi kullanım rehberini açar. Yeni alan, mevcut avatar/çerçeve/duvar kâğıdı ve giriş ödüllerini koruyarak eklenir.

42 ayrıcalık; önceki seviyeler dahil edilir. Seçimler sunucuda hesap bazında saklanır. Etkinleştirme, kapatma, önizleme, kategori ve seviye filtreleri merkezden erişilebilir.

- VIP 1: altın isim, günlük VIP puanı, 6 yeni çıkartma ve aslan arması.
- VIP 2: 6 ek çıkartma, 3 durum düzeni, 30 favori oda ve haftalık 1 günlük sahne denemesi.
- VIP 3: 3 hareketli kapak, 2 ışık efekti, 3 fotoğraf vitrini, aylık mağaza kuponu.
- VIP 4: kişisel giriş mesajı, 2 kısa melodi, 2 giriş efekti ve 2 hediye mührü.
- VIP 5: haftalık 3 günlük sahne seçimi, 3 hediye animasyonu, 12 favori hediye, aylık 3 günlük sahne kartı.
- VIP 6: 3 ürünlük koleksiyon vitrini, 2 ek kapak, 2 mermer bilgi panosu.
- VIP 7: 2 oda dekoru, altın/inci koltuk kaplaması, duyuru panosu ve oda arması.
- VIP 8: kişisel/ilişki dekoru, eş odadaysa birlikte giriş işareti, iki eşin onayıyla ortak fotoğraf vitrini, ayda 2 arkadaş kartı.
- VIP 9: aylık kart 7 gün, vitrin 6 ürün, 2 sahne ve koleksiyon önizlemesi.
- VIP 10: taht sahnesi, saray oda görünümü, kişisel giriş kartı, ayda 3 arkadaş kartı.
- VIP 11: vitrin 9 ürün, aylık kart 15 gün, koleksiyon oylaması, hediye sahnesi.
- VIP 12: kraliyet profili, geçilebilir sinematik, taçlı isim, kraliyet oda seti, aylık kart 30 gün, ayda 5 arkadaş kartı, destek kuyruğunda öncelik.

## Dönemler ve ekonomi

Türkiye saati: günlük gece yarısı, haftalık pazartesi, aylık ayın ilk günü. Günlük puanlar 10/15/20/25/30/40/50/60/75/90/110/150. Kuponlar VIP 3'ten itibaren %3/4/5/6/7/8/9/10/12/15.

Puanlar devredilemez, Lidya/elmasa çevrilmez. Puan mağazasında iki özel kapak, kraliyet hediye mührü ve 7 günlük sahne vardır. Katalogdaki her puan ürünü bir kez alınır. Rastgele ödül veya oyun avantajı yoktur.

Kupon, etkinleştirilmişse `/me/cosmetics/purchase` üzerinden bir standart kozmetik alımına uygulanır. Odaların kiralık duvar kâğıdı, Lidya paketleri ve hediyeler kapsam dışındadır. İndirim gerçek ödenen tutara ve VIP harcamasına yansır; başarısız satın almada tüketilmez. Ana mağaza al düğmesinde indirimli fiyat görünür.

Süreli ödüller profil sahnesi denemeleridir. Aynı sahnede süreler üst üste eklenmez; daha ileri bitiş korunur. Süre kontrolü hem sunucuda hem açık profilde yapılır. Aylık süre ve limitler önceki seviyelerle toplanmaz. Puan ve arkadaş kartı hakları aynı kullanıcı kilidi altında işlenir; kayıtların birleşik anahtarları tekrarları engeller.

## Kapsam ve gizlilik

Oda dekorları sahibin odalarına uygulanır. İlişki dekoru, aktif ilişkinin ortak odasında eşlerden biri VIP 8 dekorunu seçtiğinde görünür. Ortak fotoğraf vitrini iki eşin de ayrı ayrı özelliği açmasını gerektirir; yalnızca seçilmiş herkese açık fotoğraflar gösterilir. Fotoğraf silme/gizleme tekrar sorgulamada kaldırılır. Koleksiyon vitrini sahiplik kontrolü yapar.

VIP ve giriş gizleme ayarları korunur. Efekt sesleri başlangıçta kapalıdır; kullanıcı kendi cihazında açabilir. Hareket azaltma tercihi desteklenir. Giriş sinematiği atlanabilir. Yetkili rozetlerine ve yönetim rollerine dokunulmaz.

## Dağıtım

Üç yeni tablo `platform_models` üzerinden başlangıçtaki `Base.metadata.create_all` işlemine kaydedilir: `vip_benefit_state`, `vip_benefit_receipts`, `vip_benefit_leases`. Eski tabloların sütunları değiştirilmez. Backend ve frontend aynı değişiklikte dağıtılmalıdır. Canlı üretim üzerinde bu oturumda dağıtım yapılmamıştır.

## Doğrulama

- `python tests/test_vip_privileges.py`: 16 API/persistence testi; seviye, oturum, idempotency, süre, Türkiye dönem sınırı, puan harcama, gerçek kozmetik satın alma ve kupon, başarısız satın alma, sahiplik, gizlilik, arkadaş limiti, oylama.
- `python tests/room-emojis-vip.test.py`: eski ve 12 yeni çıkartmanın katalog/seviye eşleşmesi.
- İzole SQLite API ile `tests/vip-privileges.browser.cjs`: 320/393/768 piksel × açık/koyu tema; gerçek alma/etkinleştirme, kalıcılık, yardım, filtre, profil yüzeyi.
- `tests/vip-center-browser.test.cjs`: mevcut VIP merkezi filtre/ödül tekrar deneme/profil önizleme regresyonu.
- Python derleme, değişen JavaScript sözdizimi, OpenAPI ve başlangıç kayıtları.
- 16 PNG biçim/şeffaflık doğrulaması. Yerleşik görsel üretim kaynakları ve tasarım briefleri `docs/vip-privileges-art.json` içindedir.
- Kurulum provası: ayrı seyrek çalışma alanı, üç yönlü ikili yama, özgün dosya korunması ve beklenen son Git ağacının birebir eşleşmesi. Bu provada GitHub yazma çağrıları simüle edildi.

Eski `tests/vip-lydia-rewards.test.py` AST testinin güncel `staff_identity` bağımlılığı fixture'da yoktur; bu testte iki fixture hatası görüldü. `backend/test_vip_presentation.py` bazı eski görsel/katalog varsayımlarında başarısızdır. Bu geniş eski testlerin tamamen geçtiği iddia edilmemektedir. Bu paket için yeni API testleri doğrudan gerçek handler'ları çalıştırır. Gerçek PostgreSQL eşzamanlı istek yük testi ve iki gerçek hesapla canlı oda/destek uçtan uca denemesi dağıtım öncesinde ayrıca yapılmalıdır.
