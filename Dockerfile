FROM node:carbon

MAINTAINER craterone11@gmail.com

RUN mkdir -p /code
WORKDIR /code
COPY . /code

RUN npm install

CMD ["npm", "start"]
