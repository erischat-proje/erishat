# Kovboy ve Candy Ultimate güncellemesi

## Ortak bahis ve satın alma

SlotStakes tek kaynaktır. Dede/Seker/Balikci/Prenses/DogParty alias dosyaları ona yönlenir; Candy ve Kovboy doğrudan aynı modülü kullanır. HTML'de ortak script aliaslardan ve controllerlardan önce yüklenir. Mevcut beş slotun satın alma akışı zaten vardır ve korunur. Yeni Kovboy100× ücret/8 dönüş, Candy mevcut100× ücret/10..30 dağılımını kullanır. Kalıcı standart frontend/games/AGENTS.md içinde yer alır.

Candy'nin sabit50 artırma/azaltma kodu kaldırıldı. Doğru bandın adımı,1/10000 sınırları, yetersiz bakiye kilidi, bonus giriş/bitiş paneli ve makbuz alındığında wallet event tamamlandı. Candy backend/math dosyaları değiştirilmedi; açık bonuslar aynı sürüm ve spotlarla sürer. Eski Candy görselleri üretimde yeniden taşınmaz. Güncel tek dosya demo kendi içine mevcut PNG'leri gömer.

## Kovboy sunucu durumu

20 hücre row-major5×4.10 normal sembol,Wild10,Scatter11.40 benzersiz sabit çizgi kendi özgün çizgi tablosuyla oyun kurallarında görselleştirilir. Soldaki normal sembol hedef alınır, ilk kopmaya kadar eşleşmeler sayılır;3+ ödeme. Yalnızca eşleşen prefix içindeki Wildların2/3/5× değerleri toplanır.2/3/4. makaralarda Wild;1/3/5. makaralarda Scatter.5 dairesel1000 sembollük strip ve4 satırlık gerçek pencere seçilir. CSPRNG durak/Wild/Scatter/overlay seçer; strip oluşturmanın sabit geliştirme tohumu üretim RNG'si değildir.

Ana oyundaki3 Scatter8 dönüş açar. Başlangıç sticky{}: tetikleyici ana oyunun Wildları taşınmaz. Bonusun yeni Wildları konum ve çarpanla saklanır; mevcut Wildın çarpanı yeniden çekilmez. Altın yıldız overlay ayrı bir index listesi olduğundan alttaki sembol/Wild silinmez.0/1 yıldız ek dönüş vermez;2/3/4/5,+4/+8/+12/+20. Maksimum tur1000000 yüzlük temel bahis=10000×; cap tüm paid+bonus toplamına uygulanır, kalan dönüşler atılır.

Bonus floor1000 yüzlük=10×, yalnızca bonusun kendi ödemesine uygulanır. State.bonus_hundredths ana oyunu içermez. Son ücretsiz dönüşten sonra ek dönüş yoksa fark max(0,1000-bonus_hundredths) kadar ve kalan cap içinde bir kez eklenir. GameRound receipt arşivi tekrar gönderimde aynı makbuzu döndürür; ikinci kez floor veya debit olmaz.100× satın alımda10× floor ücret iadesi değildir.

Kullanıcı satırı with_for_update/populate_existing ile kilitlenir. User.lidya ve ortak dede_wallet remainder yüzlük aritmetiği korunur. GameRound,GameBet,GamePlay mevcut şemaya yazılır. Yeni tablo/migration yok. Round ownership,sequence,stake ve action doğrulanır; istemcinin board/sticky/payout alanları extra=forbid ile reddedilir. Ağ belirsizliğinde kullanıcıya özel sessionStorage UUID/payload saklanır. Kapatma bonusu silmez; active endpointten devam edilir.

## Matematik

Özgün paytable100 yüzlük=1× toplam bahis cinsindedir. Üretim reel strips,Wild dağılımı65/25/10 (%2×/3×/5× değil ağırlık),normalWildRate0.0125,bonusWildRate0.0243; doğal bonus1/202. Overlay count ağırlıkları[9250,400,300,40,9,1]. Ana oyun ve satın alınan bonus aynı bonus modelini kullanır.

30k kalibrasyon: ortalama bonus96.4704633× ±3.18891×95% yarı aralık;normal50k pilot0.48554×±0.01399×. Hedef%96.51'e göre model seçildi. Bağımsız500k normal/50k buy ölçümü ayrı seedlerle ve full bonus/retrigger/floor/cap maliyetleriyle kovboy-statistics.json'a yazıldı. Normal tahmin%98.1945,CI%91.2445–105.1445;buy%97.131384,CI%94.622588–99.640180. Volatilite nedeniyle normal örneklem aralığı geniştir; hedef kesin oran veya sertifika diye gösterilmez. Tohumlar değiştirilerek sonuç seçilmez.

## PNG ve render/ses

Özgün12 şeffaf sprite:wood10/J/Q/K/A,holster,gold bag,cowgirl,deputy,sheriff,canyon Scatter,badge Wild. Menü1200×600 PNG,yazı ve şerif yüzü kesilmeden2:1. Built-in image generation prompt:4×3 original warm leather/wood/gold western icons; KOVBOY left title,sheriff right,saloon/canyon/Lydian ornament wide cover. Atlas alpha arka planı image generation edit ile kaldırıldı; manuel hücre sınırlarından ayrı PNG sprite'lar çıkarıldı. Tam atlas veya geçici görseller payload'a konmadı.

Canvas DPR≤2, gerçek reelWindows kaydırma/deceleration/bounce, sabit Wildın yerinde kalması,rozet çakılma/altın parçacık,overlay yıldızın sayaca uçuş izi,40 çizgi önizleme,kazanç sayımı ve büyük kazanç banner. Mobil320/390 ve desktop1280,light/dark. Renderer RAF/timerler close sırasında temizlenir;background autoplay/ses durur;reduced-motion süreleri kaldırır.

Kovboy WebAudio master.16,kompresör(-24dB,ratio4),6 voice cap,rate limits. Quiet western whistle pattern,wood click,filtered short gun-noise/thump,gold chime. Varsayılan kapalı;toggle/close/background müzik timerini ve sesleri temizler. Oyun içine MP3 veya dış URL eklenmez.

## Kaynak ve doğrulama

- https://www.pragmaticplay.com/en/news/pragmatic-play-rides-into-town-with-wild-west-gold/ :5×4,40payline,sheriff multiplier,sticky bonus,10000×.
- https://www.pragmaticplay.com/tr/oyunlar/wild-west-gold/ :2/3/5× additiveWild,8 başlangıçFreeSpin,2..5 ekScatter ile4..20 ekdönüş.
- Kullanıcı spesifikasyonu:100× satın alım,overlay2/3/4/5 için4/8/12/20 vebonus10× floor. Bunlar Kovboy'da açık kendi kuralları olarak uygulanır; sağlayıcının gizli matematiği veya birebir reel/çizgi kopyası iddia edilmez.

Kontroller:16 KovboyAPI/motor+17 mevcutCandy testi,ortak bahis band/alias testi,Playwright satınalma iptal/tekistek,bonus sürdürme,40çizgi,mobil iki tema,actual non-reduced VFX/voice cap/müzik/renderer temizliği,iki self-contained file:// demo. Termux kurulumunun iki kez çalışması,tekrouter/script eklenmesi,script sırası,git diff check ve paket SHA/ZIPCRC kontrol edilir.
