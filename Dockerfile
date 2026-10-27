# syntax=docker/dockerfile:1.4
# Media layers are independent; the small code/index layer changes per release.
FROM python:3.13-alpine AS content-index
COPY scripts/build-apk-content.py scripts/prepare-web-layers.py scripts/web-layer-plan.json /tool/
RUN --mount=type=bind,source=.,target=/source python /tool/prepare-web-layers.py --root /source --output /out --plan /tool/web-layer-plan.json

FROM caddy:2-alpine
COPY --link ["frontend/anonymous-assets", "/srv/frontend/anonymous-assets"]
COPY --link ["frontend/fan-levels", "/srv/frontend/fan-levels"]
COPY --link ["frontend/fonts", "/srv/frontend/fonts"]
COPY --link ["frontend/gift-effects", "/srv/frontend/gift-effects"]
COPY --link ["frontend/relationship-assets", "/srv/frontend/relationship-assets"]
COPY --link ["frontend/role-icons", "/srv/frontend/role-icons"]
COPY --link ["frontend/shop-expansion", "/srv/frontend/shop-expansion"]
COPY --link ["frontend/shop-lydia-premium", "/srv/frontend/shop-lydia-premium"]
COPY --link ["frontend/shop-lydia", "/srv/frontend/shop-lydia"]
COPY --link ["frontend/shop-premium-v2", "/srv/frontend/shop-premium-v2"]
COPY --link ["frontend/vip-assets", "/srv/frontend/vip-assets"]
COPY --link ["frontend/vip-designs", "/srv/frontend/vip-designs"]
COPY --link ["frontend/assets/lidya-altin", "/srv/frontend/assets/lidya-altin"]
COPY --link ["frontend/assets/lidya-ares", "/srv/frontend/assets/lidya-ares"]
COPY --link ["frontend/assets/lidya-aztek", "/srv/frontend/assets/lidya-aztek"]
COPY --link ["frontend/assets/lidya-balikci-audio", "/srv/frontend/assets/lidya-balikci-audio"]
COPY --link ["frontend/assets/lidya-balikci", "/srv/frontend/assets/lidya-balikci"]
COPY --link ["frontend/assets/lidya-bastet", "/srv/frontend/assets/lidya-bastet"]
COPY --link ["frontend/assets/lidya-candy", "/srv/frontend/assets/lidya-candy"]
COPY --link ["frontend/assets/lidya-crash-final", "/srv/frontend/assets/lidya-crash-final"]
COPY --link ["frontend/assets/lidya-dede-audio", "/srv/frontend/assets/lidya-dede-audio"]
COPY --link ["frontend/assets/lidya-dede-png", "/srv/frontend/assets/lidya-dede-png"]
COPY --link ["frontend/assets/lidya-dogparty", "/srv/frontend/assets/lidya-dogparty"]
COPY --link ["frontend/assets/lidya-firavun", "/srv/frontend/assets/lidya-firavun"]
COPY --link ["frontend/assets/lidya-games-png", "/srv/frontend/assets/lidya-games-png"]
COPY --link ["frontend/assets/lidya-games", "/srv/frontend/assets/lidya-games"]
COPY --link ["frontend/assets/lidya-ivory", "/srv/frontend/assets/lidya-ivory"]
COPY --link ["frontend/assets/lidya-kovboy", "/srv/frontend/assets/lidya-kovboy"]
COPY --link ["frontend/assets/lidya-kure", "/srv/frontend/assets/lidya-kure"]
COPY --link ["frontend/assets/lidya-menu", "/srv/frontend/assets/lidya-menu"]
COPY --link ["frontend/assets/lidya-prenses-audio-v2", "/srv/frontend/assets/lidya-prenses-audio-v2"]
COPY --link ["frontend/assets/lidya-prenses", "/srv/frontend/assets/lidya-prenses"]
COPY --link ["frontend/assets/lidya-profile-png", "/srv/frontend/assets/lidya-profile-png"]
COPY --link ["frontend/assets/lidya-ranking-v2", "/srv/frontend/assets/lidya-ranking-v2"]
COPY --link ["frontend/assets/lidya-room-png", "/srv/frontend/assets/lidya-room-png"]
COPY --link ["frontend/assets/lidya-seker", "/srv/frontend/assets/lidya-seker"]
COPY --link ["frontend/assets/lidya-wheel", "/srv/frontend/assets/lidya-wheel"]
COPY --link ["hediyesistemi", "/srv/frontend/hediyesistemi"]
COPY --link ["Gereken_icerikler", "/srv/frontend/Gereken_icerikler"]
COPY --link ["avatarveduvarkağıdı", "/srv/frontend/avatarveduvarkağıdı"]
COPY --link --from=content-index /out/frontend/ /srv/frontend/
COPY --link Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
