FROM    node:8

RUN npm install forever@2.0.0 -g

WORKDIR /nodeapp

COPY package.json .
RUN npm install
COPY . .

EXPOSE 80
RUN ls -al .
RUN ls -al core
RUN ls -al util

CMD ["npm", "run", "start:forever"]
