# Hasan v3: makara modeli, ödeme sıklığı ve doğru sembol rolleri

## Denetim sonucu

V1 normal dönüş başına tek bir sembol ailesi seçiyor, sonra hücreleri o ailenin yükseltilmiş ağırlıklarıyla bağımsız üretiyordu. Bunun 1 milyon tur ölçümünde ücretli dönüş ödeme sıklığı %12,2345'ti. Ödemelerin önemli kısmı seyrek bonuslara taşınıyordu; önceki toplam RTP tahmini %96,7689 olsa bile oyuncu uzun boş dönüş serileri görebiliyordu. RTP ve ödeme sıklığı aynı ölçüm değildir.

Canlı depodaki v2 `portrait.png` dosyası kontrol edildi ve test edilmiş Hasan portresiyle SHA-256 olarak aynı bulundu. Renderer Hasan için s=11, para balığı için s=9, bonus balığı için s=10 kullanıyordu. Balık PNG'si Hasan sayacına bağlanmış bir sunucu hatası bulunmadı; özel sembollerin benzer balık görüntüleri ve eksik rol etiketi ayrımı belirsiz kılıyordu. V3 bu ayrımı ayrı asset yolları, etiketler ve test edilmiş açık symbolRoles sözleşmesiyle görünür yapar.

## Birincil referanslar ve kapsam

