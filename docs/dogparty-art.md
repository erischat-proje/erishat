# Dog Party PNG üretimi

Built-in imagegen ile ErisChat için orijinal PNG atlas ve ayrı menü kapağı üretildi. Sağlayıcının köpek, kulübe veya logosu kopyalanmadı. Atlas transparan alfa korunarak hücrelere ayrıldı; komşu satır parçaları dışarıda bırakıldı. Son dosyalar frontend/assets/lidya-dogparty/ altında.

Atlas prompt seti: Tam 4×4, eşit hücreli, gerçek şeffaf arka plan; hücre kenarlarından %15 boşluk. Premium sıcak altın vurgulu boyalı 3D çizgi film ikonları. Satır1: altın 10/J/Q/K. Satır2: altın A, beyaz kemik ve altın kurdele, kırmızı taşlı tasma, mutlu Dachshund. Satır3: Pug, Shih Tzu, Rottweiler ve taşlı altın pati. Satır4: kırmızı çatılı ahşap kulübe, altın kilit, altın para yığını ve kırmızı bandanalı tam boy mutlu Rottweiler. 10/J/Q/K/A dışında yazı yok; tek hücre sınırı, başka marka/arka plan yok.

Kapak promptu: Geniş 3:2, sol üstte tam 'DOG PARTY' kabartmalı altın/krem başlık; sağda kırmızı çatılı ahşap kulübe ve dört arkadaş köpek, güneşli bahçe, çimen, parti flamaları ve birkaç altın para. Premium detaylı çizgi film, sıcak ışık; başka yazı/marka yok.

16 atlas varlığı + menu-cover.png paketlenir. Oyun native Canvas PNG'leri çizer; sayı/çarpan, çizgi, ışık, kilit parçacığı ve kazanç konfeti katmanları render edilir. Maskot hafif salınır; reel duruşu seke hareketi, sabit kulübe çakılma/parlama hareketi içerir. 2D sprite/tween kullanılır, kare kare 3D film değildir.
