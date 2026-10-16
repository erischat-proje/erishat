# Kalan sekiz oyunun matematik denetimi — 15 Ekim 2026

Kaynak: erischat-proje/erishat, auth-unified-v1, d7f5e4607da1f153c2982bf21977c0882698ab43. Önceki iki PR üzerine hazırlanmıştır.

RTP, uzun vadede toplam ödemelerin toplam oyun bedeline oranıdır; kazanma ihtimali değildir. Ödeme sıklığı herhangi bir ödeme alınan tamamlanmış turu, net kazanç ise toplam ödemenin turun bedelini geçtiği turu sayar. Satın alımlarda bedel 100x, ante oyunlarda 1,25x olarak kullanılır. Bonuslar, yeniden tetiklenmeler ve tur başına ödeme tavanı dahildir. Bunlar simülasyon tahminleridir; sertifikalı RTP değildir.

## Mevcut modellerin ölçümü

| Oyun | Mod | Örnek | RTP | %95 güven aralığı | Ödeme sıklığı | Net kazanç sıklığı |
|---|---|---:|---:|---:|---:|---:|
| Dede | normal | 4,000,000 | %95.76 | %94.89–%96.62 | %27.52 | %14.12 |
| Dede | ante | 4,000,000 | %96.13 | %95.21–%97.04 | %27.53 | %12.96 |
| Dede | buy | 400,000 | %96.65 | %96.27–%97.02 | %99.43 | %33.22 |
| Prenses | normal | 4,000,000 | %95.23 | %94.37–%96.10 | %27.52 | %14.12 |
| Prenses | ante | 4,000,000 | %95.58 | %94.67–%96.50 | %27.53 | %12.96 |
| Prenses | buy | 400,000 | %96.05 | %95.68–%96.43 | %99.43 | %32.97 |
| Şeker Sarayı | normal | 4,000,000 | %96.46 | %95.40–%97.51 | %33.04 | %12.68 |
| Şeker Sarayı | ante | 4,000,000 | %95.68 | %94.54–%96.83 | %30.66 | %11.51 |
| Şeker Sarayı | buy | 1,400,000 | %95.56 | %95.29–%95.83 | %94.81 | %27.11 |
| Balıkçı Hasan | normal | 4,000,000 | %96.23 | %95.00–%97.47 | %34.87 | %9.52 |
| Balıkçı Hasan | buy | 400,000 | %97.31 | %96.78–%97.85 | %99.15 | %24.81 |
| Dog Party | normal | 4,000,000 | %96.73 | %94.91–%98.55 | %24.91 | %3.09 |
| Dog Party | buy | 400,000 | %96.83 | %96.37–%97.29 | %99.65 | %28.51 |
| Altın Şöleni | normal | 4,000,000 | %97.05 | %95.61–%98.49 | %21.00 | %1.13 |
| Altın Şöleni | buy | 400,000 | %95.67 | %95.33–%96.00 | %100.00 | %28.39 |
| Kaderin Küresi | normal | 4,000,000 | %95.85 | %94.74–%96.95 | %53.98 | %16.55 |
| Kaderin Küresi | ante | 4,000,000 | %95.45 | %94.13–%96.77 | %52.99 | %13.61 |
| Kaderin Küresi | buy | 400,000 | %95.72 | %95.10–%96.34 | %99.88 | %23.03 |
| Firavun | normal | 4,000,000 | %95.91 | %94.22–%97.61 | %25.91 | %7.71 |
| Firavun | buy | 400,000 | %95.71 | %95.00–%96.43 | %99.87 | %22.65 |

## Satın alma düzeltmelerinin son ölçümü

Normal/ante oyun dağılımları ve doğal bonuslar değiştirilmedi. Şeker Sarayı v2, yalnız satın alınan yeni bonuslarda en düşük bomba değerinin ağırlığını 3000’den 2800’e indirir. Altın Şöleni v2 satın alma pot değerlerini [63,126,253,632,1264,2529] yerine [64,127,254,639,1277,2554] kullanır. Eski config dosyaları aynen saklanır; açık bonuslar kayıtlı sürümle devam eder. Yeni Şeker turlarında satın alma profili sunucunun kaydettiği entry alanından seçilir.

| Oyun | Örnek | Önce RTP | Sonra RTP | Sonra %95 güven aralığı |
|---|---:|---:|---:|---:|
| Şeker Sarayı | 400,000 | %95.56 | %96.66 | %96.15–%97.17 |
| Altın Şöleni | 400,000 | %95.67 | %96.54 | %96.20–%96.87 |

