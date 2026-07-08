# Собирается из корня монорепы:
#   docker build -f apps/proxy/Dockerfile .
# Caddyfile запекается в образ (а не монтируется через volume) — так деплой
# работает и в Coolify, где относительный bind-mount ./Caddyfile превращается
# в пустой каталог и ломает старт контейнера.
# /etc/caddy/Caddyfile — путь конфига по умолчанию в официальном образе.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
