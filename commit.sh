#!/bin/sh
mocha -R markdown > README.md
git add .
git commit -a
git push origin master

