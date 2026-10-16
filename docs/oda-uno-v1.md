# ErisChat oda UNO v1

UNO, Oda Merkezi menüsünden açılır. Genel oyunlar menüsünde bulunmaz.
İlk dört oda koltuğu oyuncudur; diğer oda üyeleri izleyebilir. Katılım ücretsizdir, Lidya kesilmez.

## İlk sürüm

- 2 veya 3 kişi bireysel; 4 kişi bireysel veya eşli (1+3 / 2+4).
- 108 kart; oyuncu başına 7 başlangıç kartı.
- Pas, yön değiştirme, +2, renk jokeri, +4 ve özel başlangıç kartları.
- İki kişide yön değiştirme pas gibi çalışır.
- Çekme cezası biriktirme kapalıdır; uygun kart yoksa yalnızca bir kart çekilir.
- Çekilen kart uygunsa oynanabilir veya pas geçilebilir. Çekmeden önce eldeki kartlar sonradan oynanamaz.
- UNO düğmesi kart atılmadan hazırlanabilir. Unutulan UNO, sonraki kart atma/çekmeden önce yakalanırsa 2 kart cezası verir.
- +4 blöfü ve itirazı; kontrol eli yalnızca itiraz edene gönderilir.
- Hızlı tek el veya 500 puanlık maç. Eşlide bir ortağın bitirmesi takımı kazandırır.
- Kartlar ve deste sırası sunucuda tutulur; izleyiciye el gönderilmez.
- 20 saniye hamle süresi. Süre dolunca kart çekilip sıra geçer.
- Bağlantı/koltuk kaybında 60 saniye dönüş süresi, ardından bot. Aynı oyuncu koltuğuna dönünce elini geri alır.
- Oda içinde yalnızca bir aktif oyun: Ludo / 101 Okey / UNO karşılıklı olarak engellenir.
- X yalnızca görünümü kapatır. Kurucu veya oda yönetimi masayı iptal edebilir.
- Lobi ve eller arasındaki bekleme 10 dakikada kapanır.

## Sunucu

`GET/POST /v1/rooms/{room_id}/uno`. Yeni SQL tabloları `room_uno` ve `room_uno_receipts`,
mevcut `Base.metadata.create_all` açılış akışıyla oluşturulur. Ortam değişkeni veya yeni bağımlılık gerektirmez.
Oda satırı kilidi hamleleri sıralar; sürüm/oyun kimliği eski hamleleri reddeder. İstek anahtarı tekrarlarında hamle ikinci kez yapılmaz.
Oyunlar veritabanında kalır; sunucu yeniden başlatıldığında zamanlayıcı devam eder.

## Doğrulama

```sh
python -m unittest discover -s backend/tests -p 'test_uno*.py' -v
node frontend/tests/room-uno.test.cjs
node --check frontend/room-uno.js
```

33 Python testi ve 120 otomatik oyun; deste bütünlüğü, 2–3–4 kişilik akışlar, eşli bitiş,
+4 itirazı, UNO yakalama, gizli el projeksiyonu, kayıt/yeniden okuma, süre ve bot dönüşü doğrulandı.
SQL testleri SQLite ve izole oda/yetki bağımlılıklarını kullanır; canlı PostgreSQL kilit eşzamanlılığı ve üretim kimlik doğrulaması bu testlerde çalıştırılmaz.
Ön yüz durum testleri minimal DOM adaptörüyle seçenekler, joker/UNO isteği, sonuç ekranı, kapanış ve oda değişimini doğrular.
Bu ortamda Chromium indirilemediği için gerçek tarayıcı görünüm kontrolü tamamlanamadı.

## Canlı kontrol

API ve web dosyaları aynı sürümle dağıtılmalı. Odaya iki hesapla girip 1 ve 2. koltuğa oturun;
Oda Merkezi → UNO → Masayı kur → Hazırım → Oyunu başlat.
Sonra üç kişilik tekliyi ve dört kişilik eşliyi deneyin. Oda sohbeti, mikrofon, koltuk menüsü,
telefon klavyesi, X sonrası yeniden açma ve yeniden bağlantı ayrıca gerçek cihazda kontrol edilmeli.
Android uygulaması yerel paketlenmiş web dosyaları kullanıyorsa APK yeniden derlenmelidir.
