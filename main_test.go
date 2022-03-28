package main

import (
	"encoding/hex"
	"log"
	"testing"
	"bytes"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

func TestSpider(t *testing.T) {

	go main()

	const addr = "ws://localhost:8080/net"

	hostConn, _, err := websocket.DefaultDialer.Dial(addr, nil)
	assert.Nil(t, err, "Got error")
	defer hostConn.Close()

	_, message, err := hostConn.ReadMessage()
	assert.Nil(t, err, "Got error")
	key := hex.EncodeToString(message)
	log.Println("Key:", key)

	clientConn, _, err := websocket.DefaultDialer.Dial(addr+"/"+key, nil)
	assert.Nil(t, err, "Got error")
	defer clientConn.Close()

	var data = []byte("Hello mr scientist")
	err = clientConn.WriteMessage(websocket.BinaryMessage, data)

	_, message, err = hostConn.ReadMessage()
	assert.Nil(t, err, "Got error")
	buf := bytes.NewBuffer(message)
	id, err := buf.ReadByte()
	assert.Nil(t, err, "Got error")
	cmd, err := buf.ReadByte()
	assert.Nil(t, err, "Got error")
	assert.Equal(t, byte(openType), cmd, "Byte do not match")

	_, message, err = hostConn.ReadMessage()
	assert.Nil(t, err, "Got error")
	assert.Equal(t, append([]byte{id, messageType}, data...), message, "Bytes do not match")

	var data2 = []byte("Hawksnumber")
	err = hostConn.WriteMessage(websocket.BinaryMessage, append([]byte{id, messageType}, data2...))

	_, message, err = clientConn.ReadMessage()
	assert.Nil(t, err, "Got error")
	assert.Equal(t, data2, message, "Bytes do not match")

	clientConn.Close()
	_, message, err = hostConn.ReadMessage()
	assert.Nil(t, err, "Got error")
	assert.Equal(t, []byte{id, closeType}, message, "Bytes do not match")
}

func TestMasterMap(t *testing.T) {
	goggi := NewMastermap(8)
	randKey := generateRandomKey(8)
	_, ok := goggi.Get(randKey)
	assert.False(t, ok, "No item with that key")

	item := newHost()
	goodKey := goggi.Register(item)
	result, ok := goggi.Get(goodKey)
	assert.True(t, ok, "Item with that key should exist")
	assert.Equal(t, item, result, "Not the same item")

	goggi.Unregister(goodKey)
	_, ok = goggi.Get(goodKey)
	assert.False(t, ok, "No item with that key")
}
