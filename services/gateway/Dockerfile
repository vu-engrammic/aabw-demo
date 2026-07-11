# services/gateway/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Use stub for mcp-login in container (MCP not needed with Hindsight)
RUN sed -i "s|../../scripts/mcp-login|./lib/mcp-login-stub|g" server.js

EXPOSE 8790

CMD ["node", "server.js"]
