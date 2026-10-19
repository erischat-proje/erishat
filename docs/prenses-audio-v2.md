# Prenses sesleri v2

Eski saf oscillator bipleri kaldırıldı. Yerine yerel stereo WAV sound bank kullanılır; Web Audio API decode/play, ses kilidi açma, ortak kompresör ve 10 seslik eşzamanlı sınır sağlar. Mute, uygulamanın arka plana gitmesi ve oyundan çıkış tüm sesleri durdurur. Yüklenecek dosyalar aynı pakettedir; çalışma sırasında Freesound bağlantısı gerektirmez.

9 olay: spin, land, burst, magic, collect, reaction, payout, bonus, win. Kaskad ilerledikçe burst tonu kontrollü artar. Çok sık asa/reaksiyon sesleri cooldown ile sınırlanır. Prenses reaction konuşma değildir; kısa ve yumuşak sihirli çan vurgusudur.

Sihir: tgerginov — https://freesound.org/people/tgerginov/sounds/671175/

Çanlar: steffcaffrey — https://freesound.org/people/steffcaffrey/sounds/435075/

Sihir patlaması: DAN2008 — https://freesound.org/people/DAN2008/sounds/214455/

Dog Party havlaması: michael_grinnell — https://freesound.org/people/michael_grinnell/sounds/464400/

Sayfalarda CC0 1.0 lisansı doğrulandı; indirilen CC0 önizlemeler stereo 32kHz PCM'e dönüştürüldü, kısa olaylara bölündü, özgün harmonik çan ve gürültü katmanlarıyla düzenlendi. Küçük stereo yansımalar, baş/son fade ve tepe sınırlama uygulandı. Diğer ahşap/duruş/çark cue'ları özgün sentezdir. Kaynak URL'leri ve indirilen dosya boyutları party-audio-sources.json içindedir. Sağlayıcının müzik/karakter sesleri kopyalanmadı.

Frontend/games/prenses-audio.js değişir; Prenses'in motor, ödeme tablosu, arayüz ve mevcut bonus kayıtları değişmez. Ana HTML ses scripti önbellek sürümü party-audio2 olur. Yayından sonra uygulamayı tamamen kapatıp yeniden aç.
