package main

import (
	"encoding/hex"
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
	_, message, err := c1.ReadMessage()
	if err != nil {
		log.Println("read:", err)
		return
	}
	key := hex.EncodeToString(message)
	log.Println("key:", key)

	const addr2 = "ws://localhost:8080/net/"

	c2, _, err := websocket.DefaultDialer.Dial(addr2+key, nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer c2.Close()

	time.Sleep(2 * time.Second)

	assert.Equal(t, "dummy", "dimmy", "Bytes do not match")
}

func TestMasterMap(t *testing.T) {
	goggi := NewMastermap()
	randKey := generateRandomKey()
	_, ok := goggi.Get(randKey)
	assert.False(t, ok, "No item with that key")

	item := Net{}
	goodKey := goggi.Register(item)
	_, ok = goggi.Get(goodKey)
	assert.True(t, ok, "Item with that key should exist")

	goggi.Unregister(goodKey)
	_, ok = goggi.Get(goodKey)
	assert.False(t, ok, "No item with that key")
}
