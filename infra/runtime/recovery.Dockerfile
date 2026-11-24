FROM node:24.22.1-alpine
WORKDIR /recovery
COPY --chown=node:node scripts/backup-lib.mjs scripts/backup.mjs scripts/restore.mjs scripts/recovery-entrypoint.mjs ./
USER node
ENTRYPOINT ["node", "recovery-entrypoint.mjs"]
CMD ["backup.mjs", "--help"]
