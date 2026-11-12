FROM golang:1.27-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /server ./cmd/server
FROM alpine:3.22
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown -R app:app /data
COPY --from=build /server /server
USER app
EXPOSE 8080
ENTRYPOINT ["/server"]
