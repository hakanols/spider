package main

import (
	"bytes"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"
	"fmt"

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

type Client struct {
	clientChannel chan []byte
	conn          *websocket.Conn
}

func newClient(conn *websocket.Conn) *Client {
	return &Client{
		clientChannel: make(chan []byte, 256),
		conn: conn,
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

func hostReadPump(conn *websocket.Conn, clientList *Mastermap, net *Net, closeSignal chan struct{}) {
	defer func() {
		closeSignal <- struct{}{}
		conn.Close()
	}()
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error { conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if !websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("hostReadPump error: %v", err)
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
		client, ok := item.(Client)
		if !ok {
			log.Println("Not a Net object")
			return
		}
		cmd, err := buf.ReadByte()
		if err != nil {
			log.Println(err)
			return
		}
		switch cmd { // ToDo pause event
		case messageType:
			data := make([]byte, 255)
			len, err := buf.Read(data)
			data = data[:len]
			if err != nil {
				log.Println(err)
				return
			}
			client.clientChannel <- data

		case closeType:
			client.conn.Close()
			net.unregister <- id


		default:
			log.Println( fmt.Sprintf("Unknown byte: %x", cmd) )
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
			if !websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("clientReadPump error: %v", err)
			}
			break
		}
		toHostChannel <- createMessageWithData(id, messageType, message)
	}
}

func runHost(hostConn *websocket.Conn, mm *Mastermap) {
	clientList := NewMastermap(1)
	toHostChannel := make(chan []byte, 256)
	closeSignal := make(chan struct{})
	net := newNet()

	go writePump(hostConn, toHostChannel)
	go hostReadPump(hostConn, clientList, net, closeSignal)
	
	key := mm.Register(*net)
	log.Println( fmt.Sprintf("New spider socket: %x", key) )
	toHostChannel <- key[:]

	loop:
	for {
		select {
		case clientConn := <-net.register:
			client := newClient(clientConn)
			id := clientList.Register(*client)
			log.Println( fmt.Sprintf("New socket key: %x id: %x", key, id) )
			toHostChannel <- createMessage(id[0], openType)
			go clientReadPump(clientConn, toHostChannel, id[0], net)
			go writePump(clientConn, client.clientChannel)

		case id := <-net.unregister:
			if (clientList.Has([]byte{id})){
				toHostChannel <- createMessage(id, closeType)
				clientList.Unregister([]byte{id})
				log.Println( fmt.Sprintf("Close socket key: %x id: %x", key, []byte{id}) )
			}

		case <- closeSignal:
		    break loop
		}
	}
	mm.Unregister(key)
    log.Println( fmt.Sprintf("Close spider socket: %x", key ))
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
