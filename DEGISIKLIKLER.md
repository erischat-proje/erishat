# ErisChat – Güncellenecek Dosyalar

Bu paket, inceleme sonucunda gerçekten değiştirilmesi gereken dosyaları içerir.

## 1. `index.html`
Kök giriş noktası eski arayüzü göstermeyecek şekilde canonical `frontend/erischat-main.html` girişine yönlendirilir.

## 2. `frontend/index.html`
Eski v54 uygulama kabuğu kaldırılır. Doğrudan bu dosyaya gelen istekler canonical `erischat-main.html` uygulamasına yönlendirilir. Böylece müşteri demo iframe'i ve doğrudan `/index.html` erişimi eski UI'ye düşmez.

## 3. `.github/workflows/erischat-pages.yml`
GitHub Pages hazırlama adımındaki ikinci kez `<script>` ekleme işlemi kaldırılır. `erischat-main.html` scriptleri zaten kendisi yüklüyor. Workflow artık:
- frontend'i olduğu gibi kopyalıyor,
- `erischat-main.html`'i Pages `index.html` yapıyor,
- canonical shell'in gerekli ana scriptleri içerdiğini doğruluyor,
- aynı JS modüllerini ikinci kez enjekte etmiyor.

## İnceleme notu
Oda yetki katmanında hem frontend hem backend kontrolü incelendi. Backend'deki oda görünümü `is_owner`, `is_moderator` ve `can_manage` alanlarını üretiyor; koltuk kilitleme/sessize alma/ban/moderatör işlemleri `require_staff` veya `require_owner` ile korunuyor. Bu nedenle bu aşamada o dosyalara gereksiz değişiklik yapılmadı.

Auth tarafında Google + email OTP akışları ve Apple/Facebook backend endpointleri mevcut. Apple/Facebook için sağlayıcı kimlik bilgileri/secret'ları olmadan sahte bir canlı sağlayıcı akışı eklenmedi.

Bu ZIP yalnızca güncellenmesi gereken dosyaları içerir; tüm repo kopyası değildir.
