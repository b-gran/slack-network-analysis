#!/usr/bin/env bash
function die {
  echo Usage:
  echo "  build.sh <static_data_source>"
  exit 1
}

STATIC_DATA_SOURCE=$1
if [[ -z ${STATIC_DATA_SOURCE} ]]; then
  echo No static data source specified
  die
fi

# We need to run a next build before exporting because the export step looks for 
# a particular file in the .next/ directory.
echo Running next build...
STATIC_DATA_SOURCE=${STATIC_DATA_SOURCE} ./node_modules/.bin/next build src/frontend

# Run the actual export task.
echo Exporting application...
STATIC_DATA_SOURCE=${STATIC_DATA_SOURCE} ./node_modules/.bin/next export src/frontend -o dist/
