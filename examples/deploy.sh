#!/bin/sh

host=$1
if [ -z "$host" ]; then
    host="localhost:8080"
fi
echo host: $host
set -e

curl -X PUT -H "content-type: text/javascript" --data-binary @../mvc/agility-adapter.js http://$host/js/agility-adapter.js
curl -X PUT -H "content-type: text/html" --data-binary @tweet-example.html http://$host/tweet-example.html
curl -X PUT -H "content-type: text/html" --data-binary @login.html http://$host/login.html
node tweet.map.js $host
