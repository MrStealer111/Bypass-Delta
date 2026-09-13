#!/bin/bash
cd /root/Documents/Bypass-Delta
setsid node index.js > /tmp/bypass-delta.log 2>&1 < /dev/null &
echo "Started (PID $!)"