FROM node:20-bookworm-slim

# build tools cho native module better-sqlite3 (phòng khi không có prebuild cho arch)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .
RUN npm run build            # dựng old-system/data.db (truth) + new-system/data.db (migrated, có lỗi)

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "deploy/gateway.js"]
