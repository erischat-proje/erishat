# Dede matematiği ve entegrasyonu

Dede, ErisChat için özgün Lidya görselleri ve açık matematik kullanan 6 sütun × 5 satır pay-anywhere oyunudur. Aynı normal sembolden herhangi bir yerde 8+ varsa ödeme yapar; komşuluk aranmaz. Orijinal Gates of Olympus'un gizli reel şeritlerini veya sembol ağırlıklarını kopyaladığı iddia edilmez.

## Ödeme tablosu (temel bahis katı)

| Sembol | 8–9 | 10–11 | 12–30 |
|---|---:|---:|---:|
| Mavi taş | 0.25 | 0.75 | 2 |
| Yeşil taş | 0.4 | 0.9 | 4 |
| Sarı taş | 0.5 | 1 | 5 |
| Mor taş | 0.8 | 1.5 | 8 |
| Kırmızı taş | 1 | 2 | 10 |
| Kadeh | 1.5 | 2 | 12 |
| Yüzük | 2 | 5 | 15 |
| Kum saati | 3 | 10 | 25 |
| Taç | 10 | 15 | 50 |

Dede scatter: 4/5/6 adet için 3×/5×/100× doğrudan ödeme ve 15 ücretsiz dönüş. Scatter ödemesi kürelerle çarpılmaz. Birden fazla kazanan normal sembol aynı taklada ayrı ayrı ödenir. Semboller kendi sütunlarında aşağı düşer, üst boşluklar yeniden doldurulur. Küreler ve scatterlar dönüş bitene kadar kalır; küre bir kez sayılır.

## Olasılık modeli

Tüm değerler `backend/app/dede-math.json` içinde sabittir. Kullanıcı, bakiye, geçmiş kazanç veya kayba göre olasılık değişmez.

Her başlangıç hücresi önce sabit ağırlıklarla normal sembol veya çarpan küresi seçer. Sonra scatter sayısı seçilir ve bu kadar farklı, eşit olasılıklı hücre scatter ile değiştirilir. Normal oyunda bonus tetikleme Bernoulli olasılığı tam 1/448, şans artırmada 1/224; tetiklediğinde 4/5/6 scatter ağırlıkları 985/14/1'dir. Tetiklenmeyen başlangıçlar 0/1/2 scatterı 55/35/10 ağırlığıyla seçer. Bu, her hücrenin scatter olasılığını ikiyle çarpan bir model değildir: bonus olasılığını ikiye katlayan açık bir Dede modelidir. Takla doldurmaları yalnızca normal sembol/küre seçer, yeni scatter eklemez. Ücretsiz başlangıçlar 1/100 olasılıkla 3 scatter verir (+5 dönüş), aksi halde 0/1/2 dağılımını kullanır.

Çarpan değerleri 2,3,4,5,10,15,20,25,50,100,250,500; ağırlıkları JSON'dadır. Kayıp dönüşte küreler havuza eklenmez. Normal dönüşte takla kazancı × max(1,kürelerin toplamı). Bonus kazanan dönüşünde küreler global havuza eklenir ve takla kazancı × max(1,havuz). İstenen Dede kuralı gereği sonraki kazanan bonus dönüşünde yeni küre olmasa bile havuz uygulanır. Bazı orijinal oyun sürümlerinin yeni küre şartından farklıdır.

Bahis 20–10.000 Lidya ve 20'nin katı: bütün ödemeler tam sayı Lidya olarak kesin hesaplanır. Python motoru bahsin yüzde biri biriminde tamsayılarla çalışır; eksik ödeme veya yuvarlama kaybı yoktur. Ante bedeli temel bahsin 1.25×'i; ödemeler temel bahis üzerinden. Bonus satın alma 100× temel bahis ve doğrudan 15 ücretsiz dönüş; giriş scatter ödemesi yoktur. Ante ile bonus satın alma birlikte kullanılamaz.

5.000× sınırı ücretli dönüş + tetiklenen bütün ücretsiz dönüşler için toplamdır. Bonus satın almada sınır satın alma bedelinin değil temel bahsin 5.000×'idir. Kazanan taklada sınır kesinleştiği an doldurma durur; kalan ücretsiz dönüşler sona erer. Olağandışı 1000+ takla limiti hataya düşer ve işlem geri alınır; sonucu gizlice farklı ödeme yapan bir kısayol yoktur.

## Bağımsız doğrulama

Kalibrasyon örnekleri rapora katılmadı. Son sabit yapılandırma ile 18 milyon tam tur ve tüm bonus dönüşleri/retriggerlar simüle edildi. Aşağıdaki aralıklar yaklaşık %95 Monte Carlo güven aralıklarıdır; sertifikalı veya analitik kesin RTP değildir. Yüksek oynaklık nedeniyle çok sayıda turda bile örnekleme belirsizliği vardır.

