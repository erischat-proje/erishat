# Generate the current public-media hashes on every web deployment.
FROM python:3.13-alpine AS content-index
WORKDIR /content
COPY scripts/build-apk-content.py /tool/build-apk-content.py
COPY frontend /content/frontend
COPY hediyesistemi /content/hediyesistemi
COPY Gereken_icerikler /content/Gereken_icerikler
COPY avatarveduvarkağıdı /content/avatarveduvarkağıdı
RUN python /tool/build-apk-content.py --root /content --web-index /content/frontend/apk-content-manifest.json

FROM caddy:2-alpine
COPY --from=content-index /content/frontend /srv/frontend
COPY --from=content-index /content/hediyesistemi /srv/frontend/hediyesistemi
COPY --from=content-index /content/Gereken_icerikler /srv/frontend/Gereken_icerikler
COPY --from=content-index /content/avatarveduvarkağıdı /srv/frontend/avatarveduvarkağıdı
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
