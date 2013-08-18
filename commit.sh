#!/bin/sh
mocha -R list | sed 's/:[^:]*$//' > .new.tr
comment=`diff .old.tr .new.tr`
mocha -R markdown > README.md
mv .new.tr .old.tr
git add .
git commit -a -m "$comment"
git push origin master

