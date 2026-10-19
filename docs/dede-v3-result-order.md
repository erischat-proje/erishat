# Dede v3: sonuçları animasyon sonunda göster

Sorun: API makbuzu gelince `runtime.state` ve bakiye güncelleniyordu; `update()` bu durumu patlama/takla animasyonundan önce Tur kazancı ve bakiye alanına basıyordu. Ayrıca takla birikimi patlama beklenmeden status'a yazılıyordu.

Sunucu makbuzu güvenle alınır/saklanır; sadece sunum değerleri ayrı tutulur. Bahis düşüldükten sonraki kazanç öncesi bakiye görünür; kazanç kredisi ve Tur kazancı finaline dek gizlidir. Bonusun önceki toplamı kalır, yeni dönüşün sonucu eklenmez. Sıra: dağıtım -> eşleşme parlaması -> patlama -> kalan/yeni sembol düşüşü -> varsa yeni patlamalar -> çarpan toplama -> kazanç sayacının artışı -> sonuç/büyük kazanç/bonus geçişi. Patlama bitmeden takla birikimi de görünmez. Yeni bonus göstergeleri de dağıtım sırasında eski görünümde tutulur, sonuç açıklanınca açılır. Sonuç bilgisi sıfır/kayıp dönüşlerde de dağıtım sonrasında açıklanır.

Görsel ekler: istek beklenirken hareket, daha uzun ve aralıklı sütun düşüşü, eşleşme çerçevesi, altın parçacıklar, hafif patlama sarsıntısı, küre enerjisi, Dede asa şimşek ışını, 650ms yumuşak kazanç sayacı. Reduced-motion hareketleri atlar fakat aynı gösterim sırasını korur. Var olan PNG'ler kullanılır; matematik/bakiye API'si değiştirilmez.

Doğrulama: iki temada gerçek zamanlı (reduced-motion kapalı) kontrollü, birden fazla taklalı ve çarpanlı kazanç. API sonucu hazır olmasına rağmen patlama ve küre uçuşunda Tur kazancı sıfır, bakiye kazanç öncesi kaldı. Faz sırası patlama < toplama < sayaç < sonuç ve tam final değerleri doğrulandı. Önceki iki tema × dört viewport, satın alma, otomatik bonus, durdur/devam ve kapatma testleri de yeni sürümle çalıştırıldı. Testlerde yerel API kullanıldı; canlı cüzdana istek gönderilmedi.
