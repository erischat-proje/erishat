# Bastet, Candy Ultimate ve Kovboy ödeme dengesi — 15 Ekim 2026

PR #275’in birleştiği `609235ec06e6b947c91a90a50d86e9ec0e228ea4` kaynak sürümü üzerinde çalışıldı. Önceki Aztek/Ares düzeltmesi bu pakete tekrar eklenmedi.

Bastet v1 normal oyununda düşük geri ödeme geniş örneklem ve bağımsız koşullu ölçümle doğrulandı. Candy’nin bonus dağılımı ile Kovboy’un satın alınan bonusu hedefin üstünde sonuç veriyordu. Yeni turlar v2 ayarlarını kullanır; daha önce ödenmiş v1 bonuslar ve Bastet yeniden çevrimleri kendi sürümünde tamamlanır.

## Ölçüm kapsamı

- Eski sürüm: 17.200.000 doğal tamamlanmış tur/satın alım + 1.600.000 koşullu tam-tur örneği.
- Yeni sürüm: 11.200.000 doğal tamamlanmış tur/satın alım + 2.400.000 koşullu tam-tur örneği.
- Toplam: 32.400.000 örnek, 37 ham rapor. Ücretsiz turlar, yeniden tetiklemeler, sticky semboller, respin, bonus taban ödemesi ve bütün turu kapsayan üst sınır hesaba katıldı.
- Satın alım maliyeti 100×, Candy ante maliyeti 1,25× temel bahistir.

RTP = toplam brüt ödeme / toplam maliyet. Pozitif ödeme ve bahis üstü net kâr oranları farklıdır; yeni ham raporlar ikisini ayrı gösterir. Hiçbir ölçüm canlı kullanıcı cüzdanına veya üretim turuna bağlanmadı. Sonuçlar sertifikalı teorik RTP değildir.

## Yeni sürüm — daha hassas koşullu normal oyun tahmini ve satın alım ölçümü

| Oyun | Mod | Örnek sayısı | Ölçülen RTP | Yaklaşık %95 aralık |
|---|---|---:|---:|---:|
| Bastet’in Hazinesi | Normal, koşullu | 1,200,000 | %96.16 | %95.10–97.22 |
| Bastet’in Hazinesi | Satın alım | 400,000 | %96.17 | %95.05–97.30 |
| Candy Ultimate | Normal, koşullu | 600,000 | %96.15 | %95.37–96.93 |
| Candy Ultimate | Ante, aynı koşullu dağılımlar | Aynı örnekler | %96.17 | %95.36–96.98 |
| Candy Ultimate | Satın alım | 400,000 | %96.47 | %95.66–97.27 |
| Kovboy | Normal, koşullu | 600,000 | %96.52 | %95.76–97.28 |
| Kovboy | Satın alım | 400,000 | %95.89 | %95.00–96.78 |

## Ayrı doğal-tur Monte Carlo kontrolü

Bütün sonuçlar ayrıca gerçek tetikleme olasılıklarıyla, bağımsız seed’lerle çalıştırıldı. Bu yöntem nadir büyük bonuslara daha duyarlı olduğu için aralıklar daha geniştir; koşullu tahminlerle birleştirilip aynı örneklem gibi sayılmadı.

| Oyun | Mod | Örnek sayısı | Ölçülen RTP | Yaklaşık %95 aralık |
|---|---|---:|---:|---:|
| Bastet’in Hazinesi | normal | 4,000,000 | %95.85 | %93.01–98.68 |
| Candy Ultimate | normal | 2,000,000 | %96.44 | %93.06–99.82 |
| Candy Ultimate | ante | 2,000,000 | %95.74 | %92.57–98.91 |
| Kovboy | normal | 2,000,000 | %99.62 | %96.44–102.79 |

Özellikle Bastet’te ilk iki normal örneklem %91,52 ve %93,26 verirken üçüncü 2 milyon tur %99,31 verdi. Bütün doğal örnekler ve iki bağımsız koşullu tahmin birlikte, tek kısa seansın sabit oyun RTP’si gibi yorumlanmaması gerektiğini gösterir. Kovboy normal matematiği bit düzeyinde korunmuştur; eski/yeni normal örneklem ortalamalarının farklı olması sürüm kaynaklı bir olasılık değişimi değildir.

## Değişen parametreler

| Oyun | v1 | v2 | Etki |
|---|---|---|---|
| Bastet | Normal Wild %0,4 | Normal Wild %2,5 | Küçük/orta normal ödemeleri artırır; bonus tetikleme oranı aynı kalır. |
| Bastet satın alımı | Bonus Wild %2,5 | Satın alınan bonusta %2,48 | Satın alımı ayrıca dengeler; doğal bonus %2,5’te kalır. |
| Candy | Bonus ilk sembol ağırlığı 37 | 36,85 | Bonus çarpan noktalarının ödeme dağılımını dengeler. Normal/ante tetikleme olasılıkları aynı kalır. |
| Kovboy satın alımı | Bonus Wild %2,43 | Satın alınan bonusta %2,41 | Satın alım geri ödemesini düşürür; normal oyun ve doğal bonus aynı kalır. |

