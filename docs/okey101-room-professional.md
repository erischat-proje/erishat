# 101 Okey oda ekranı ve sohbet düzeni

101 taşlarının rengini beyaza çeviren genel oda stili oyun içinden çıkarıldı. Dört renk, renk simgeleri, gerçek/sahte okey etiketleri ve seçili taş durumu eklendi. Genel açık tema stillerinin yeşil masayı ve ahşap ıstaka yazılarını boyaması engellendi.

Oyun alanı kendi sohbet yüksekliğini kullanır. Istaka ile ana hamleler görünür kalır; ortak masa ayrı kaydırılır. Masa/açılan perler sekmeleri, dokunarak sağa/sola taşıma, seçim temizleme, per hazırlama, sıra açıklaması ve işlem bekleme durumu eklendi. Dar yatay ekranda sohbet yan sütuna geçer. Klavye ile kısalan dikey ekranda oyun alanı kaydırılarak erişilebilir kalır. Per taslakları ve ek araçlar gerektiğinde kendi alanında kaydırılır.

Oda sohbetindeki geçmiş düğmesi başlık satırına taşındı. Mesaj yazma araçları tek satırda tutulur; dar yatay sohbet sütununda iki satır kullanılır. Geçmiş okunurken yeni mesajlar okuyucuyu aşağı sürüklemez. Yeni mesaj düğmesi sona döndürür. Yeniden bağlanmada eldeki geçmiş korunur; eski mesaj ekleme konumu muhafaza eder. Boyut değişimleri ve sonradan büyüyen balonlar sondayken takip edilir. IME yazımı sırasında Enter erken gönderim yapmaz.

Yeni oyun ayarlarının katılım payı değiştirilince sıfırlanması düzeltildi. İzleyicinin ilk oyuncuyu “Sen” olarak görmesi düzeltildi. Gönderim sırasında düğmeler hemen kilitlenir; geçici hata tekrarında aynı istek anahtarı korunur. Oyun/oda kapatma ve yeniden açma akışı korunur.

## Doğrulama

- `python tests/test_okey101_room.py`: 6 sunucu motoru testi. 106 fiziksel taş, 280 dağıtım, renk/yüz eşlemesi, gerçek/sahte okey, el gizliliği, yanlış sıra, çekme/atma, per doğrulaması ve 16 adet üç ellik tekli/eşli maçta taş korunumu.
- `node tests/okey101-room.browser.cjs`: gerçek oda ve 101 kodu, üretim CSS dosyaları, kontrollü API/WebSocket yanıtları. 320×640, 360×740, 393×820, 430×932, 768×1024, 1024×768, 844×390, 640×360, 393×450; açık/koyu temayla 18 durum. Her durumda iki satırlık en az iki mesaj görünürlüğü, taş renk/dolgu stilleri ve örtüşme kontrol edildi.
- Tarayıcı akışları: çoklu seçim, dokunarak sıralama, çekme/atma, çift işlem engeli, aynı anahtarla tekrar, izleyici görünümü, masa kaydırma, geçmiş konumu, yeni mesaj, mesaj gönderme, kurallar, puanlar, sonuçtan lobiye dönüş, ayarların korunması, hazır olma, yeniden açma ve çıkış.
- JavaScript sözdizimi ve `git diff --check` geçti.

Tarayıcı testi canlı sunucuya bağlanmaz; gerçek çok kullanıcılı ağ ve cihaz RTC testi yapılmadı. Oyun kuralları, para işlemleri ve veritabanı şeması değiştirilmedi.
