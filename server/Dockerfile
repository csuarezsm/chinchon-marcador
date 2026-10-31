# Servidor de partidas en línea · IT Canarias
# Se construye desde la raíz del repo (usa el motor del juego de www/)
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force
COPY server/src ./server/src
COPY www/marcador.js www/juego.js ./www/
RUN mkdir -p /datos && chown node:node /datos
ENV NODE_ENV=production PORT=3100 HOST=0.0.0.0 DATA_DIR=/datos WWW_DIR=/app/www
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3100/salud >/dev/null || exit 1
CMD ["node", "server/src/server.js"]