Ödeme tabloları, jackpot/çarpan sınırları, 100× satın alım fiyatları, ücretsiz tur sayıları, ortak cüzdan ve küsurat hesabı değiştirilmedi. Kullanıcı kimliği, bakiye, bahis miktarı veya önceki kazanç/kayıp olasılıkları etkilemez.

## Koşullu yöntemin hesabı

Üç motorda da ücretli turun doğal bonus tetikleme olasılığı kodda açıkça sabit `p` olarak tanımlıdır. İlk ücretli tur bu koşula göre ikiye ayrılır; kalan tam turun (respin/ücretsiz tur/üst sınır dahil) her koşuldaki dağılımı bağımsız örneklenir:

`E[R] = (1-p) E[R | tetiklenmedi] + p E[R | tetiklendi]`.

Bağımsız örneklem ortalamalarının varyansı `(1-p)^2 Var(mean0) + p^2 Var(mean1)` olarak taşınır. Kaynak dosyalar değiştirilmeden, offline süreçte yalnızca ilk doğal tetikleme koşulu 0/1’e sabitlenir. Gerçek üretim olasılığıyla tekrar ağırlıklandırılır. Candy ante aynı koşullu sonuç dağılımlarını kullanır; kendi tetikleme olasılığı ve 1,25× fiyatıyla hesaplanır. Bu eşitlik motor testiyle de doğrulanır.

Güven aralıkları normal yaklaşım kullanır; yüksek oynaklık ve nadir üst sınır kazançları nedeniyle sertifika yerine geçmez. Hedefler Bastet %96,2; Candy %96,5; Kovboy %96,51’dir. Hedef ile örneklem ortalamasının birebir eşit olduğu iddia edilmez.

## Eski bonus uyumluluğu ve testler

- Eski `*-math.json` dosyaları byte düzeyinde korunur; yeni ayarlar `*-math-v2.json` dosyalarındadır.
- Sunucu yeni tura v2 seçer. Kayıtlı v1 turu tamamlanana kadar v1 konfigürasyonunu kullanır. Candy’ye eksik olan kayıtlı sürüm seçimi eklendi.
- Satın alım profili istekteki bir istemci bayrağından değil, kayıtlı turun sunucuda saklanan `entry` alanından seçilir. İstemci eski sürüm veya satın alım profili enjekte edemez.
- Eski modelden kaydedilmiş 72 sonuç, yeni motorlarda birebir eşleşir. Line oyunlarının eski satın alım profili de aynı sonuçları verir.
- 267 Python motor/API testi geçti. Bu testler UUID tekrar koruması, kilitli bahis, ortak küsuratlı cüzdan, v1 devamı, bilinmeyen sürümün reddi, işlem geri alma, üst sınır ve çizim/ödeme ayrımını kapsar.
- Aztek/Ares yardım testleri ve Dede’nin 120 referans trace kontrolü de geçti.

## Kaynak doğrulaması ve tekrar üretme

Eski raporların kaynak hash’leri kaynak commit `609235e` içeriğine göre doğrulandı. O sırada yeni eklenen koşullu ölçüm yardımcısının tam kaynak kopyası `../game-math-audit-20261015-extended/source-snapshots/game_math_conditional_v1.py` içinde korunur; hash’i eski raporlarla eşleşir. Yeni raporlar bu değişiklikteki motor/simülatör/konfigürasyon dosyalarına göre doğrulandı.

Örnek komutlar (depo kökünde):

```sh
python3 tests/game_math_audit.py bastet normal --samples 2000000 --seed 26101601 --out /tmp/bastet.json
python3 tests/game_math_audit.py candy buy --samples 200000 --seed 26101583 --out /tmp/candy-buy.json
python3 tests/game_math_audit.py kovboy buy --samples 200000 --seed 26101581 --out /tmp/kovboy-buy.json
python3 tests/game_math_conditional.py bastet normal --samples 300000 --seed 26101591 --out /tmp/bastet-conditioned.json
python3 tests/game_math_conditional.py candy normal --samples 300000 --seed 26101591 --out /tmp/candy-conditioned.json
```

Bu paket yalnızca Bastet, Candy ve Kovboy matematiğini değiştirir. Önceki pakette kapsam dışında bırakılan şans çarkı, crash, blackjack, klasik slot, dört kupa, at yarışı ve kasa bu pakette de değiştirilmez.
