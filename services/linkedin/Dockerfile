# Uses the official Playwright image — Chromium and all OS deps are pre-installed
FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# linkedin_cookies.json must be mounted as a persistent volume —
# it is generated locally via `npm run setup` and uploaded once
VOLUME ["/app/linkedin_cookies.json"]

CMD ["npx", "tsx", "index.ts"]