## Nadir bonus için bağımsız kontrol

İlk tetikleme kararı veya scatter ailesi iki tabakaya ayrıldı; her tabakada 100.000 tam tur çalıştırılıp canlı olasılıkla ağırlıklandırıldı. Bu sonuçlar üstteki düz örneklemle birleştirilmez. Kaderin Küresi’nde sıfır scatter olasılığı da korunur; yapılandırmayı koşullandırma işleminin dağılımı aynen yeniden kurduğu deterministik testlerle denetlenir. Altın Şöleni’nin tetikleme parası kopyalama sonrasında kaybolabileceği için koşullandırılan şey son bonus sonucu değil, ilk tetikleme kararıdır.

| Oyun | Mod | RTP | %95 güven aralığı |
|---|---|---:|---:|
| Altın Şöleni | normal | %96.61 | %95.95–%97.26 |
| Balıkçı Hasan | normal | %97.52 | %96.37–%98.67 |
| Dede | ante | %96.83 | %94.84–%98.82 |
| Dede | normal | %96.09 | %93.67–%98.51 |
| Dog Party | normal | %96.81 | %95.97–%97.65 |
| Firavun | normal | %96.39 | %95.18–%97.60 |
| Kaderin Küresi | ante | %94.88 | %93.72–%96.05 |
| Kaderin Küresi | normal | %95.67 | %94.26–%97.08 |
| Prenses | ante | %96.28 | %94.30–%98.26 |
| Prenses | normal | %95.58 | %93.17–%98.00 |
| Şeker Sarayı | ante | %95.72 | %94.57–%96.87 |
| Şeker Sarayı | normal | %95.00 | %93.57–%96.42 |

## Karar ve sınırlar

Aztek’in eski modelindeki büyüklükte aşırı ödeme ya da neredeyse hiç ödeme vermeyen model saptanmadı. Diğer altı oyunun olasılıkları korunur. Bazı nokta tahminleri yapılandırmadaki hedefin altında/üstündedir; güven aralıkları ve yüksek oynaklık nedeniyle bunlar hedefin doğrulandığı anlamına gelmez. Özellikle Kaderin Küresi ante ve Firavun satın alma tahminleri hedefin alt tarafındadır; daha dar tahmin elde etmek için daha fazla örnek gerekir. Şeker ve Altın satın alımlarındaki küçük aşağı sapma sınırlı bir profil değişikliğiyle ele alınmıştır.

Toplam 57 ham rapor, 55,400,000 tam ücretli tur/satın alma/koşullu tur. Koşullu örnekler canlı tetikleme sıklığını temsil eden düz örnek sayısı değildir. Her ham raporda seed, örnek sayısı ve kullanılan kaynakların SHA-256 özeti vardır.

## Yeniden çalıştırma

Güncel ölçüm: `python tests/game_math_audit.py GAME normal|ante|buy --samples N --seed SEED --out DOSYA`. Koşullu kontrol: `python tests/remaining_games_conditional.py GAME normal|ante --samples 100000 --seed 26101641 --out DOSYA`. Tablolar: `python tests/remaining_games_report.py`.

Eski ölçümleri yeniden üretmek için bu klasördeki baseline-sources dosyalarını bir geçici çalışma kopyasının aynı yollarına koyun; altin-math-v2.json ve seker-math-v2.json dosyalarını o kopyadan çıkarın. Diğer dosyalar bu PR ile aynıdır. Üretim cüzdanına hiçbir simülasyon bağlanmaz.

## Doğrulama

60 yeni test geçti; tam tests/ taramasında 446 test geçti. Termux kurulumu ayrıca yerel bir test deposunda denetlendi. Dondurulmuş v1 sonuçları; yeni/eski doğal oyun eşitliği; açık satın alınmış bonusun eski sürümde sürmesi; tek kez ödeme/idempotent tekrar; yanlış sürümün bakiyeyi/turu değiştirmeden reddi ve istemcinin profil seçememesi test edilir.

Tam tests/ taramasında altı önceden mevcut hata var: blackjack geçersiz yüksek bahis; crash 50 ve 500 bahis kabulü; Şeker eski 10001 üst sınırı varsayımı; slot 500; wheel 500. Aynı altı test temiz d7f5e4 tabanında da başarısız oldu. Tam kök pytest taraması ayrıca eksik psycopg/Pillow bağımlılıkları yüzünden toplanamadı. Bu kapsam dışı bahis politikaları değiştirilmedi.

Şans çarkı, crash, blackjack, klasik slot, dört kupa, at yarışı ve kasa oyunu bu paketin dışında tutulmuştur.
