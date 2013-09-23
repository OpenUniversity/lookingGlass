#!/bin/sh

host=$1
if [ -z "$host" ]; then
    host="localhost:8080"
fi
echo host: $host
set -e

curl -X PUT -H "content-type: text/javascript" --data-binary @../../Downloads/agility.js http://$host/js/agility.min.js
curl -X PUT -H "content-type: text/javascript" --data-binary @../mvc/agility-adapter.js http://$host/js/agility-adapter.js
curl -X PUT -H "content-type: text/javascript" --data-binary @../mvc/mvc.js http://$host/js/mvc.js
curl -X PUT -H "content-type: text/html" --data-binary @tweet-example.html http://$host/tweet-example.html
curl -X PUT -H "content-type: text/html" --data-binary @mvc-test.html http://$host/mvc-test.html
curl -X PUT -H "content-type: text/html" --data-binary @login.html http://$host/login.html
node tweet.map.js $host
