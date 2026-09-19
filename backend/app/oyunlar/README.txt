ERISCHAT OYUNLAR MİMARİSİ
1. Her oyun kendi .py motoruna sahiptir.
2. Her oyunun aynı klasörde kendi .txt teknik belgesi bulunur.
3. registry.py motorları tek katalogda toplar.
4. platform_routes.py yalnızca ana sistem bağlantısı, kimlik doğrulama, oda yetkisi ve GameRound/GamePlay persistence işlerini yönetir.
5. Blackjack multi-step state'i GameRound.state_data üzerinden devam eder.
6. Oyunlar free-play'dir; Lidya/Lidya Gem bahis/payout sistemine bağlanmaz.
