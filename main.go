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
	data := []byte("I am alive!")
	w.Write(data)
}

func main() {
	flag.Parse()
	mm := NewMastermap(4)
	http.HandleFunc("/", serveHello)

	http.HandleFunc("/net/", func(w http.ResponseWriter, r *http.Request) {
		serveClient(mm, w, r)
	})
	http.HandleFunc("/net", func(w http.ResponseWriter, r *http.Request) {
		serveHost(mm, w, r)
	})
	log.Println("Starting on http://localhost:8080/")
	err := http.ListenAndServe(*addr, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
