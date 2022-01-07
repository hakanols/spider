package main

import (
	"math/rand"
	"sync"
	"time"
)

type Mastermap struct {
	lock sync.Mutex
	items map[string]interface{}
	keyLen byte
}

func NewMastermap(keyLen byte) *Mastermap {
	rand.Seed(time.Now().UnixNano())
	
	return &Mastermap{
		items: make(map[string]interface{}),
		keyLen: keyLen,
	}
}

func generateRandomKey(keyLen byte) []byte {
	key := make([]byte, keyLen)
	rand.Read(key)
	return key
}

func (m *Mastermap) Register(item interface{}) []byte {
	m.lock.Lock()
	defer m.lock.Unlock()
	for { // ToDo: Smarter and more detrmenistic way to find free key
		key := generateRandomKey(m.keyLen)
		if _, ok := m.items[string(key)]; !ok {
			m.items[string(key)] = item
			return key
		}
	}
}

func (m *Mastermap) Unregister(key []byte) {
	m.lock.Lock()
	defer m.lock.Unlock()
	delete(m.items, string(key))
}

func (m *Mastermap) Get(key []byte) (interface{}, bool) {
	m.lock.Lock()
	defer m.lock.Unlock()
	net, ok := m.items[string(key)]
	return net, ok
}

func (m *Mastermap) Has(key []byte) bool {
		_, ok := m.Get(key)
	return ok
}
