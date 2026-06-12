#!/bin/bash
set -e
# Install root dependencies
npm install
# Install and build api-test-framework
cd tools/api-test-framework
npm install
npx tsc
echo "Build complete"
