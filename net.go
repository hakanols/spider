// Copyright 2013 The Gorilla WebSocket Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main

import (
	"bytes"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// Client is a middleman between the websocket connection and the hub.
type Net struct {
	// The websocket connection.
	conn *websocket.Conn

	// Buffered channel of outbound messages.
	send chan []byte
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
		message = bytes.TrimSpace(bytes.Replace(message, newline, space, -1))
		//n.hub.broadcast <- message
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

// serveWs handles websocket requests from the peer.
func serveNet(w http.ResponseWriter, r *http.Request) {
	log.Println("Hello")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	net := &Net{conn: conn, send: make(chan []byte, 256)}
	//client.hub.register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines.
	go net.writePump()
	go net.readPump()
}

func serveNets(w http.ResponseWriter, r *http.Request) {
	var url = r.RequestURI
	var data = strings.Split(url, "/")
	log.Println(data)
	_, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
}