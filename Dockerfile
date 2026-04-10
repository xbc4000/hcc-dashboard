FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
EXPOSE 3080
USER node
CMD ["node", "server.js"]
