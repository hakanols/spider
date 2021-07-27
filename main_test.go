package main

import (
	"log"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

func TestBob(t *testing.T) {
	go main()

	const addr = "ws://localhost:8080/ws"
	var data = []byte("Hello mr scientist")

	c, _, err := websocket.DefaultDialer.Dial(addr, nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer c.Close()

	err = c.WriteMessage(websocket.BinaryMessage, data)
	if err != nil {
		log.Println("write:", err)
		return
	}

	_, message, err := c.ReadMessage()
	if err != nil {
		log.Println("read:", err)
		return
	}

	assert.Equal(t, data, message, "Bytes do not match")
}

func TestBib(t *testing.T) {

	go main()

	const addr1 = "ws://localhost:8080/net"

	c1, _, err := websocket.DefaultDialer.Dial(addr1, nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer c1.Close()

	const addr2 = "ws://localhost:8080/net/12"

	c2, _, err := websocket.DefaultDialer.Dial(addr2, nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer c2.Close()

	time.Sleep(2 * time.Second)

	assert.Equal(t, "dummy", "dimmy", "Bytes do not match")
}
