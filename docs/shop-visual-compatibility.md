# Lidya mağazası görsel uyumluluğu

Ürünlerin çizim dosyaları korunur. Ortak yerleşim katmanı mağaza önizlemesinde, DM ve oda sohbetinde, mini profilde, tam kullanıcı profilinde ve kişinin kendi profil kartında aynı geometrileri kullanır.

- Balonun boyutunu mesaj belirler. Köşeler dokuz dilimli kenarlıkla korunur; uzun metin, satır sonları ve kesintisiz bağlantılar içeride sarılır. Ölçü hesabı mesajın kendi değişen genişliği yerine sohbet alanına bağlıdır.
- Profil tasarımı yalnızca kenarlık olarak çizilir. Orta bölüm ve düğmeler özgün işlevlerini korur. Aynı ürün yeniden uygulandığında yeni gözlemci oluşturulmaz; değiştirme ve kaldırma eski görsel kurallarını geri alır.
- 160 premium çerçevenin şeffaf açıklığı gerçek dosyadan ölçülür. Avatar bu açıklığa hizalanır; çerçeve, ayrılmış portrenin dışına taşmaz ve dokunmaları engellemez. Yönetim/VIP/ilişki görselleri yeniden eşlenmez.
- 160 oda girişinin koyu isim plakası gerçek dosyadan ölçülür. İsim yalnızca bu bölgede çizilir; uzun isim tek satırda taşmadan kısaltılır ve tam metin erişilebilir kalır.
- Tam profilde büyük istatistikler için iki sütun ve hediye toplamına tam satır ayrılır. Ünvan görseli kendi oranıyla gösterilir.
- Ölçüsü bilinmeyen tasarım yüklenemezse içerik okunabilir, doğal panel üzerinde kalır. Resim yüklenmesi düğmeleri veya metni bloke etmez.

## Doğrulama

`shop-visual-compatibility-audit.json` katalog/dosya doğrulama sonucudur: 1.040 ürün ve 80 duvar kâğıdı, 800 premium PNG, 160 çerçeve açıklığı ve 160 isim plakası. Bu incelemede eksik, bozuk veya metadata ile boyutu uyuşmayan dosya yoktur.

- `node tests/lidya-premium-layout.test.cjs`: 800 eşleme, 640 profil genişliği, dolgusuz merkezler, giriş açıklıkları ve VIP görsel koruması.
- `ERIS_CHROMIUM_EXECUTABLE=/path/to/chrome node tests/shop-compatibility.browser.cjs`: 480 farklı balon/çerçeve/profil ürünü; 320, 393 ve 768 piksel; açık/koyu temada 3.840 geometri kontrolü. Kısa/uzun/bağlantılı mesajlar, gerçek DM listesi/başlığı/mesajı, mini/tam/kendi profili, ürün değiştirme ve kaldırma, 160 canlı oda giriş sahnesi de denetlenir.
- `python scripts/audit_shop_visuals.py --report /tmp/shop-audit.json --fit /tmp/shop-fit.json`: Pillow, NumPy ve SciPy kurulu bir geliştirme ortamında dosya taramasını ve açıklık ölçümlerini yeniden üretir. Görsel dosyalarını değiştirmez. Ayrı bir görsel kopyasını taramak için `--assets /path/to/frontend` kullanılır.

Bu güncelleme ön yüz dosyalarıyla sınırlıdır; veri tabanı göçü gerektirmez.