| Mod | Tam tur | Ölçülen RTP | Yaklaşık %95 aralık |
|---|---:|---:|---:|
| Normal | 8,000,000 | %96.286 | %95.665–%96.906 |
| Şans artırma | 8,000,000 | %96.419 | %95.772–%97.066 |
| Bonus satın alma | 2,000,000 | %96.590 | %96.425–%96.756 |

Normal mod ödeme sıklığı %27.5567, ücretin üzerinde ödeme sıklığı %14.1667. Ölçülen bonus sıklığı 1/446.58; yapılandırılan olasılık 1/448. Şans artırma ölçümü 1/225.59; yapılandırılan olasılık 1/224. Normal tam tur standart sapması 8.956 bahis birimi. Maksimum limit normalde 1 ve satın alınmış bonuslarda 17 kez gözlendi. Detaylı histogram, net kâr frekansı, tohumlar ve yapılandırma SHA256 JSON raporundadır.

Yeniden çalıştırma: `node tests/dede-simulate.cjs base 8000000 314159 result.json` (ante: 8000000/271828, buy: 2000000/161803). İstatistik simülasyonu cüzdan API'sine bağlanmaz. Referans RNG Mulberry32 yalnızca yeniden üretilebilir test içindir; canlı Python motoru `secrets.SystemRandom` kullanır. Python/JS motorları 120 aynı rastgele sayı iziyle tam eşleşme testinden geçti.

## Sunucu ve arayüz

- Mevcut User/GameRound/GameBet/GamePlay tabloları kullanılır; yeni tablo/migrasyon yok.
- Her istek kullanıcı satırında PostgreSQL `FOR UPDATE` kilidi, tek commit ve istek UUID'siyle sonuçlandırılır. Aynı son isteği tekrar göndermek bakiyeyi tekrar değiştirmez. Aynı kullanıcının açık bonusu bitmeden yeni ücretli tur başlatılamaz.
- Bonus havuzu, kalan dönüş, toplam kazanç, sıra ve son makbuz sunucuda saklanır. Yenileme/kapatma sonucu kaybetmez; ağ kesilirse tarayıcı aynı UUID ile tekrar dener. Eski sıra 409 verir ve aktif durum yenilenir.
- Dede kişisel oyunlar menüsünde yeni PNG kartıyla açılır. Oda içi Ludo/UNO/101 Okey menüsüne eklenmez. Diğer oyun dosyaları değiştirilmez; çıkışta eski oyun merkezi temizliği çağrılır.
- Otomatik oyun seçilen sayıda tam tur çalıştırır, bonus tur tamamlanana kadar sayacı düşürmez. Durdur/kapat/gizli sekme yeni dönüşleri durdurur; gönderilmiş istek geri alınmaz.
- 40 PNG: 32 özgün ImageGen sembol, 2 özgün Dede/Sardis sahnesi, 6 önceki üretilmiş kaplama. Light inci/şampanya altın; dark zümrüt/antik altın. `object-fit:contain` sembolleri tam gösterir; metin, sayı ve çarpan HTML'de canlıdır.
- Ses kullanıcı açınca sentezlenir; patlama/düşme/şimşek animasyonu ve reduced-motion desteği bulunur.

Doğrulama: 9 Python test grubu (ödeme tablosu, tam sayı doğrulama, tekrar istek, bonus devamı, erişim/sıra, maksimum sınır, hata geri alma, motor parity); JS yerçekimi/küre/cap testi; Playwright iki tema, 320px ve masaüstü, bonus alma/devam, kayıp yanıtın tekrarı, kurallar ve oyun merkezi geçişi. İşlem testleri izole SQLite üzerindedir; PostgreSQL eşzamanlı yük testi veya canlı cüzdan testi yapılmadı.

## Mekanik kaynakları

[Pragmatic Play resmi Gates of Olympus sayfası](https://www.pragmaticplay.com/tr/oyunlar/gates-of-olympus/): 8+ pay-anywhere, altı takla makarası, 500× küreler ve 15 ücretsiz dönüş. [Resmi Gates of Olympus 1000 sayfası](https://www.pragmaticplay.com/en/games/gates-of-olympus-1000/): 6×5 düzeni, 3 scatter +5 dönüş ve 100× bonus satın alma. Bu sayfalardan Dede'nin hedef RTP, hit veya 1/448 olasılığı türetildiği iddia edilmez; bunlar kullanıcı hedefi ve özgün kalibre edilmiş modeldir.
