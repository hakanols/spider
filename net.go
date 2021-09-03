package main

import (
	"bytes"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const (
	messageType byte = 0
	openType         = 1
	closeType        = 2
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// allow all connections by default
		return true
	},
}

type Net struct {
	register   chan *websocket.Conn
	unregister chan byte
}

func newNet() *Net {
	return &Net{
		register:   make(chan *websocket.Conn),
		unregister: make(chan byte),
	}
}

func createMessageWithData(id byte, cmd byte, data []byte) []byte {
	var buf bytes.Buffer
	buf.WriteByte(id)
	buf.WriteByte(cmd)
	buf.Write(data)
	return buf.Bytes()
}

func createMessage(id byte, cmd byte) []byte {
	return []byte{id, cmd}
}

func writePump(conn *websocket.Conn, channel chan []byte) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()
	for {
		select {
		case message, ok := <-channel:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := conn.WriteMessage(websocket.BinaryMessage, message)
			if err != nil {
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func hostReadPump(conn *websocket.Conn, clientList *Mastermap) {
	defer func() {
		conn.Close()
	}()
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error { conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		buf := bytes.NewBuffer(message)
		id, err := buf.ReadByte()
		if err != nil {
			log.Println(err)
			return
		}
		item, ok := clientList.Get([]byte{id})
		if !ok {
			log.Println("Item missing: " + string(id))
			return
		}
		clientChannel, ok := item.(chan []byte)
		if !ok {
			log.Println("Not a Net object")
			return
		}
		cmd, err := buf.ReadByte()
		if err != nil {
			log.Println(err)
			return
		}
		switch cmd { // ToDo handle Close and pause event
		case messageType:
			data := make([]byte, 255)
			len, err := buf.Read(data)
			data = data[:len]
			if err != nil {
				log.Println(err)
				return
			}
			clientChannel <- data

		default:
			log.Println("Unknown byte: " + string(cmd))
		}
	}
}

func clientReadPump(conn *websocket.Conn, toHostChannel chan []byte, id byte, net *Net) {
	defer func() {
		net.unregister <- id
		conn.Close()
	}()
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error { conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {

		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		toHostChannel <- createMessageWithData(id, messageType, message)
	}
}

func runHost(hostConn *websocket.Conn, mm *Mastermap) {
	clientList := NewMastermap(1)
	toHostChannel := make(chan []byte, 256)

	go writePump(hostConn, toHostChannel)
	go hostReadPump(hostConn, clientList)

	net := newNet()
	key := mm.Register(*net)
	toHostChannel <- key[:]

	for {
		select {
		case clientConn := <-net.register:
			toClientChannel := make(chan []byte, 256)
			id := clientList.Register(toClientChannel)
			log.Println(id)
			toHostChannel <- createMessage(id[0], openType)
			go clientReadPump(clientConn, toHostChannel, id[0], net)
			go writePump(clientConn, toClientChannel)

		case id := <-net.unregister:
			toHostChannel <- createMessage(id, closeType)
			clientList.Unregister([]byte{id})
		}
	}
}

func serveNet(mm *Mastermap, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	go runHost(conn, mm)
}

func serveNets(mm *Mastermap, w http.ResponseWriter, r *http.Request) {
	url := r.RequestURI
	keyString := strings.Split(url, "/")[2]
	key, err := hex.DecodeString(keyString)
	if err != nil {
		log.Println(err)
		return
	}
	item, ok := mm.Get(key)
	if !ok {
		log.Println("Can not find key " + keyString)
		return
	}
	nav, ok := item.(Net)
	if !ok {
		log.Println("Not a Net object")
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	nav.register <- conn
}
