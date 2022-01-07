# Spider - a sort of websocket proxy

## Live examples

* [Is Alive?](https://spider-8t2d6.ondigitalocean.app)
* [Run testes in browser](https://hakanols.github.io/spider/client-js/test/runJs.html?file=test.js)
* [Chat example](https://hakanols.github.io/spider/client-js/chat_example.html)

## Testing on local host

### Install
* Golang
* Node.js
* NPM

### Run
* Run Go from /
  * go run .
  * go test
  
* Run JS testes. Have a Spider server runing on localhost (go run .)
  * npm run test
  * npm run browser
  * npm run chat

* Local Docker

        docker build --rm -t spider .
        docker run --rm -p 8080:8080/tcp -t spider
