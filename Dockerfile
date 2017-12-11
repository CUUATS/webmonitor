FROM node:6.11-alpine

WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install && npm cache clean
COPY . /usr/src/app

VOLUME /etc/webmonitor
EXPOSE 8888

CMD [ "npm", "start" ]