[Pragmatic Play'in Türkçe Big Bass Bonanza özeti](https://www.pragmaticplay.com/tr/oyunlar/big-bass-bonanza/) ve [İngilizce ürün özeti](https://www.pragmaticplay.com/en/games/big-bass-bonanza/) incelendi. Resmî özet bonus girişini balıklı scatter'larla, ücretsiz dönüş içindeki toplamayı balıkçı wild'ıyla ve her dört **toplanan** balıkçıyla ek dönüş/çarpan ilerlemesini anlatır. Dolayısıyla dört Hasan'ın aynı dönüşte görünmesi gerekmez. Para balıkları Hasan sayacına eklenmez.

V3 klasik beş makara/üç satır/10 çizgi/collector akışını uygular; yayımlanmayan orijinal reel strip'leri veya gizli matematik kopyalandığı iddia edilmez. Keeping It Reel, Bigger Bass ve diğer varyantların net/boat/hook gibi farklı özellikleri eklenmedi. Özgün Lidya modeli ve ödeme tablosu aşağıda açıktır. Resmî gizli olasılıklar bilinmediğinden bizim dinamit %20 değerimiz önceki teknik şartnameye aittir.

## Yeni sabit makara yapısı

Normal ve bonus için beş ayrı dairesel, 1000 hücrelik reel strip yayımlanır. Her makara CSPRNG ile bağımsız bir stop seçer; görünür üç satır bu stop ve sonraki iki ardışık hücredir. Wrap-around geçerlidir. Normalde tek-aile seçimi yoktur. Strip'ler sabittir, kullanıcı bakiyesi/geçmişiyle değiştirilmez. RNG üretimde `secrets.SystemRandom`, offline testte belirli `random.Random` seed'idir.

Normal reel başına sembol sayıları:

| 10 | J | Q | K | A | Kutu | Yem | Olta | Şamandıra | Para balığı |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 367 | 171 | 138 | 99 | 69 | 39 | 29 | 19 | 9 | 60 |

Bonus reel başına sayılar: `[180,165,145,125,105,55,50,40,35,100]`. Her reel ayrı sabit sıra taşır. Python shuffle yalnızca geliştirme sırasında yayımlanan strip sıralarını üretmek için kullanıldı; üretimde strip yeniden shuffle edilmez.

Özel özellikler ayrıca örneklenir: normalde scatter sayısı, bonusta Hasan sayısı. Seçilen özel semboller farklı makaraların birer rastgele satırına yerleştirilir. Bu, orijinal şirketin gizli strip'leri değil açık, özgün bir hibrit feature modelidir. Normal reel stop'ları ve 15 hücrelik son animasyon pencereleri response'a gelir; renderer geçişte rastgele alakasız harfler yerine bu strip pencerelerini kaydırır. Son üç hücre server'ın kesin board'udur.

## Ödeme tablosu ve on çizgi

Bütün değerler toplam temel bahsin katıdır. Daha sık küçük çizgi kazançları için düşük sembol tablosu ve dağılım birlikte değiştirildi; RTP hedefini artırmak için sahte win bayrağı veya kullanıcıya göre ödeme eklenmedi.

| Sembol | 3 | 4 | 5 |
|---|---:|---:|---:|
| 10 | 0,2× | 1× | 5× |
| J | 0,2× | 1× | 5× |
| Q | 0,2× | 1× | 5× |
| K | 0,2× | 1,5× | 10× |
| A | 0,2× | 1,5× | 10× |
| Olta kutusu | 2× | 10× | 50× |
| Sinek yem | 3× | 20× | 100× |
| Olta | 4× | 30× | 150× |
| Şamandıra | 5× | 40× | 200× |
| Para balığı | 1× | 5× | 20× |

Her çizgi 1. makaradan başlayarak soldan sağa bitişik makaralarda aynı sembol veya Hasan wild ile eşleşir. Üç veya daha fazla eşleşme gerekir. Sağdaki üç harf, soldaki ilk makara uymazsa kazanmaz. Çizgi başına en yüksek tek ödeme seçilir; wild'lı bir çizgi birden fazla sembol için tekrar ödenmez. Scatter çizgi ödemesi sembolü değildir.

Satırlar üst=1, orta=2, alt=3:

| Çizgi | 1. makara | 2. makara | 3. makara | 4. makara | 5. makara |
|---|---:|---:|---:|---:|---:|
| 1 | 2 | 2 | 2 | 2 | 2 |
| 2 | 1 | 1 | 1 | 1 | 1 |
| 3 | 3 | 3 | 3 | 3 | 3 |
| 4 | 1 | 2 | 3 | 2 | 1 |
| 5 | 3 | 2 | 1 | 2 | 3 |
| 6 | 1 | 1 | 2 | 3 | 3 |
| 7 | 3 | 3 | 2 | 1 | 1 |
| 8 | 2 | 1 | 1 | 1 | 2 |
| 9 | 2 | 3 | 3 | 3 | 2 |
| 10 | 1 | 2 | 2 | 2 | 1 |

Kazanç animasyonu `Çizgi 1 · 3 J · 10 Lidya` gibi gerçek response değerini gösterir. Örnek 50 temel bahis ×0,2 =10 Lidya. Çizgiler penceresinde on kesin SVG diyagramı, ayrıca tahtada bütün çizgileri gösterme/gizleme vardır. Üç harfi salt ekranda saymak yerine hangi çizginin ödediği okunur.

## Açık sembol sözleşmesi

| Kimlik | Rol | Görsel ve davranış |
|---:|---|---|
| 9 | moneyFish | Para balığı, üzerinde nakit katı; Hasan toplar |
| 10 | bonusFish | Mavi/gümüş balıklı scatter, `BONUS BALIK` etiketi; 3/4/5 bonusu açar |
| 11 | hasan | Aynı Hasan insan portresi, `HASAN` etiketi; wild ve collector, sadece bonusta |

Üç ayrı PNG: `symbols-v3/money-fish.png`, `symbols-v3/bonus-fish.png`, `symbols-v3/hasan.png`. İlk ikisi mevcut üretilmiş premium atlasın ilgili hücresinden çıkarıldı; Hasan dosyası canlı portreyle aynı görüntüdür. Saydamlık korunur. İkonlar artık atlas içinde tahmin edilen indeksle seçilmez; açık dosya/rol kullanılır. Metre de `hasan.png` kullanır. Dosya yolları v3'e özeldir; HTML JS/CSS cache sürümleri yenilenir.

## Bonus modeli ve denge

3/4/5 bonus balığı 10/15/20 ücretsiz dönüş. Normal scatter sayı ağırlıkları `[700000,330000,90000,9000,900,100]`: tetikleme tam 1/113. Bonusta Hasan sayı ağırlıkları `[7500,2150,300,48,2]`. Her Hasan bütün para balıklarını ayrı toplar; balık olmasa bile metreye eklenir. Her dördüncü Hasan 4/8/12 eşiklerinde bir kez +10 dönüş ve sonraki dönüşte 2×/3×/10× çarpan. Dört Hasan aynı ekranda şart değildir. 12 sonrası yeni retrigger yoktur. Dönüşün bütün collector'ları açılış çarpanını kullanır.

Daha fazla Hasan/metre ilerlemesini, daha sık düşük para balığı değerleriyle dengelemek için nakit katları `[2,5,10,15,20,25,50,2000]`, ağırlıkları `[9360,540,80,10,5,3,1,1]`. Hasan var, para balığı yok: %20 dinamit; 1–3 farklı uygun pozisyon yüksek değerli balığa dönüşür. Dinamit değerleri 10/15/20/25/50/2000, ağırlıkları `[5200,2500,1500,650,149,1]`. Çizgi ödemesi dinamit öncesi board'dan gelir; dönüşüm ikinci çizgi ödemesi oluşturmaz. Yalnız toplama bonus çarpanıyla çarpılır.

Bütün ücretli tur + devam bonusu 2.100× temel bahis cap'ine tabidir. Cap bonusu bitirir. Money, fee ve fraction tam sayı yüzde-bir birimleriyle aynı transaction'da hesaplanır; ortak `User.lidya`/Dede remainder/idempotent receipts korunur.

## Ölçümler: sıklık RTP değildir

Eski v1 raporu `balikci-statistics-v1.json`, final v3 raporu `balikci-statistics.json`.

| Ölçüm | Eski v1 | Final v3 |
|---|---:|---:|
| Ücretli tur örneği | 1.000.000 | 1.000.000 |
| Seed | 753893 | 674173 |
| Ödeme gören ücretli tur | %12,2345 | **%34,1786** |
| Bonus tetikleme gözlemi | %0,8890 | %0,9106 |
| Simüle edilen ücretsiz dönüş | 121.875 | 157.143 |
| 2× seviyeye veya daha yukarı ulaşan bonus | %21,47 | %35,95 |
| 3× seviyeye veya daha yukarı ulaşan bonus | %7,35 | %19,39 |
| 10× seviyeye ulaşan bonus | %2,98 | %12,09 |
| Gözlenen maksimum | 2.100× | 2.100× |

V3 ödeme sıklığı yaklaşık 2,79 kat daha yüksektir. Her ödeme kârlı tur değildir; 0,2× ödeme, ücretli turda temel bahisten düşüktür. Daha sık küçük ödeme ve daha sık metre ilerlemesi, toplam getiriyi garanti etmez. Bonus giriş model olasılığı iki sürümde de 1/113'tür; farklı seed'lerde gözlenen bonus sayıları değişir.

Final v3 tam-tur Monte Carlo RTP tahmini **%98,6050**, %95 normal-yaklaşım güven aralığı **%96,0926–%101,1174**. Bu tek örneklemde bonus sıklığı hedefin üstünde gözlendi; üst güven sınırının %100'ü aşması gerçek RTP'nin %100 üstü olduğuna kanıt değildir. Hedef %96,71, bağımsız doğrulanmış veya analitik sertifikalı oran değildir.

Denge seçimi için ayrıca **60.000 koşullu bonus**, 1.039.095 ücretsiz dönüş simüle edildi. Üç/dört/beş scatter başlangıç karışımı 90/9/1; başlangıç dönüşünün ödemesi bonus katkısından ayrıldı ve cap'e dahil edildi. Normal reel beklentisi analitik, bonus katkısı koşullu örneklem üzerinden hesaplandı. Normal analitik katkı %48,2809, birleşik denge tahmini **%96,5480**, %95 aralık **%95,6966–%97,3995**. Bu daha çok bonus örneği kullanan kalibrasyon tahminidir; final tam-tur gözleminden ayrı ve açık biçimde raporlanır. Hiçbir sonuç hedefe yapay olarak yuvarlanmadı.

Analitik normal beklenti: her reel'in marjinal sembol olasılığı sabit strip sayısından gelir. N özel scatter farklı makaraya rastgele yerleştirildiği için k hücrelik bir çizgi öneğinin scatter'sız kalma olasılığı hipergeometrik seçimle hesaplanır: seçilen m makara için `(2/3)^m`. 3/4/5 prefix olasılıkları, ödeme tablosunun kademe farklarıyla toplanır. Çizgilerin bağımsız olduğu varsayılmaz; beklentiler doğrusal toplanır. Strip sıra korelasyonu ödeme sıklığını etkiler, fakat her çizginin marjinal ödeme beklentisi bu toplamla bulunur.

Tekrarlama:

- `python tests/balikci_simulate.py --n 1000000 --seed 674173`
- `python tests/hasan_v3_conditional.py` (yayımlanan kalibrasyon öncesi strip sayılarıyla denge seçimi; üretim config'ini değiştirmez)

Koşullu analiz yalnız kalibrasyon girdileridir; normal paid-spin testi final v3 config'iyle yapıldı. Kesin RTP için daha geniş bağımsız inceleme gerekir. Bu paket lisanslı kaynak oyunun birebir gizli matematik modeli olduğu iddiası taşımaz.

## Açık eski bonuslar ve cüzdan güvenliği

`balikci_engine_v1.py` ve `balikci-math-v1.json` eski engine/config'i dondurur. Açık GameRound'un `version=lidya-balikci-v1` bilgisi eski bonus motoruna yönlendirilir. Aynı test seed'leri için sonuçlar eski engine ile bit-bit eşleşir. V1/v2 açık bonus stake, değer tablosu, dağılım ve birikmiş ödemeleriyle tamamlanır; v3 yeni ücretli turdan başlar. /rules aktif eski bonusun eski tablosunu döndürür; bonus bitince frontend kuralları yeniden alır.

User row lock, fraction, GameBet/GamePlay, UUID request receipt ve cap hesapları korunur. Para balığı veya bonus balığı Hasan sayacına eklenmez; insan wild kimliği 11 sayılır. Sunucu istemci board/seed/payout kabul etmez. Bilinmeyen model sürümü sessizce yeni kurallara çevrilmez. Eski receipt tekrar gönderimi ikinci ücret/ödeme oluşturmaz.

## Doğrulama

**17 izole Python test grubu**: input/kurallar, tek ücret/receipt replay, fraction, bonus owner/sequence/resume/eski receipt, yetersiz bakiye/rollback/feature gate, cap, ortak Dede remainder/stale auth, tüm paylines ve wild best-only, çoklu collector/stage, dinamit, scatter/main wild yasağı, çoklu eşik, sabit reel wrap/animasyon penceresi, farklı makara özel sembolleri/role contract, 1000 board üzerinde brute-force ödeme karşılaştırması, eski bonus bit-exact dispatch, aktif eski bonus tablosu/bedelsiz devam, para/bonus balığının Hasan sayacına girmemesi. Canlı cüzdan kullanılmadı.

Chromium 390×844 / 1280×900, açık/koyu: üç role özgü PNG ve Hasan yolu, on SVG çizgi ve tahtada overlay, gerçek engine fixture'ında J-J-J çizgi 1 ödemesi 50 bahiste 10 Lidya, reel pencereleri, collector/metre/dinamit, gerçek v2 MP3 playback/mute/close, bonus resume, odak/cleanup ve JS error yok. Actual live portrait hash'i doğru Hasan portresine eşleşti. Kurulum iki kez uygulanması, model backup'ları, hafif sparse clone, bütün paket SHA-256/ZIP CRC ve git diff --check doğrulandı. Canlı PostgreSQL eşzamanlı yük testi veya bağımsız RTP sertifikasyonu yapılmadı.
