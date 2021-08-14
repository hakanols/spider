package main

import (
	"math/rand"
	"sync"
	"time"
)

const keylength = 8

type Mastermap struct {
	lock sync.Mutex
	items map[[keylength]byte]Net
}

func NewMastermap() *Mastermap {
	rand.Seed(time.Now().UnixNano())
	return &Mastermap{items: make(map[[keylength]byte]Net)}
}

func generateRandomKey() [keylength]byte {
	var key [keylength]byte
	slice := make([]byte, keylength)
	rand.Read(slice)
	copy(key[:], slice)
	return key
}

func (m *Mastermap) Register(item Net) [keylength]byte {
	m.lock.Lock()
	defer m.lock.Unlock()
	for {
		key := generateRandomKey()
		if _, ok := m.items[key]; !ok {
			m.items[key] = item
			return key
		}
	}
}

func (m *Mastermap) Unregister(key [keylength]byte) {
	m.lock.Lock()
	defer m.lock.Unlock()
	delete(m.items, key)
}

func (m *Mastermap) Get(key [keylength]byte) (Net, bool) {
	m.lock.Lock()
	defer m.lock.Unlock()
	net, ok := m.items[key]
	return net, ok
}
