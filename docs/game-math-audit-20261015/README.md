# Oyun ödeme matematiği incelemesi — 15 Ekim 2026

Aztek v1 normal oyunu ve bonus satın alımı kontrolsüz derecede yüksek geri ödeme veriyordu. Ares v1 normal oyunu düşük ödeme sıklığı ve düşük geri ödeme gösteriyordu. Yeni turlar için ayrı v2 modeli eklendi; önceden ödenmiş v1 Ares bonusları kendi özgün kurallarıyla tamamlanır. Eski motor dosyası, kaynak commit’teki motorla byte düzeyinde aynıdır.

## Kapsam ve yöntem

Kaynak: `erischat-proje/erishat`, `auth-unified-v1`, commit `6360f7c3b7d7fc3b54210fb0162ead384d1425a3`.
Şans çarkı, crash, blackjack, klasik üç makaralı slot, dört kupa, at yarışı ve kasa kapsam dışında. Bu oyunların üretim dosyaları değiştirilmedi.

39 ham raporda toplam **15.140.000 tamamlanmış ücretli tur/satın alım** ölçüldü. Ücretsiz turlar, tekrar bonusları, yapışkan semboller, yeniden çevrimler ve bütün bonusu kapsayan ödeme üst sınırları her ücretli turun sonucuna eklendi. Satın alımda payda 100× maliyettir; ante modunda 1,25×. Kaynaklar ve testler SHA-256 ile raporlara bağlandı. Dede JS referansı JSON biçimindeki konfigürasyonun kanonik hash’ini kaydeder; Python/JS parity ayrıca kontrol edildi.

RTP toplam ödeme / toplam maliyettir. Pozitif ödeme ihtimali ve bahis üstü net kâr ihtimali ayrı ölçülerdir. Aşağıdaki değerler canlı kullanıcı kayıtları veya sertifikalı teorik RTP değildir. Aralıklar normal yaklaşım kullanan Monte Carlo %95 güven aralıklarıdır; çok nadir uç ödüllerde yaklaşımın sınırları vardır. Ayar denemeleri final tablosuna dahil edilmedi. Aztek/Ares v2 için iki ayrı son doğrulama seed’i kullanıldı (`26101521`, `26101523`).

## Final modeller ve diğer oyunların güncel kaynakla ölçümleri

| Oyun | Mod | Tam tur sayısı | Ölçülen RTP | %95 aralık |
|---|---|---:|---:|---:|
| Dede | Normal | 1,000,000 | %97.52 | %95.64–99.40 |
| Dede | Ante | 1,000,000 | %97.14 | %95.40–98.87 |
| Dede | Satın alım | 100,000 | %97.19 | %96.44–97.95 |
| Şeker Sarayı | Normal | 500,000 | %97.37 | %94.20–100.55 |
| Şeker Sarayı | Ante | 500,000 | %95.78 | %92.69–98.87 |
| Şeker Sarayı | Satın alım | 50,000 | %95.73 | %94.30–97.17 |
| Balıkçı Hasan | Normal | 500,000 | %94.90 | %91.68–98.11 |
| Balıkçı Hasan | Satın alım | 100,000 | %97.41 | %96.35–98.47 |
| Prenses | Normal | 500,000 | %95.32 | %92.64–98.01 |
| Prenses | Ante | 500,000 | %97.35 | %94.74–99.96 |
| Prenses | Satın alım | 50,000 | %95.78 | %94.71–96.85 |
| Dog Party | Normal | 500,000 | %95.50 | %90.41–100.58 |
| Dog Party | Satın alım | 100,000 | %96.93 | %96.00–97.85 |
| Altın Şöleni | Normal | 500,000 | %99.31 | %94.37–104.26 |
| Altın Şöleni | Satın alım | 50,000 | %96.10 | %95.08–97.12 |
| Kaderin Küresi | Normal | 500,000 | %94.85 | %92.05–97.65 |
| Kaderin Küresi | Ante | 500,000 | %94.18 | %90.07–98.30 |
| Kaderin Küresi | Satın alım | 50,000 | %95.73 | %94.04–97.42 |
| Candy Ultimate | Normal | 1,000,000 | %100.38 | %95.19–105.57 |
| Candy Ultimate | Ante | 1,000,000 | %100.54 | %95.90–105.17 |
| Candy Ultimate | Satın alım | 50,000 | %99.36 | %96.98–101.74 |
| Bastet | Normal | 500,000 | %89.98 | %81.96–98.01 |
| Bastet | Satın alım | 50,000 | %96.29 | %93.12–99.45 |
| Firavun | Normal | 500,000 | %95.21 | %90.36–100.05 |
| Firavun | Satın alım | 50,000 | %94.99 | %93.01–96.98 |
| Kovboy | Normal | 500,000 | %91.22 | %86.21–96.24 |
| Kovboy | Satın alım | 50,000 | %97.83 | %95.34–100.33 |
| Aztek Hazinesi | Normal | 2,000,000 | %97.35 | %95.39–99.30 |
| Aztek Hazinesi | Satın alım | 200,000 | %95.75 | %94.92–96.57 |
| Savaşın Kılıcı | Normal | 2,000,000 | %95.72 | %94.97–96.46 |
| Savaşın Kılıcı | Satın alım | 200,000 | %95.54 | %94.73–96.35 |

