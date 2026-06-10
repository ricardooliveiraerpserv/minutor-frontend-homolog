FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG BACKEND_URL
ENV BACKEND_URL=$BACKEND_URL
COPY package.json package-lock.json* ./
RUN --mount=type=cache,id=minutor-npm,target=/root/.npm \
    npm ci --cache /root/.npm
COPY . .
# Ativa o output standalone só neste build (Docker/VPS). Render não seta isso
# e segue com `next start`.
ENV NEXT_OUTPUT_STANDALONE=true
# Sem cache mount em .next/cache: Next.js às vezes reusa chunks
# compilados antigos mesmo após mudança de source. Build limpo
# garante que o source pushed é o que vai pra produção.
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# server.js do standalone respeita PORT/HOSTNAME; 0.0.0.0 é obrigatório p/ a
# rede do container (default localhost não aceita conexão de fora).
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Standalone: só os arquivos traçados + server.js mínimo (sem node_modules
# inteiro). public/ e .next/static não entram no trace — copiados à mão.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
