#!/bin/sh -x
set -e
mocha -R list | sed 's/:[^:]*$//' > .new.tr
comment=`diff .old.tr .new.tr | sed 1d || echo`
mocha -R markdown > README.md
mv .new.tr .old.tr
git add .
git commit -a -m "$comment"
git push origin master

