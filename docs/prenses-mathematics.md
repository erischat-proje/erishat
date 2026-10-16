# Lidya Prenses — motor ve doğrulama

Prenses ErisChat'e ayrı bir oyun olarak eklenir. Hasan, Dede ve Şeker Sarayı dosyaları değiştirilmez. Oyun türü ve API /v1/games/prenses altında ayrıdır. User.lidya bakiyesi ve Dede/Şeker/Hasan tarafından kullanılan ortak küsurat defteri korunur. Yeni veritabanı tablosu gerekmez.

## Kurallar

- 6 sütun × 5 satır; komşuluk veya ödeme çizgisi aranmaz. Aynı sembolden 8–9, 10–11, 12+ adet ayrı ödeme dilimleridir.
- Mücevherler sarı, yeşil, mavi, turkuaz ve pembe; üst semboller ay, yıldız, güneş ve kalptir. Tam ödeme tablosu oyun içi kurallardan ve API'den okunabilir.
- Kazanan semboller çıkarılır, her sütunun kalan sembolleri sıra korunarak aşağı düşer; yeni semboller en üstten gelir. Scatter ve çarpanlar yerinde kalır.
- 4/5/6 Prenses scatter: 3×/5×/100× doğrudan ödeme ve 15 ücretsiz dönüş. Scatter ödemesi çarpanla çarpılmaz.
- Çarpan değerleri: 2, 3, 4, 5, 8, 10, 15, 20, 25, 50, 100, 250, 500. Hem ana oyun hem bonusta görünebilir.
- Aynı takla dizisi sonunda tüm kanatlı kalpler bir kez toplanır. Ana oyunda toplam takla ödemesini çarpar. Kazanan bonus dönüşünde havuza eklenir; kalıcı havuz sonraki tüm kazanan dönüşlerde uygulanır. Kazançsız dönüşteki kalpler havuzu artırmaz. Havuz sıfırsa ödeme çarpanı 1'dir.
- Bonus sırasında 3+ scatter +5 dönüş verir. Modelin normal bonus örneklemesinde yeniden tetikleme olayı 3 scatter üretir.
- Şans artırma +%25 ücret karşılığında bonus tetikleme olasılığını iki katına çıkarır; tüm düşük scatter sayılarının frekansı iki katlanmaz. Bu ayrım resmî Ante Bet açıklamasına uygundur.
- Bonus satın alma temel bahsin 100 katına 15 dönüş başlatır. Şans artırma ile birlikte satın alınamaz.
- Bir ana dönüş ve onun bağlı bonusunun toplam sınırı temel bahsin 5.000 katıdır; bonus alımında aynı tur sınırı geçerlidir. Limitte kalan ücretsiz dönüşler sona erer.

## RNG ve cüzdan

Sunucu secrets.SystemRandom kullanır. İstemciye sonuç seçimi veya rastgele sayı girişi verilmez. request_id ile aynı isteğin yeniden gönderilmesi ikinci ücret veya ödeme üretmez. Kullanıcı satırı PostgreSQL üzerinde kilitlenir; bonus sahibi, sıra ve sabit bahis kontrol edilir. Biriken ödemeler tam sayı yüzdelik birimlerle hesaplanır. Tam Lidya User.lidya'ya, kalan yüzde birimler ortak küsurat kaydına yazılır. İstemciden ayrılmak açık bonusu kaybettirmez; /active ile devam edilir.

## Ölçümler

Bu, Pragmatic'in özel matematik matrisinin kopyası değildir. ErisChat'e ait ağırlıklı ve kaskadlı modeldir. %96,50 hedef, doğrulanmış/sertifikalı kesin RTP değildir. Yapılandırma rtpStatus=calibration-pending olarak işaretlidir.

Son test sabit ve açık seed değerleri ile tam bonusları, yeniden tetiklemeleri, havuzu ve limiti içerir:

| Mod | Örnek | Ölçülen RTP | %95 güven aralığı |
|---|---:|---:|---:|
| Normal | 250.000 tam tur | %94,2081 | %90,7783–97,6380 |
| Şans artırma | 250.000 tam tur | %95,0191 | %90,9209–99,1174 |
| Bonus satın alma | 30.000 bonus | %95,7713 | %94,4182–97,1244 |

Normal ücretli dönüşte ödeme sıklığı %27,5912; bonus tetikleme gözlemi %0,2136. Ante gözlemi %0,4268. Toplam 498.885 ücretsiz dönüş simüle edildi. En büyük gözlenen kazanç 4.297,5×; 5.000× sınırının uygulanması ayrıca deterministik testle doğrulandı. Yüksek varyans nedeniyle gözlemlerin hedefe yakınlığı kesin RTP kanıtı olarak sunulmaz. Ham sonuçlar ve tüm yapılandırma prenses-statistics.json içindedir.

Tekrar üretim: `python tests/prenses_simulate.py --paid 250000 --buys 30000`. Güven aralıkları tam tur örneklerinin standart hatasıyla hesaplanır; daha büyük örnekler özellikle nadir büyük ödüller için gereklidir.

## Teknik doğrulama

15 sunucu test grubu: ödeme dilimleri, bonus alımı/devam, sahiplik/sıra, tek ödeme, küsurat, yetersiz bakiye, kilitlenmiş bakiye yenileme, hata geri alma, 5.000×, kazanılmayan kalpler, bir kez toplanan kalpler, sonraki dönüşte havuz, sütun sırası, scatter, oyun ayrımı.

Tarayıcı: mobil 390×844 ve masaüstü 1280×900; açık/koyu tema, gerçek PNG yükleme, Canvas render, düşme/patlama/asa, kazanç sayımı, bahis/Ante, satın alma onayı, bonusu durdurma/devam, klavye odak sınırı, diğer oyun açılınca kapanma, kapanış sonrası otomatik spin iptali ve JS hata kontrolü.

Kurulum: yerel filtreli/sparse klon, paket iki kez uygulama, tek route/HTML hook, tüm değişikliklerin stage edilmesi ve git diff --check. İlgisiz büyük varlıklar indirilmez. ZIP CRC ve SHA-256 kontrolü yapılır.

## Referanslar

Pragmatic Play resmî oyun açıklaması: https://www.pragmaticplay.com/en/games/starlight-princess/

Resmî tanıtım ve Ante Bet açıklaması: https://www.pragmaticplay.com/en/news/pragmatic-play-delivers-regal-adventure-in-starlight-princess/

Açıklamalardan mekanik doğrulandı. Orijinal sağlayıcının kodu, görseli, ses kaydı, kapalı makara/ağırlık matrisleri veya marka logosu pakete kopyalanmadı.

## Tek dosyalık sürüm

Paket kökündeki index.html tüm PNG'leri, CSS, Canvas renderer, JavaScript motor ve Web Audio sentezini içerir. Dış kaynak gerektirmez. 100.000 sanal Lidya ile yerel demo çalıştırır; bu dosya canlı ErisChat cüzdanına bağlanmaz. Entegrasyon dosyaları aynı kuralları sunucuda uygular ve gerçek uygulama cüzdanını kullanır. Demodaki yerel RNG veya bakiyeler canlı sonuçlar için yetkili değildir.
