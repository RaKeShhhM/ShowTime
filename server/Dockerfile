FROM node:lts-alpine AS production-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:lts-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . ./

FROM node:lts-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY . ./
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "start"]
