// Copyright 2013 The Gorilla WebSocket Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main

import (
	"flag"
	"log"
	"net/http"
)

var addr = flag.String("addr", ":8080", "http service address")

func serveHello(w http.ResponseWriter, r *http.Request) {
	log.Println(r.URL)
	data := []byte("Hello World!") // slice of bytes
	w.Write(data)
}

func serveHome(w http.ResponseWriter, r *http.Request) {
	log.Println(r.URL)
	log.Println("Home town")

	if r.URL.Path != "/home/" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	http.ServeFile(w, r, "home.html")
}

func main() {
	flag.Parse()
	hub := newHub()
	mm := NewMastermap()
	go hub.run()
	http.HandleFunc("/", serveHello)
	http.HandleFunc("/home/", serveHome)
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})
	http.HandleFunc("/net/", func(w http.ResponseWriter, r *http.Request) {
		serveNets(mm, w, r)
	})
	http.HandleFunc("/net", func(w http.ResponseWriter, r *http.Request) {
		serveNet(mm, w, r)
	})
	err := http.ListenAndServe(*addr, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
