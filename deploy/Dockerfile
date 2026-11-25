# Multi-stage Dockerfile for ClashLens Server
FROM node:22-alpine AS web-builder
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:alpine AS go-builder
WORKDIR /src
ENV CGO_ENABLED=0 GOTOOLCHAIN=auto
COPY go.mod go.sum ./
RUN go mod download
COPY pkg/ ./pkg/
COPY server/ ./server/
COPY --from=web-builder /src/server/internal/webembed/dist ./server/internal/webembed/dist
RUN go build -trimpath -ldflags="-s -w" -o /out/clashlens-server ./server/cmd/server

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata wget && mkdir -p /data
WORKDIR /app
COPY --from=go-builder /out/clashlens-server /usr/local/bin/clashlens-server
ENV CLASHLENS_ADDR=:8080 \
    CLASHLENS_DB=/data/clashlens.db \
    CLASHLENS_TZ_OFFSET=480 \
    TZ=Asia/Shanghai
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/v1/health || exit 1
ENTRYPOINT ["/usr/local/bin/clashlens-server"]
