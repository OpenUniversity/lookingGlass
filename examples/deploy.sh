#!/bin/sh

set -e

curl -X PUT -H "content-type: text/javascript" --data-binary @../mvc/agility-adapter.js http://localhost:8080/js/agility-adapter.js
curl -X PUT -H "content-type: text/html" --data-binary @tweet-example.html http://localhost:8080/tweet-example.html
curl -X PUT -H "content-type: text/html" --data-binary @login.html http://localhost:8080/login.html
node tweet.map.js
