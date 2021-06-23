# Build compile container
FROM golang:1.12 as build-env
WORKDIR /go/src/app
ADD . /go/src/app
RUN go get -d -v ./...
RUN go build -o /go/bin/app .

# Build run container
FROM gcr.io/distroless/base
COPY --from=build-env /go/bin/app /
EXPOSE 8080/tcp
CMD ["/app"]