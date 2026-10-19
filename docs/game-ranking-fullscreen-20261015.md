# Lidya oyun sıralaması — tam ekran görsel menü

Önceki pencerede 7 oyun butonu ve geri kalanlar için açılır liste vardı. Yeni menü 20 bağımsız oyunu her genişlikte iki sütunlu, 2:1 görsel butonlarla gösterir. Oda oyunları mevcut sıralama API listesine dahil değildir.

Her oyun için açık ve koyu temada ayrı PNG üretildi: 40 gerçek görsel, her biri 1774×887. Yerleşim: solda gerçek HTML oyun adı/açıklaması, sağda oyuna özel altın işlemeli görsel; tema değişiminde doğru PNG seçilir. Tüm üretim promptları, boyutlar ve SHA-256 özetleri frontend/assets/lidya-ranking-v2/manifest.json dosyasındadır. Görseller yerleşik imagegen ile üretildi; kodla çizilmiş simgeler değildir.

Açık tema fildişi/şampanya mermer ve altın; koyu tema zümrüt/yeşil mermer ve altın kullanır. Gerçek buton odağı, basma durumu, en az iki sütun, 2:1 kart oranı, safe-area ve dinamik pencere yüksekliği kullanılır. Dekoratif PNG’ler gecikmeli ve asenkron yüklenir. Başlıklar görselin içine gömülmediği için okunabilir ve erişilebilirdir.

Oyun araması Türkçe karakterleri ve ASCII karşılıklarını bulur. Tümü/Klasik/Slotlar filtreleri 20/7/13 oyunu gösterir. Bir kart seçilince aynı tam ekran içinde o oyunun Bu saat/Günlük/Haftalık/Aylık sıralaması açılır. Geri/Oyun değiştir oyun seçimine döner. Escape önce oyun seçimine, ardından kapanışa gider. Kapanış önceki odağı geri verir; tema dinleyicisi ve gözlemcisi temizlenir. Native dialog.close olayı da temizlenir.

Ödenmiş toplam kazanç, ilk 50, profil/avatar/çerçeve ve kişisel kazanç mevcut API’den gelir. Yeni filtreler kazanç hesabını veya bahisleri değiştirmez. Boş sonuç, yükleme ve yeniden deneme durumları bulunur. Eski/geç gelen API yanıtları güncel ekranı ezemez; kullanıcı metinleri HTML olarak işlenmez.

## Doğrulama

`ERIS_DOM_MODULE=/path/to/node_modules/linkedom node tests/game-ranking-dom.test.cjs`

Linkedom 0.18.13 ile DOM testi geçti: 20 doğru API adresi, 7/13 kategori, Türkçe/ASCII arama, eski yanıt yarışı, kapanmış pencereye geç gelen yanıt, 50 kayıt sınırı, açık/koyu kart ve coin güncellemesi, hata/tekrar deneme/boş sonuç, güvenli kullanıcı adı, profil açılışı, Escape/geri, odağın geri verilmesi, gözlemci temizliği. Aynı test 40 PNG’nin imzasını, 2:1 oranını ve SHA-256 özetini doğrular; CSS ayrıştırıcısında 87 kural okunur. Değişen JavaScript dosyaları node --check ile doğrulandı.

Bu DOM testi yerleşim motoru veya gerçek cihaz testi değildir. Yerel Chromium indirmesi tamamlanamadı; bulut tarayıcısı yerel önizleme sunucusuna erişemedi ve file URL açılması güvenlik ilkesiyle engellendi. Bu nedenle canlı piksel/telefon ekran görüntüsü testi yapılmış gibi raporlanmaz. Tam menünün elle önizlemesi için tests/game-ranking-preview.html, kendi tarayıcınızda veya repo kökünden bir HTTP sunucusu ile açılabilir; bu sayfada örnek sıralama verisi kullanılır. Üretim sayfası gerçek API’yi kullanır.

Termux kurulum betiği ayrı yerel Git deposunda çalıştırılarak dosya bütünlüğü, temiz commit, yerel branch push ve taslak PR argümanları doğrulandı. Görseller metin yamaya dönüştürülmez; ZIP payload içinden hash doğrulamasıyla kopyalanır. Böylece büyük binary patch uygulama belleği kullanılmaz.
