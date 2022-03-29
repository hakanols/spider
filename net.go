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

type Host struct {
	startClient       chan *websocket.Conn
	closeClientSignal chan byte
}

func newHost() *Host {
	return &Host{
		startClient:       make(chan *websocket.Conn),
		closeClientSignal: make(chan byte),
	}
}

type Client struct {
	sendChannel chan []byte
	closeSignal chan struct{}
	conn        *websocket.Conn
}

func newClient(conn *websocket.Conn) *Client {
	return &Client{
		sendChannel: make(chan []byte, 256),
		closeSignal: make(chan struct{}),
		conn:        conn,
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

func writePump(conn *websocket.Conn, channel chan []byte, closeSignal chan struct{}) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		closeSignal <- struct{}{}
		ticker.Stop()
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

func readPump(conn *websocket.Conn, receiveChannel chan []byte, closeSignal chan struct{}) {
	defer func() {
		closeSignal <- struct{}{}
	}()
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error { conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if !websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("readPump error: %v", err)
			}
			break
		}
		receiveChannel <- message
	}
}

func runHost(hostConn *websocket.Conn, mm *Mastermap) {
	clientList := NewMastermap(1)
	hostSendChannel := make(chan []byte, 256)	
	hostReceiveChannel := make(chan []byte, 256)
	closeHostSignal := make(chan struct{})
	host := newHost()

	go writePump(hostConn, hostSendChannel, closeHostSignal)
	go readPump(hostConn, hostReceiveChannel, closeHostSignal)
	
	key := mm.Register(*host)
	log.Println( fmt.Sprintf("New spider socket: %x", key) )
	hostSendChannel <- key[:]

	loop:
	for {
		select {

		case clientConn := <-host.startClient:
			client := newClient(clientConn)
			id := clientList.Register(*client)[0]
			log.Println( fmt.Sprintf("New socket key: %x id: %x", key, []byte{id}) )
			hostSendChannel <- createMessage(id, openType)
			go runClient(client, hostSendChannel, host.closeClientSignal, id)

		case id := <-host.closeClientSignal:
			if (clientList.Has([]byte{id})){
				hostSendChannel <- createMessage(id, closeType)
				clientList.Unregister([]byte{id})
				log.Println( fmt.Sprintf("Close socket key: %x id: %x", key, []byte{id}) )
			}else{
				log.Println( fmt.Sprintf("Could not find and close socket key: %x id: %x", key, []byte{id}) )
			}

		case message := <-hostReceiveChannel:
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
				log.Println("Not a Client object")
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
					client.sendChannel <- data
		
				case closeType:
					go func(){
						client.closeSignal <- struct{}{}
					}()
		
				default:
					log.Println( fmt.Sprintf("Unknown byte: %x", cmd) )
			}

		case <- closeHostSignal:
			for index, item := range clientList.items {
				id := []byte(index)[0]
				log.Println( fmt.Sprintf("Request close client: %x", []byte{id}))
				hostSendChannel <- createMessage(id, closeType)
				client, ok := item.(Client)
				if ok {
					go func(){
						client.closeSignal <- struct{}{}
					}()
					
				} else {
					log.Println("Not a Client object")
				}			
			}
			hostConn.Close()
		    break loop
		}
	}
	mm.Unregister(key)
    log.Println( fmt.Sprintf("Close spider socket: %x", key ))
}

func runClient(client *Client, hostSendChannel chan []byte, closeClientSignal chan byte, id byte) {
	receiveChannel := make(chan []byte, 256)

	go writePump(client.conn, client.sendChannel, client.closeSignal)
	go readPump(client.conn, receiveChannel, client.closeSignal)
	
	loop:
	for {
		select {
		case <- client.closeSignal:
			client.conn.Close()
			closeClientSignal <- id
		    break loop

		case message := <-receiveChannel:
			hostSendChannel <- createMessageWithData(id, messageType, message)
		}
	}
}

func serveHost(mm *Mastermap, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	go runHost(conn, mm)
}

func serveClient(mm *Mastermap, w http.ResponseWriter, r *http.Request) {
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
	host, ok := item.(Host)
	if !ok {
		log.Println("Not a Net object")
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	host.startClient <- conn
}
