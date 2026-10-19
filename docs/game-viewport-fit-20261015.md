# Oyun pencerelerinin ekrana uyumu

Kapsam: Dede, Prenses, Şeker, Balıkçı, Dog Party, Candy, Kovboy, Bastet, Altın, Küre, Firavun, Aztek ve Ares özel oyunları; Şans Çarkı, Crash, Blackjack, Slot, Dört Kupa, At Yarışı ve Kasa ortak/klasik pencereleri.

Ekran görüntülerindeki sorunlar: durum çubuğuyla üst başlığın çakışması, genişliğe göre hesaplanan tahtanın dikey boşluğu dikkate almaması, sahnenin gereksiz büyümesi ve alttaki bahis kısayollarının kesilmesi.

Ortak viewport modülü visualViewport değişimini, yön dönüşünü, oyunların sonradan açılmasını ve sahnenin yeniden boyutlanmasını izler. Tahtalar en-boy oranı korunarak kalan alana sığar. Dekoratif başlık kısa ekranlarda sadeleşir; kontroller korunur. Alan yine yetmezse tüm kontrol yüzeyi birlikte küçültülür. Oyun pencerelerinde kaydırma açılmaz; mevcut iç kaydırma alanlarının yükseklik sınırı kaldırılır ve yüzey bütünüyle sığdırılır. Açık/koyu tema renkleri ve mevcut oyun davranışları korunur.

Android: yeni APK'da WebView sistem çubuklarının gerçek boşlukları dışında yerleştirilir. Eski ErisChatAndroid APK'sında web katmanı 28px üst/24px alt yaklaşık koruma payı kullanır; iframe içinde bu pay tekrarlanmaz. Tam cihaz uyumu için yeni APK kurulmalıdır. Eski APK payı her cihazda kesin ölçüm değildir.

Doğrulama: 56 viewport/native/iframe kombinasyonu, altı tahta oranı, 11 DOM oyun örneği, resize, dinamik açılış/kapanış ve taşma ölçeklemesi testi; mevcut 20 oyun menüsü ve sıralama DOM regresyon testleri. DOM testlerinde gerçek tarayıcı yerleşim motoru yoktur; telefonda piksel düzeyinde görsel kontrol yapılmadı. Android Gradle dağıtımı ortamda bulunmadığı ve indirilemediği için APK derlemesi doğrulanamadı.

Kazanma matematiği, bahis sınırları, sunucu ücretleri ve bonus durumları değiştirilmez.
