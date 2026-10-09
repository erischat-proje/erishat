# UNO v2 — bahis ve ortak oda ekranı

UNO menüden açıldığında ortak lobi kurulur. Odadaki üyeler ve sonradan girenler aynı aktif masayı görür.
İlk dört koltuk oyuncu, diğer üyeler izleyicidir. Aktif UNO ekranı kişisel X ile gizlenmez;
kurucu veya oda yönetimi masayı iptal edebilir. İzleyicilere kart elleri gönderilmez.

Kurucu, kimse hazır değilken tekli/eşli, hızlı/500 puan ve ortak bahis tutarını seçer.
Bahis seçenekleri 50, 100, 150, 200, 250 ve 300 Lidya'dır. Masayı açmak veya izlemek Lidya kesmez.
Oyuncu tutarı gösteren Hazırım düğmesine bastığında bahis bakiyesinden ayrılır.
Hazırdan çıkarsa tutar iade edilir. Hazır oyuncu varken masa ayarları değiştirilemez.

Tekli maçın kazananı tüm havuzu alır. Eşlide kazanan iki oyuncu havuzu eşit paylaşır; komisyon yoktur.
500 puanlı maçta ödeme sadece maçın sonunda yapılır; sonraki el için ikinci bahis alınmaz.
İptal, lobi süresinin dolması, lobide koltuktan ayrılma ve çift odasının kapanması uygun bahisleri iade eder.
Başlamış oyunda ayrılanın koltuğunu bot devralır; tek taraflı oyun terkinde bahis iadesi yapılmaz.

Kayıtlı kullanıcı bakiyeleri önce kimlik sırasıyla kilitlenir, sonra oda satırı kilitlenir.
Tahsilat/iade/ödeme ve UNO kaydı aynı veritabanı işlemiyle tamamlanır. Tekrar istekleri yeniden para taşımaz.
Sonuç settled işaretiyle bir kez ödenir/iade edilir. Yeni SQL tablosu veya ortam değişkeni gerekmez.
Dağıtımdan önce açık eski ücretsiz UNO masaları ücretsiz kurallarıyla tamamlanabilir; yeni masalar bahisli kurulur.

UNO modunda sohbet alanı ekranın yaklaşık %20'sine indirilerek sohbet başlangıcı aşağı taşınır;
mesaj kutusu ve mikrofon denetimleri oda içinde kalır. Ana UNO yüzeyi kaydırılmaz.
Kartlar yedişerli gösterilir; fazla kartlara ok düğmeleriyle geçilir. Kurallar ve +4 kontrolü ayrı bilgi yüzeyindedir.

Doğrulama: 47 Python testi, 120 otomatik oyun ve Node ön yüz durum testleri geçti.
Testler tahsilat, tekrarsız ödeme/iade, yetersiz bakiye, ayar kilidi, zamanlayıcı ödemesi,
500 puan, ortak açılış, izleyici/sonradan katılım, kart sayfaları ve gizli elleri kapsar.
SQL testleri SQLite ve izole oda/yetki bağımlılıkları kullanır; canlı PostgreSQL eşzamanlılığı test edilmedi.
Gerçek tarayıcı çalıştırılamadığı için telefon yerleşimi, klavye, koltuk ve mikrofon etkileşimleri cihazda doğrulanmalı.

API ve web birlikte güncellenmelidir. Yerel web dosyaları içeren Android APK yeniden derlenmelidir.
