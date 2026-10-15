# Kayıt ekranı: logo, kullanıcı sözleşmesi ve seçilen ödül

Logo: ekran görüntüsündeki görünmezliğin nedeni açık zeminde `mix-blend-mode:screen` kullanılan beyaz eski görseldi. Mevcut Lidya light/dark PNG logolarına geçildi; normal karışım ve contain kullanılır. Kart kısa ekranlarda kayar; sözleşme ayrı yüzen modal içinde kayar. Oyun pencerelerinin kaydırma kuralı değiştirilmez.

Akış: ilk adımda doğum tarihi ve sözleşme onayı gerekir. İşaret kutusu veya metin düğmesi sözleşmeyi açar. Metnin sonuna ulaşmadan onay düğmesi açılmaz. İptal veya yükleme hatası onay üretmez. İkinci adımda cinsiyete uygun standart avatar ve çerçeve seçilir; VIP dışarıda bırakılır. Geri dönüşte seçim korunur. Yeni sürüm digest'i sunucuyla eşleşmezse onay sıfırlanıp yeni metin açılır.

Sunucu: 18 yaş sınırı Türkiye tarihine göre hesaplanır. Bu beyana dayalı kontroldür; kimlikle yaş doğrulama yapıldığı anlamına gelmez. Sözleşme sürümü, SHA256 özeti ve sunucu onay zamanı users üzerinde saklanır. Yeni alanlar nullable eklenir; geçmiş kullanıcılar için onay uydurulmaz. Yeni onboarding payloadları sözleşme ve iki seçim olmadan kabul edilmez. Backend önce/aynı anda dağıtılmalıdır; eski önbellekli kayıt istemcileri yeni şartları sağlamadığında kayıt tamamlayamaz.

Seçilen iki ürün onboarding işlemiyle ücretsiz, kalıcı sahiplik olarak eklenip takılır. Hoş geldin işlemi artık ilk ürüne dönmez; seçilmiş ürünü korur ve mevcut 500 Lidya hediyesini bir kez verir. Aynı kullanıcı için satır kilidi ve populate_existing kullanılır. İstek tekrarında ikinci hediye verilmez. Geçersiz seçimde işlem rollback olur. Tekrar onboarding ile başka ürün edinilemez.

Metin: `backend/app/legal/user-agreement.json`; herkese açık `GET /v1/legal/user-agreement`. Sözleşme, 18+, şans temalı oyunlar, sanal bakiye riski, nakde çevirme yasağı, içerik/hesap kuralları, ücretli ürünler, fikri haklar, moderasyon/itiraz, gizlilik ve kanuni hakları kapsar. Pazarlama veya kişisel veri açık rızası sözleşmeyle alınmaz. Kullanıcı sorumluluğu platformun kanuni sorumluluğunu ortadan kaldırmaz.

Hukuki sınır: Bu metin uygulamaya göre hazırlanmış sözleşme taslağıdır; hukuki uygunluk veya oyunların yasal niteliği hakkında sertifika değildir. Yayın öncesi avukat incelemesi, gerçek işletmeci unvanı/adresi/iletişim bilgileri ve ayrı KVKK aydınlatmasının tamamlanması gerekir. İşletmeci bilgileri verilmediği için uydurulmadı. Satın alma ön bilgilendirmesi ve gerekiyorsa ayrı dijital ifa beyanı bu kayıt onayının yerine geçmez.

Kaynaklar: KVKK Kurulu 18.02.2026/347 duyurusu: https://www.kvkk.gov.tr/Icerik/8710/veri-sorumlulari-tarafindan-acik-riza-ve-aydinlatma-metinlerinin-ayri-ayri-duzenlenmesi-gerektigi-hakkinda-kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu ; Ticaret Bakanlığı haksız şart rehberi: https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/tuketici-sozlesmelerindeki-temel-ilkeler-ve-haksiz-sartlar-hakkinda-bilgilendirme .

Testler: gerçek route fonksiyonları ve modellerle izole FastAPI/SQLite testleri; 16 vaka. Gerçek frontend scriptiyle sözleşme/scroll/offline/iptal/18 yaş/seçimler/sürüm değişimi/tema/cleanup DOM testi. Kullanıcı adı regresyon testi. Gerçek cihaz piksel testi ve PostgreSQL paralel işlem testi yapılmadı; Java/APK kodu değişmedi. Bu güncelleme için yeni APK zorunlu değildir; web ve API dağıtımı gerekir.
