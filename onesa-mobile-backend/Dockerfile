FROM node:24.22.1-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24.22.1-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 DATABASE_PATH=/app/var/onesa-mobile.sqlite
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json docker-entrypoint.mjs ./
COPY --chown=node:node src ./src
RUN mkdir -p /app/var && chown node:node /app/var && chmod 700 /app/var
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '4000') + '/healthz').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"
CMD ["node", "docker-entrypoint.mjs"]
