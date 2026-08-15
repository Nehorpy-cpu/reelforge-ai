FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
RUN addgroup -S reelforge && adduser -S reelforge -G reelforge \
  && mkdir -p /app/data && chown -R reelforge:reelforge /app/data /app/dist /app/public
EXPOSE 3000
VOLUME ["/app/data"]
USER reelforge
CMD ["node", "dist/server.cjs"]
