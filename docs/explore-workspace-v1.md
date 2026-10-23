# Keşfet çalışma alanı V1

PR #393 birleşmiş auth-unified-v1 tabanı üzerine hazırlanmıştır. Mevcut Lidya açık/koyu renk değişkenleri kullanılır; PNG, kamera, story, takip veya ödeme motoru değiştirilmez.

## Uygulananlar

- Dört akış: Senin için (takip edilen yazarlar önce, sonra güncel topluluk), takip edilenler, en son ve özel kaydedilenler. İlk 30 gönderi sınırı yerine 20'lik anahtar tabanlı sayfalar ve devamını yükle. İlk sayfanın en yüksek kayıt ID'si korunur; araya yeni gönderi eklense bile aynı zaman damgalı eski kayıtlar atlanmaz/tekrarlanmaz. İstemci de ID tekrarlarını eler. Takip ilişkisi gezinme sırasında değişirse yenilemek gerekir; öneri bir makine öğrenmesi modeli değildir.
- Sunucuda metin/yazar adı arama (100 karakter), tümü/yazı/fotoğraf/video filtresi. Kaydedilenler özgün gönderi tarihine göre sıralanır.
- Özel kaydet/kaldır; başka kullanıcı kaydedilenleri göremez. Erişim her istekte tekrar doğrulanır. Takipten çıkma, engel, yazarın gizlemesi, pasif hesap veya hesap/cihaz banı özel içeriğe erişimi kapatır. Kaydetmek erişim yetkisi sağlamaz.
- Gönderiyi kendi akışından gizle veya yazarı sessize al. Bunlar gönderiyi silmez, takip/mesaj/engelleme durumunu değiştirmez. Tercihler penceresinden geri alınabilir. Bilerek kaydedilenler görünümünde akış gizleme/sessize alma uygulanmaz; özgün gönderi gizliliği her zaman uygulanır.
- Beğeni/yorum sayısı ve kişinin beğeni/kaydetme durumu sayfa başına toplu sorgulanır; her karta ayrı engagement isteği yapılmaz. Mevcut beğeni, yorum, şikâyet ve profil işlemleri korunur.
- Medya kart yakınına gelince yüklenir. Önceki kartlar kaldırılınca istek iptal edilir, videolar durdurulur ve blob URL'leri bırakılır. Medya hatasında tekrar dene sunulur. Aynı anda başlayan diğer videolar durdurulur. Akış yenileme ve hesap değişiminde eski yanıtlar uygulanmaz.
- Odalarda ad/ID arama, şifresiz oda filtresi, kalabalık/ad sıralaması ve sonuç sayısı. Kişilerde ad arama, 5/25/100 km ve ad/mesafe sıralaması. Bu filtreler yalnız sunucunun zaten yetkilendirip döndürdüğü mevcut snapshot'a uygulanır; küresel bütün kullanıcıları arama iddiası yoktur. Canlı snapshot yenilense de filtreler korunur. Ana sayfa oda görünümü korunur.
- Hesap değişimi/çıkışında özel akış ve kişi/oda listeleri temizlenir. Eski profil yanıtları da yeni profil/oturumun üstüne yazamaz.
- Eski /v1/posts/feed istemcileri aynı gizlilik kurallarını kullanır. Doğrudan medya adresi artık beğeni/yorum ile aynı _social_access kontrolünden geçer; pasif veya banlı yazar medyası açılamaz.

## Şema ve sürüm

Üç ek tablo: explore_saved_posts, explore_hidden_posts, explore_muted_authors. Her biri kullanıcı+hedef birleşik anahtarına sahiptir; tekrar PUT/DELETE aynı sonucu verir. Kayıtlar kullanıcıya özeldir ve mevcut FK cascade mekanizmasına bağlıdır. Para/ödül mutasyonu yoktur, mevcut kolonlar değişmez. Startup create_all modelleri kaydeder. /ready yeni tabloları ve yolları kontrol eder; /health içinde explore_api_version bulunur. Korumalı /v1/explore/readiness ayrıca kontrol edilebilir.

API ve web birlikte explore-workspace-v1-20261023 sürümüne alınmalıdır. Frontend script/CSS cache anahtarları yenilendi. Eski API yeni web ile çalıştırılmamalıdır.

## Kontroller

15 yeni Python testi gerçek API/SQLite ile gizlilik, idempotent tercih, ban/cihaz banı, eski feed/medya handler'ı, aynı tarihli sayfalama, yeni araya giren kayıt, filtre/cursor uyumsuzluğu, toplu sayılar ve eksik şema/route kontrollerini kapsar. Yönetim regresyonlarıyla toplam 48 Python testi ve 58 subtest geçmiştir. 16 jsdom testi gerçek DOM olayları ve taklit HTTP ile akış, filtre, kaydetme/hata/geri alma, medya iptali, oturum değişimi ve oda/kişi araçlarını doğrular. Sözdizimi ve git diff kontrolü başarılıdır.

Gerçek tarayıcı/cihaz kamera testi, PostgreSQL eşzamanlılık/yük testi veya canlı mutasyon yapılmadı. Mevcut kamera tarayıcı testinin yeni feed endpoint taklidi güncellendi, test bu ortamda çalıştırılmadı. Yayın öncesi staging'de iki hesapla takipçi/engel/kaydetme, büyük akış performansı ve iki tema/dar ekran kontrol edilmelidir. Story görüntüleyen/yorum altyapısı bu paket kapsamında yeniden tasarlanmadı.

Kurucu güncel taban ve önkoşul hashlerini denetler; farklı dosyanın üzerine yazmadan durur. Depo klonlamadan tek dal/commit ve taslak PR açar, birleştirme/dağıtım yapmaz. API/web SUCCESS sonrası `python scripts/verify-explore-release.py` salt okunur sürüm/readiness/korumalı yollar/modül kontrolünü çalıştırır. Yetkili hesap içi testi bunun yerine geçmez.
