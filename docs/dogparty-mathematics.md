# Dog Party — ErisChat oyun motoru

Dog Party ayrı bir oyun türü (dogparty) ve API (/v1/games/dogparty) olarak eklenir. User.lidya ve Dede/Şeker/Hasan/Prenses'in ortak yüzde birim defteri kullanılır; yeni cüzdan veya tablo oluşturulmaz. Diğer oyunların matematik veya grafik dosyaları değiştirilmez. Prenses'in yalnızca ses modülü ve HTML ses önbellek sürümü güncellenir.

## Kurallar ve sonuç üretimi

5 makara × 3 satır ve 20 benzersiz sabit çizgi. Kazanç soldan başlayarak aynı sembolden 3/4/5 eşleşmeyle hesaplanır. İlk makaradan başlamayan eşleşme ödeme değildir. Tam ödeme tablosu uygulama kuralları ve API'de görünür; miktarlar toplam temel bahsin katıdır, tekrar 20 ile bölünmez.

Semboller: 10/J/Q/K/A, kemik, tasma, Dachshund, Pug, Shih Tzu ve Rottweiler. En yüksek normal sembol Rottweiler'dır. Kulübe Wild sadece 2/3/4. makaralarda, 2× veya 3× ile çıkar; Scatter yerine geçmez. Çizginin kesintisiz eşleşmesi içinde kalan kulübelerin değerleri toplanır. İki kulübe 2+3=5× yapar, 6× yapmaz. Eşleşme bittikten sonraki Wild çarpanı hesaba katılmaz.

Pati sadece 1/3/5. makaralarda, her makarada en çok bir adet gelir. Üç Pati 5× doğrudan ödeme ve bonus açar. Sunucunun belirlediği dokuz 1/2/3 değeri gösterilir; toplam 9–27 dönüş verir. Dokuz hücrenin ağırlıkları 50/35/15'tir; uç değerlerin sıklığı eşit değildir.

Bonus sırasında her yeni Wild konum ve 2×/3× değeriyle sabit kalır. Sonraki RNG sonucu bu hücreyi değiştirmez; mevcut kulübe yeniden örneklenmez veya ikinci kez çarpan kazanmaz. Ana oyun Wild'ları bonus başında taşınmaz. Bonus tekrar tetiklenmez. Bonus bitince yeni ücretli turda sticky harita boşalır.

Temel bahis ve ona bağlı tüm bonus ödemeleri toplam 6.750× ile sınırlanır. Limitte bonus durur. Sabit tüm orta hücreler 3× ve iki uçtaki Rottweiler kombinasyonu tek dönüşte bu sınırı üretebilir; deterministik testle doğrulandı.

Üretimde secrets.SystemRandom kullanılır. Beş normal ve beş bonus makara şeridi sabittir; her şeritte 1.000 sembol ve dairesel üç hücrelik pencere vardır. Özel semboller izin verilen sütunlara uygulanır. İstemci sunucunun reelWindows ve board sonuçlarını animasyonla gösterir; sonuç seçemez. forced_board sadece Python test yardımcı parametresidir, HTTP sözleşmesinde yoktur.

## Matematik ölçümü

Hedef RTP %96,51; sağlayıcının kapalı makara veya ağırlık matrisi kopyalanmadı. Bu özgün bir modeldir, sertifikalı kesin RTP iddiası yoktur (calibration-pending).

Scatter bulunan her makarada çizginin o hücreye denk gelmesi 1/3 olasılıkla ağırlıklandırıldı. Tek çizginin marjinal beklentisi toplandı, 20 çizginin birbirinden bağımsız olduğu varsayılmadı. Bir bonusun t'nci dönüşünde bir orta hücrenin sticky olasılığı 1−(1−q)^t, q=0,040958758566193874. Wild dağılımı 2×:%75, 3×:%25. Dokuz hücreli çarkın toplam dağılımı konvolüsyonla hesaplandı. Normal + tüm bonusun **limit öncesi** analitik beklentisi %96,5100, normal kısmı 0,1660661073, koşullu bonus beklentisi 139,8309312×.

Tam tur limiti dahil bağımsız sunucu simülasyonu:

