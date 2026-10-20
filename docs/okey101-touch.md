# Dokunmatik 101 Okey masası — 21 Ekim 2026

İki sıralı ahşap ıstakada 30 yer bulunur. Taş boş yere sürüklenerek araya boşluk konabilir; dolu yerin üstüne bırakılırsa iki taş yer değiştirir. Bu düzen sunucu yenilemelerinde korunur. Seri diz ve Çift diz yerleşimi yeniden sıralar.

Kapalı deste veya önceki oyuncunun son taşı ıstakaya sürüklenerek çekilir. Kendi atış alanına sürüklenen tek taş atılır. Bir pere taş işlemek için taş doğrudan o pere bırakılır; birden fazla geçerli hedef varsa kullanıcıdan seçim istenir. Birlikte açılacak taşlara dokunarak seçim yapılır ve seçili per masa üzerindeki açılış alanına sürüklenir. Normal per türü otomatik seçilir; gerçek okeyin temsil ettiği renk/sayı ve açılış onayı düzenleyicide kontrol edilir. Açılış taslaklarının açılması sunucu onayına bağlıdır.

Günlük çekme/atma düğmeleri Diğer işlemler altında erişilebilir kalır. Masada oyuncular çevreye, seri/grup ve çift perleri ortaya yerleştirilir. Taş renkleri ve Lidya açık/koyu temaları korunur; oda sohbeti ayrı alanda kalır.

Pointer Events telefondaki dokunma ve bilgisayardaki fare için kullanılır. Yarım bırakılan hareket, ekranın kapanması, yeni el ve hareket sırasında gelen yeni sunucu durumu sürüklemeyi iptal eder. Sıra, çekme/atma aşaması ve bekleyen istek kontrol edilir; sunucu kuralları ve Lidya işlemleri değişmez. Geçersiz bir yere bırakma sunucu hamlesi üretmez.

## Doğrulama

- `python tests/test_okey101_room.py`: 6 test geçti.
- `node tests/okey101-room.browser.cjs`: gerçek oda kodu ve üretim CSS ile 18 ekran/tema durumu; taş renkleri, dokunma yerine masaüstü seçim/sıralama, çekme/atma, tek istek, aynı anahtarla yeniden deneme, izleyici, sohbet geçmişi, mesaj gönderme, puanlar, kurallar, lobi, tekrar açma ve odadan çıkış kontrolleri.
- `node tests/okey101-touch.browser.cjs`: aynı gerçek oda üzerinde Chromium dokunmatik olayları; boş yere taşıma, iptal, sürükleyerek atma, yanlış sıra, kapalıdan/soldan çekme, açık pere işleme, çoklu taş seçerek per hazırlama, sunucu güncellemesinin sürüklemeyi iptal etmesi; 8 ekran/tema durumunda ıstakanın sığması.
- JavaScript ve kurulum kabuğu sözdizimi, `git diff --check`, paket uygulama/çakışma koruması ve ZIP bütünlüğü kontrol edilir.

Tarayıcılar kontrollü API/WebSocket yanıtları kullanır. Fiziksel Android cihaz, APK ve canlı dört oyunculu ağ/RTC testi yapılmadı. Üretime dağıtım yapılmadı; kurulum komutu incelemeye açık taslak PR oluşturur. Aynı dosyalar değişmişse kurulum hiçbir dosyaya yazmadan durur.
