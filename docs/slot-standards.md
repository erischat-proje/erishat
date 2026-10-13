# Kalıcı oyun standardı

Dede, Şeker Sarayı, Balıkçı Hasan, Prenses, Dog Party, Candy Ultimate ve Kovboy tek SlotStakes modülünü kullanır.

| Aralık | Artırma/azaltma adımı |
|---|---:|
|1–200|50|
|200–1000|100|
|1000–5000|200|
|5000–10.000|250|

Başlangıç50, minimum1, maksimum10.000. Sınırda artırma üst bandın, azaltma alt bandın adımını kullanır. Örnek200→300 artırma,200→150 azaltma;1000→1200 artırma,1000→900 azaltma. Aralık dışına çıkılmaz.

Tüm bu slotlarda bonus satın alma bulunur. Mevcut Dede/Şeker/Hasan/Prenses/Dog matematiği ve satın alma ücretleri değiştirilmez. Candy100× karşılığında mevcut sunucu dağılımından10/12/15/20/30 dönüş, Kovboy100× karşılığında8 dönüş açar. Ücret onayı, yetersiz bakiye engeli, aktif bonus engeli, sunucu debit/idempotency ve bonusu sürdürme zorunludur.

Gelecek oyunlar için aynı kurallar frontend/games/AGENTS.md içinde de kaydedildi. Üretim cüzdanı User.lidya ve ortak dede_wallet küsuratıdır; tek dosya demolar sanal bakiyeyle açıkça ayrıdır.