## Eski modelde doğrulanan büyük sapmalar

| Oyun | Mod | Tam tur sayısı | v1 ölçülen RTP |
|---|---|---:|---:|
| Savaşın Kılıcı | buy | 10,000 | %101.15 |
| Savaşın Kılıcı | normal | 10,000 | %61.26 |
| Aztek Hazinesi | buy | 10,000 | %2433.43 |
| Aztek Hazinesi | normal | 10,000 | %25398.38 |

Bu küçük v1 örneklemleri hassas teorik oran iddiası için kullanılmadı; Aztek’teki birkaç yüz katlık ödeme dengesizliğini ve Ares’in düşük normal oyun sonucunu yeniden üretmek için kullanıldı.

## Yapılan düzeltmeler

- Aztek’in normal turunda her beş özellik artık garanti işaretlenmez. Her özellik bağımsız %31,5 olasılıkla işaretlenir; yalnızca temizlenen işaretler çalışır.
- Aztek’in Gold Fever ve seviye sayaçlarına sadece ödeme yapan taşlar eklenir. Nükleer yenilemenin temizlediği 64 hücre seviye ilerletmez.
- Büyük Aztek kümelerinin ödemeleri, yayınlanan v2 tablosuyla azaltıldı. Beş bonus seviyesi, 2/4/6/8/10× çarpanlar, 100× satın alım ve 10.000× bütün-tur sınırı korunur.
- Ares’in normal sembol dağılımı daha sık küçük/orta ödeme üretecek şekilde değiştirildi. Normal ve ücretsiz tur ödeme tabloları ayrı ve oyun yardımında görünürdür. Normal turda pozitif ödeme sıklığı yaklaşık %25,9’dur.
- Kullanıcı, bakiye, önceki kazanç/kayıp veya bahis miktarına göre olasılık değişmez. Yeni model instance başına RNG kullanır; üretimde `secrets.SystemRandom`, offline ölçümlerde sabit seed kullanılır.
- Yeni turlar v2’yi sunucuda seçer. İstemci v1 seçemez. Açık v1 bonusları eski modelle sürer; yardım ekranı da o bonusun tablosunu gösterir. Bonus bitince güncel yardım/tabloya dönülür.
- Ortak cüzdanın küsuratlı hesabı, kilitli bahis, sıra kontrolü ve UUID tekrar koruması korunur.

