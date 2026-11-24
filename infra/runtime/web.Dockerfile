FROM node:24.22.1-alpine AS build
WORKDIR /web
COPY onesa-mobile-frontend/web/package.json onesa-mobile-frontend/web/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY onesa-mobile-frontend/web/ ./
RUN npm run build

# Official NGINX unprivileged distribution. Qualify and pin a digest for each release.
FROM nginx/nginx-unprivileged:stable-alpine
COPY --from=build --chown=101:101 /web/dist /usr/share/nginx/html
COPY --chown=101:101 infra/runtime/nginx.conf /etc/nginx/nginx.conf
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx", "-g", "daemon off;"]
