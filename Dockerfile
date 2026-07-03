FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server/ ./server/
COPY dist/ ./dist/
COPY data/ ./data/
EXPOSE 3000
CMD ["node", "server/index.js"]
