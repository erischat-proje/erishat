# Hediye ve pencere yerleşimi doğrulaması

Kaynak: auth-unified-v1, 1fb58612ffc7d6c5c09dd80a9c1c066e6e0bae66 (#307).

## Bulunan nedenler

- device-layout.css pencereyi üstten 12px konumlandırıyordu; agora-gifts.css içindeki translate(-50%,-50%) hâlâ yarım pencere yüksekliği yukarı çekiyordu. Testte üst sınır -397px idi.
- .egp-select img seçicisi, Lidya dönüştürücüsünün sonradan eklediği fiyat coin'ine de uygulanıyordu. Yüksek fiyat testinde coin genişliği 37.9px oldu.
- Küçük ekranlarda sabit yatay adet satırı footer genişliğini aşabiliyordu.

## Değişiklikler

Hediye penceresi tek görünür viewport koordinat sistemini kullanır; yalnızca yatay ortalama dönüşümü kalır. Yükseklik kullanılabilir alan ve güvenli alanlara uyar. Başlık ve ödeme kontrolleri sabit, orta liste kaydırılabilirdir. Adet butonları altı eşit sütundur. Büyük hediye artwork img öğesi ile küçük para img öğesi ayrı seçilir. Otomatik Lidya coin'leri bütün uygulamada 1.05em ve en çok 22px boyutundadır.

Aşağıdaki 21 portal kökü için eski ortalama dönüşümü kaldırılır; görünür viewport başlangıcı, genişliği ve kullanılabilir yüksekliği korunur:

| Grup | Pencere kökleri |
| --- | --- |
| Genel | .modal, .chat, .eris-mini-shade |
| Profil/VIP | .eris-vip-overlay, .eph-overlay, #erisUserProfileModal |
| İlişki/Aile | .rel-page, .rel-overlay, #erisHub |
| Hesap | #erisGoogleGate, #erisAccountPicker |
| Mesajlar | .dm-vault-modal, .dm-gift-sheet |
| Oyun | #erisGamesModal |
| Yönetim | .eris-admin-overlay, .eb-overlay, .esi-overlay, .lp-overlay |
| Oda araçları | #erisMusicPanel, #erisRoomWallpaperModal, #erisRoomWallpaperZoom |

Katmanlar korunur: hediye gölgesi 90049, hediye seçici 90050, medya görüntüleyicileri 91000, kamera 92000, hediye önizlemesi 93000. Önizleme kapatma düğmesinin en üstte tıklanabilir olduğu kontrol edildi. Bütün uygulama için yeni bir z-index değeri zorlanmadı.

## Kontroller

- Orijinal sürümde iki hata yeniden üretildi.
- Playwright: aydınlık/koyu, 320×568, 360×640, 393×850, 430×932, 568×320, 844×390, 768×1024, 1280×800.
- 21 portal kökünün ekran sınırları kontrol edildi.
- Klavye: görünür viewport 377×360, başlangıç (8,16); hediye penceresi sınır içinde kaldı.
- Başlık/footer, orta liste kaydırma ve yatay taşma kontrol edildi.
- Dinamik coin'ler başlık, kart, fiyat ve toplamda en fazla 22px kaldı.
- Odak/kaydırma geri yükleme ve taklit API ile alıcı/hediye/adet payload'u kontrol edildi.
- Uygulamanın 79 CSS dosyası birlikte yüklendi.

Üretimden hediye gönderilmedi; canlı dağıtım yapılmadı. 21 kökün geometrisi test edildi; tüm alt ekranların gerçek sunucuyla uçtan uca işlev testi bu kontrolün kapsamı değildir.
