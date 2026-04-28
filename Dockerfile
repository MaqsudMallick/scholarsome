# syntax=docker/dockerfile:1.3-labs
FROM node:20-slim as builder

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends g++ make python3 openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json .
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY . .
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules

CMD [ "npm", "run", "serve:node" ]
