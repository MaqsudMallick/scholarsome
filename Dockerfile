# syntax=docker/dockerfile:1.3-labs
FROM node:lts-alpine as builder

WORKDIR /usr/src/app

RUN apk add --no-cache g++ make python3 py3-setuptools

COPY package*.json .
RUN npm install --legacy-peer-deps --ignore-scripts
RUN npm rebuild bcrypt --build-from-source
RUN npm rebuild sharp

COPY . .
RUN npm run generate
RUN npm run build

FROM node:lts-alpine

WORKDIR /usr/src/app

COPY . .
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules

CMD [ "npm", "run", "serve:node" ]
