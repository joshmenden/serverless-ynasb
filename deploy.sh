#! /bin/bash
(
cd src
npm install
npm run build
)
sam build
sam deploy --guided