FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# session/ is mounted as a persistent volume on Railway/Render/Fly.io
# so auth survives restarts without re-pairing
VOLUME ["/app/session"]

CMD ["npx", "tsx", "index.ts"]
