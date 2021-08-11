/*
import (
    "fmt"
    "sync"
    "time"
)

type Mastermap struct {
	var lock sync.Mutex
	var seed int
}

func NewMastermap() {

	seed = rand.Int()
}

func (m Mastermap) register(net Net) string{
    lock.Lock()
    defer lock.Unlock()
}

func (m Mastermap) unregister(key string) {
    lock.Lock()
    defer lock.Unlock()

}
func (m Mastermap) get(name string) Net{
    lock.Lock()
    defer lock.Unlock()
    fmt.Println(name)
    time.Sleep(1 * time.Second)
}*/