# Firavun’un Sırrı

## Mekanik
5×3 row-major grid ve10 benzersiz sabit çizgi. Normal sembol0..8,Kitap9. Kitap normal çizgide Wild;Scatter olarak3/4/5+ kitap2/20/200× ödeme yapar. Her normal çizgide en yüksek uyumlu sembol ödeme kombinasyonu bir kez ödenir;Book-only prefix durumunda en yüksek geçerli tablo değeri seçilir. Düşük semboller3,yüksek semboller2 bitişik makaradan itibaren ödeme yapar.

Bonus girişinde sunucu9 normal sembolden birini ağırlıkla seçer. Kitap seçilmez. Aynı seçili sembol tüm başlangıç10 dönüş ve yeniden tetiklemelerde korunur. Genişleme yalnızca gerçek seçili sembolü içeren farklı makaraları sayar;aynı makaradaki3 aynı sembol1 makara sayılır,Kitap Wild seçili sembol yerine genişlemez. En az3 düşük veya2 yüksek sembollü makara varsa bu makaralar3 satırı doldurur. Makaraların bitişik veya en soldan başlaması gerekmez. Seçili sembolün makara sayısı için ödemesi10 çizginin tamamına uygulanır.

Ödeme sırası:orijinal board normal çizgi→orijinal board Book Scatter→ayrı genişleme. Genişleme sonrası diğer semboller için çizgiler yeniden değerlendirilmez. Üç faz toplanır ve kalan5000× tur cap ile sınırlandırılır. Genişleme Kitap hücresini kaplasa bile Book sayısı önce hesaplandığından ödeme ve+10 retrigger korunur. Yeniden tetiklemede sembol değişmez;ek dönüş sayısına sabit sınır konmaz,cap bütün bonusu bitirir.

100× satın alma10 FS ve seçili sembolü doğrudan oluşturur;ilk satın alma işleminde Scatter kazancı verilmez. Resmî satın alma girişinin weighted3..5Scatter spinine karşı bu kendi profilinin giriş davranışıdır. Doğal ve satın alınan bonuslar aynı ödeme kurallarıyla ayrı seçili-sembol makara tablolarına sahiptir.

## Sunucu ve cüzdan
User.lidya ile ortak dede_wallet fractional ledger. Kilitli kullanıcı satırı,integer yüzlük ödeme/ücret,kullanıcıya bağlı UUID round/receipt kimlikleri. GameRound/Bet/Play mevcut tablolar;şema değişimi yok. Makbuz arşivi eski tekrar gönderimi de güvenli döndürür. Stake,sequence,ownership,action kilitli. Special/purchased/board/payout istemci alanları extra=forbid ile reddedilir. Bonus profile state.entry'den,special state.special'den alınır. CSPRNG SystemRandom üretim RNG'si;simülasyon seedleri üretime kullanılmaz.

SlotStakes mevcut tek kaynaktır:1–200/50,200–1000/100,1000–5000/200,5000–10000/250,initial50. Ortak SlotBonusBuy fiyat/bakiye onayı ve satın alma kilitleri kullanılır. Pending payload sessionStorage'da kullanıcı id'siyle saklanır;hatalı ağda aynı UUID tekrar edilir. Bonus active endpoint üzerinden seçilen sembol ve kalan dönüşle sürdürülür.

## Matematik
Özgün paytable toplam bahis cinsinde yüzlüklerdir.5 dairesel1000 sembollük makara,3 hücrelik reel windows. Bonus tabloları seçili sembole göre ayrıdır;doğal bonus selectedRate.142,satın alınan bonus .155. Special ağırlıkları[20,19,18,17,16,5,3,1.5,.5]. Normal ve bonus3+Book tetikleme1/150;Book0/1/2 count ağırlıkları[95,5,0],triggerBook3/4/5 ağırlıkları[985,14,1]. Böylece bonus sırasında sınırsız+10 yeniden tetikleme olasılığı vardır. Başka kullanıcıya göre farklı oran veya sonuca müdahale yoktur.

%96,50 hedef sertifika değildir.500k normal ve50k satın alınan bağımsız turlar tüm başlangıç/bonus/retrigger/faz/cap ödemeleriyle ölçülür. Sonuçlar firavun-statistics.json'da ham seedler ve güven aralıklarıyla yer alır. Normal%97.3431,CI%92.0128–102.6734;buy%95.914005,CI%93.8467–97.9813. Bonus frekansı normal örneklemde .006876;yüksek volatilite normal güven aralığını genişletir. Hedefe eşitmiş gibi sunulmaz.

## Görsel/ses
10 özgün alpha PNG sprite ve1200×600/2:1 menü kapak. Image generation prompt seti:gold/turquoise hieroglyph10/J/Q/K/A,scarab,black cat bust,pharaoh mask,original explorer with lantern,gold Eye-of-Horus book;wide FİRAVUN’UN SIRRI title+pyramid/Nile/explorer/book scene. Atlas ayrı hücrelerden çıkarılmış,orijinal marka görseli veya ses dosyası kullanılmamıştır.

Canvas DPR≤2/RAF,gerçek reel windows,kademeli durma/bounce,2Book sonrası kalan makaralarda anticipation,normal çizgi gösterimi,Kitap parlaması,dikey altın genişleme,10 çizgi genişleme izi vealtın parçacıklar. Bonus başlangıcında açılan altın kitap,CSS RTL page-flip ve final sunucu sembolünü gösterme. Animasyon dönerken gösterilen semboller yalnızca görseldir;sonuç seçilmez. Reduced-motion süreleri kaldırır. Mobil320/390/desktop1280,light/dark,focus trap/Escape,background autoplay/ses pause,close RAF/timer cleanup.

WebAudio master .14/6voice cap/compressor(-24,ratio4),low-levelPhrygian-style flute melody,book paper/cover noise,stone stop,expansion/chimes. Varsayılan kapalı;mute/background/close müzik timerleri ve kaynakları temizler. MP3 veya dış asset URL bağımlılığı yoktur.

## Kaynaklar
- https://www.pragmaticplay.com/en/games/john-hunter-and-the-book-of-tut-slot/ :10 FS,seçili genişleyen sembol,+10 yeniden tetikleme,asıl oyun5500× cap. Firavun kullanıcı isteği5000× cap kullanır.
- https://www.pragmaticplay.com/en/news/pragmatic-play-releases-brand-new-instalment-to-john-hunter-series/ :5×3,Book Scatter,bonus buy,bonus expanding pay-anywhere.
- https://thescorebethelp.zendesk.com/hc/en-us/articles/15313590346253-John-Hunter-and-the-Book-of-Tut :lisanslı operatör kuralları,normal+expanded ayrı fazlar,100× satın alma ve mystery sembole göre ayrı bought reel tabloları.

Sağlayıcının gizli reel/RTP modeli veya10 çizgi düzeninin birebir kopyası iddia edilmez;Firavun özgün tablolara ve belirtilmiş kurallara sahiptir.

## Doğrulama
16 engine/API testi:normal soldan ödeme,Wild best-only,Scatter3..5,disjoint-reel expansion,aynı-reel/Book Wild sınırı,phase toplamları,cap,retrigger/selected persistence,buy charge/resume/late replay,ownership/sequence/stake,server-owned buy profile,RNG rollback,funds,fractional shared wallet. Browser own menu/no Wheel,price/cancel/single debit,10FS/symbol persistence,bands,10line panel,mobil iki tema;non-reduced VFX/audio veoffline tek dosya demo kontrolü. Termux scripti sparse clone/idempotent uygulama,syntax/diff veSHA+ZIPCRC kontrolü.
