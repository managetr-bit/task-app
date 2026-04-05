#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd /Users/omercimen/Desktop/task-app
exec /usr/local/bin/node /Users/omercimen/Desktop/task-app/node_modules/.bin/next dev --port 3002
