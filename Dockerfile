# APTSpace — production-style container (practice / cloud deploy)
FROM node:22-alpine

WORKDIR /app

# Install server dependencies first (layer cache)
COPY client/server/package.json client/server/package-lock.json ./client/server/
RUN npm ci --prefix client/server --omit=dev

# App source
COPY client/ ./client/
COPY package.json ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "client/server/src/server.js"]
