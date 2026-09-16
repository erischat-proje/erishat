FROM caddy:2-alpine
COPY frontend /srv/frontend
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
