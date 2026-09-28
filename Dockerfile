FROM caddy:2-alpine
COPY frontend /srv/frontend
COPY hediyesistemi /srv/frontend/hediyesistemi
COPY Gereken_icerikler /srv/frontend/Gereken_icerikler
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
