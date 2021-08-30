// Copyright 2013 The Gorilla WebSocket Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

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

const(
    messageType byte = 0x0
	openType = 0x1 
    closeType = 0x2
)

// Client is a middleman between the websocket connection and the hub.
type Net struct {
	// The websocket connection.
	conn *websocket.Conn

	// Buffered channel of outbound messages.
	send chan []byte
	msend chan []byte

	register chan *websocket.Conn
}

func newNet(conn *websocket.Conn) *Net {
	return &Net{
		conn: conn,
		send: make(chan []byte, 256),
		msend: make(chan []byte, 256),
		register: make(chan *websocket.Conn),
	}
}

// readPump pumps messages from the websocket connection to the hub.
//
// The application runs readPump in a per-connection goroutine. The application
// ensures that there is at most one reader on a connection by executing all
// reads from this goroutine.
func (n *Net) readPump() {
	defer func() {
		//c.hub.unregister <- c
		n.conn.Close()
	}()
	n.conn.SetReadLimit(maxMessageSize)
	n.conn.SetReadDeadline(time.Now().Add(pongWait))
	n.conn.SetPongHandler(func(string) error { n.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := n.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		n.msend <- message
	}
}



// writePump pumps messages from the hub to the websocket connection.
//
// A goroutine running writePump is started for each connection. The
// application ensures that there is at most one writer to a connection by
// executing all writes from this goroutine.
func (n *Net) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		n.conn.Close()
	}()
	for {
		select {
		case message, ok := <-n.send:
			n.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				n.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := n.conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				return
			}
		case <-ticker.C:
			n.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := n.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func startReader(connX *websocket.Conn, n *Net, id byte) {
	defer func() {
		//c.hub.unregister <- c
		connX.Close()
	}()
	connX.SetReadLimit(maxMessageSize)
	connX.SetReadDeadline(time.Now().Add(pongWait))
	connX.SetPongHandler(func(string) error { n.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {

		_, message, err := connX.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
        n.send <- createMessageWithData(id, messageType, message)
	}
}

func createMessageWithData(id byte, cmd byte, data []byte) []byte {
	var buf bytes.Buffer
	buf.WriteByte(id)
	buf.WriteByte(cmd)
	buf.Write(data)
	return buf.Bytes()
}

func createMessage(id byte, cmd byte) []byte{
	return []byte {id, cmd}
}

func (n *Net) run() {
	var id byte = 0x0 
	var items = make(map[byte]*websocket.Conn)
	for {
		select {
		case connX := <- n.register:
			id += 1
			items[id] = connX
			n.send <- createMessage(id, openType)
			go startReader(connX, n, id)

		case message := <- n.msend:
			buf := bytes.NewBuffer(message)
			id, err := buf.ReadByte()
			if err != nil {
				log.Println(err)
				return
			}
			conn, ok := items[id]
			if !ok {
				log.Println("Item missing: " + string(id))
				return
			}
			cmd, err := buf.ReadByte()
			if err != nil {
				log.Println(err)
				return
			}
			switch cmd {
				case messageType:
					data := make([]byte, 255)
					len, err := buf.Read(data)
					data = data[:len]
					if err != nil {
						log.Println(err)
						return
					}
					err = conn.WriteMessage(websocket.BinaryMessage, data)
					if err != nil {
						return
					}

				default: 
					log.Println("Unknown byte: " + string(cmd))
			}
		}
	}
}

// serveWs handles websocket requests from the peer.
func serveNet(mm *Mastermap, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	net := newNet(conn)
    go net.run()
	key := mm.Register(*net)
	net.send <- key[:]
	//client.hub.register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines.
	go net.writePump()
	go net.readPump()
}

func serveNets(mm *Mastermap, w http.ResponseWriter, r *http.Request) {
	var url = r.RequestURI
	var keyString = strings.Split(url, "/")[2]
	var keySlice, err = hex.DecodeString(keyString)
	if err != nil {
		log.Println(err)
		return
	}
	var key [keylength]byte
	copy(key[:], keySlice)
	nav, ok := mm.Get(key)
	if !ok {
		log.Println("Can not find key " + keyString )
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	nav.register <- conn
}