- 2.000.000 ücretli tur; birbirinden bağımsız iki 1.000.000 örnek, seed 194831 ve 294833.
- Ölçülen birleşik RTP %95,8845; %95 güven aralığı %93,3698–98,3993.
- Ücretli dönüşte ödeme sıklığı %24,8224; bu kârlı dönüş sıklığı değildir.
- Bonus tetikleme %0,57255 (hedef yaklaşık 1/175).
- 170.466 ücretsiz dönüş simüle edildi.
- En büyük gözlenen toplam ödül 1.982,8×; bu örnekte sınır olayı görülmedi. 6.750× ve kalan bonusun sonlanması ayrıca test edildi.

Analitik değer limit öncesidir. Limit altındaki gerçek beklenti bundan yüksek olamaz; bu fark Monte Carlo ile ayrıca değerlendirilir. Ölçümün %96,51 hedefini güven aralığında içermesi sertifikasyon değildir. Daha geniş örneklem nadir büyük ödüllerin etkisini daraltır. İlk seed sonucu %94,1467, ikinci seed sonucu %97,6224 oldu; ikisi de birleşik raporda tutuldu. Ham sonuçlar ve yapılandırma dogparty-statistics.json; analitik özet dogparty-analytic.json içindedir.

Tekrar üretim: `python tests/dogparty_simulate.py --spins 1000000 --seed 194831` ve aynı komut `--seed 294833` ile. Birleşik rapor iki örneğin ortalaması ve birleşik örnek varyansı ile oluşturulur. Analitik kontrol: `python tests/dogparty_analytic.py` (salt okunur; üretim yapılandırmasını değiştirmez).

## Cüzdan ve devam

Kullanıcı satırı kilitlenir; oturum nesnesindeki eski bakiye yenilenir. İstek kimliğiyle ilk ve geçmiş bonus cevapları saklanır. Geç gelen yinelenmiş istek ikinci ödeme veya ücret yaratmaz. Bonus sahibi, sequence ve sabit bahis kontrol edilir. Kesilen bağlantı aynı isteğin tekrarını kullanır; /active kaldığı yerden devam eder. Küsuratlar tam sayı yüzde birimlerle saklanır. Oyunlar arası aynı kullanıcı bakiyesi kilidi ortak cüzdan işlemlerini sıraya koyar.

## Doğrulama

13 sunucu test grubu: 20 çizgi/validasyon; toplama ve eşleşme dışında çarpan; özel sembol sütunları; sabit kulübe konum/değeri; 9–27 çark sınırları; 6.750×; tek ve geçmiş istek tekrarları; bonus sahipliği/sırası/bahsi; yetersiz bakiye/RNG hatası geri alma; ortak küsurat; eski bakiye yenileme/diğer oyuna erişim; bonus limiti; bağımsız çizgi değerlendiricisiyle 500 rastgele tablo karşılaştırması.

Tarayıcı: mobil 390×844 ve masaüstü 1280×900, iki tema, 20 SVG çizgi/tahta overlay, 9 hücreli çark, bonus durdurma/devam, yapışkan kulübeler ve 5× çizgi, 8 Dog Party + 9 Prenses WAV'ın decode edilmesi, ses olayları/mute/close ve JS hatasızlık. 17 dosyada stereo 32kHz PCM, sessiz olmayan sinyal ve −3dBFS altı tepe seviyesi ayrıca doğrulandı.

Kurulum iki kez uygulanır; tek route ve script bağlantısı kalır. Filtreli sparse clone büyük ilgisiz görselleri indirmez. Paket SHA-256 ve ZIP CRC ile doğrulanır.

## Resmî mekanik kaynağı

https://www.pragmaticplay.com/en/games/the-dog-house-slot/

https://www.pragmaticplay.com/en/news/pragmatic-play-launches-the-dog-house/

Bu sayfalar orijinal 5×3/20 çizgi, orta makaralarda çarpanlı Wild, sticky bonus ve 6.750× bağlamını doğrular. Megaways, Multihold veya Royal Hunt varyantlarının ek özellikleri aktarılmadı. Sağlayıcının kodu/grafiği/sesi kullanılmadı.

## Tek dosyalık demo

Paket kökündeki index.html bütün PNG, WAV, CSS, Canvas, JavaScript ve Web Audio motorunu içine gömer. 100.000 sanal Lidya ile dış dosyasız çalışır. 'Bonus demosu' yalnızca bu yerel dosyada sonraki çevirmeyi bonus gösterecek şekilde ayarlar; canlı sunucu veya matematik simülasyonunda bu kontrol bulunmaz. Canlı cüzdan entegrasyonu backend modüllerini kullanır. Prenses seslerinin ayrı prenses-ses-onizleme.html dinleme dosyası da vardır.