Hedef RTP %96,5’tir; bu hedef doğrulanmış teorik oran olarak sunulmaz. Son ölçümlerde Aztek normal %97,35, satın alım %95,75; Ares normal %95,72, satın alım %95,54 verdi. Ares’in ölçülen aralıklarının üst uçları hedefin biraz altında kalır; hedefin tam sağlandığı iddia edilmez. Büyük sapmalar giderildi; daha hassas teorik değer için bağımsız matematik denetimi gerekir.

Diğer oyunların matematiği bu değişiklikte değiştirilmedi. Örneğin Bastet’in normal oyun aralığı geniştir; Candy’nin ölçülen ortalaması %100 civarında olsa da aralık hedefi kapsar. Bu sonuçlardan tek başına kesin düşük/yüksek teorik RTP çıkarılmaz.

Oda oyunları UNO, Ludo ve Okey101’de ödeme kodları da incelendi: stake havuzu kazananlara dağıtılıyor; bu oyunlara slot RTP modeli uygulanmadı. Bu ödeme kodları değiştirilmedi.

## Pragmatic Play kaynak kontrolü

Resmî açıklamalardan mekanik karşılaştırması yapıldı:

- [Gems Bonanza](https://www.pragmaticplay.com/en/games/gems-bonanza/): 8×8 alan, özellikler ve son seviyede 10× çarpan.
- [Gates of Olympus](https://www.pragmaticplay.com/en/games/gates-of-olympus/): 8+ sembol, 15 ücretsiz tur, biriken çarpanlar.
- [Sweet Bonanza](https://www.pragmaticplay.com/en/games/sweet-bonanza-slot/): 8+ sembol, 10 ücretsiz tur, bonus çarpanlarının toplanması.
- [Starlight Princess](https://www.pragmaticplay.com/en/games/starlight-princess/): bonus boyunca biriken çarpanlar.
- [The Dog House](https://www.pragmaticplay.com/en/games/the-dog-house-slot/): 20 çizgi ve yapışkan Wild.
- [Sugar Rush](https://www.pragmaticplay.com/en/games/sugar-rush/): 5+ bitişik sembol; orijinal oyunun işaret çarpanı 128×’e kadar. ErisChat Candy Ultimate’in 1024× sınırı özgün varyanttır.

Bu sayfalar incelenen herkese açık metinlerinde bütün kesin tetikleme olasılıklarını ve matematik dosyalarını vermiyor. Üçüncü taraf sayılardaki farklılıkları resmî ve kesin veri gibi kullanmadık. ErisChat’in kendi kodu bu nedenle bağımsız simüle edildi.

## Doğrulama ve tekrar çalıştırma

- 176 Python motor/API regresyon testi geçti.
- 4 frontend yardım senaryosu geçti: Aztek/Ares × v1/v2.
- Dede referans testi: 120 trace, düşüş/survivor, biriken çarpan ve anlık üst sınır kontrolleri geçti.
- Python derleme, inline JavaScript sözdizimi, kaynak hash doğrulaması ve `git diff --check` geçti.
- Eski bahis doğrulama testlerindeki 10.001 girdisi artık geçersiz değildir; API’nin mevcut güvenli işlem sınırını aşan 1.000.000.001 ile güncellendi. Üretim bahis sınırları bu yama ile değiştirilmedi.

Örnek tekrar komutları (depo kökünde):

```sh
python3 tests/aztek_ares_simulate.py aztek normal --samples 1000000 --seed 26101521 --out /tmp/aztek.json
python3 tests/aztek_ares_simulate.py ares buy --samples 100000 --seed 26101523 --out /tmp/ares-buy.json
python3 tests/game_math_audit.py candy normal --samples 1000000 --seed 15103201 --out /tmp/candy.json
node tests/dede-simulate.cjs base 1000000 15102601 /tmp/dede.json
node tests/aztek-ares-rules.test.cjs
node tests/dede-reference-tests.cjs
```

Ham sonuçlar bu dizindeki JSON dosyalarındadır. Bu çalışma canlı cüzdanlara bağlanmadı ve üretim turu oynatmadı.
