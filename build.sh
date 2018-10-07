#!/usr/bin/env bash
PORT=$1

if [[ -z $PORT ]]; then
  echo No port specified
  echo Usage:
  echo "  build.sh <port>"
  exit 1
fi

# We need to run a next build before exporting because the export step looks for 
# a particular file in the .next/ directory.
echo Running next build...
./node_modules/.bin/next build src/frontend

# Run the actual export task.
echo Exporting application...
PORT=$PORT ./node_modules/.bin/next export src/frontend -o dist/
