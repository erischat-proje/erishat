# Beğenilen sıralama kartlarının ana oyun menüsüne uygulanması

Taban: auth-unified-v1, #279 sonrası. Yeni PNG üretilmedi; frontend/assets/lidya-ranking-v2/light ve dark altındaki aynı 40 görsel yeniden kullanılır. PNG dosyaları bu yamada kopyalanmaz veya değiştirilmez.

Ana menünün 20 bağımsız oyunu, sıralamadaki gibi iki sütunlu 2:1 kartlara dönüştürüldü. Solda gerçek oyun adı ve kısa açıklama, sağda oyuna özel görsel, altın vurgu ve Oyna çağrısı bulunur. Açık tema fildişi/şampanya, koyu tema zümrüt/altındır. Erişilebilir kart adları, klavye odağı, azaltılmış hareket, taşmaya dayanıklı metinler ve gecikmeli PNG yükleme kullanılır. Oda oyunlarının menülerine dokunulmaz.

Ortak menü üreticisi ile 12 özel menü betiği (Aztek/Ares aynı betikte) aynı görsel yoluna yönlendirildi. Böylece eski MutationObserver kurucuları eski kapakları geri getirmez. Oyun menüsü yeniden çizildiğinde kartlar tekil kalır, tema tekrar doğru uygulanır. Son yüklenen ve yalnız #games menüsünü etkileyen CSS, eski görünüm kurallarını geçersiz kılar. Ortak eg-launcher-card / pg-cover / eg-lc-play yapısı korunur.

Bahisler, ödeme matematiği, sıralama verisi ve oyun başlatma yönlendirmeleri değiştirilmedi. Mevcut yakalama aşamasındaki custom-game-routing koruması kullanılır; özel oyunlar klasik çarka düşmez.

## Doğrulama

`ERIS_DOM_MODULE=/path/to/node_modules/linkedom node tests/game-menu-ranking-art.test.cjs`

Linkedom 0.18.13 içinde gerçek ana menü üreticisi, ortak PNG betiği ve 12 gerçek özel menü kurucusu birlikte çalıştırıldı. 20 tekil kart; her kartta tek kapak ve tek metin grubu; açık/koyu/açık tema döngüsü; pencere olayı olmadan tema özniteliği değişimi; yeniden çizimden sonra tekillik; sonlanan gözlemci kuyruğu doğrulandı. 20 oyunun her biri için tarayıcının capture sırası canlandırılarak doğru açılışın yalnız bir kez gerçekleşmesi sınandı. Bu, gerçek tarayıcı etkileşim testi değildir.

Önceki sıralama DOM testi de geçti. Değişen JS dosyaları node --check ile ayrıştırıldı; yeni CSS ayrıştırıldı. Gerçek cihaz/piksel yerleşim kontrolü yapılmadı; önceki ortamda tarayıcı önizlemesi kullanılamıyordu. Backend değişmediğinden matematik simülasyonları tekrarlanmadı.

Termux kurulum betiği ayrı yerel Git deposunda çalıştırıldı: önce/sonra dosya hashleri, temiz commit, yerel dal gönderimi ve draft/auth-unified-v1 PR argümanları doğrulandı. Gerçek GitHub yazma işlemi testte taklit edildi. Kurulum #279 birleştirilmiş kaynak sürümünü bekler; farklı kaynak dosyalarını üzerine yazmadan reddeder.
