FROM    ubuntu:latest

RUN apt-get -y update
RUN apt-get -y dist-upgrade
RUN apt-get -y install nodejs
RUN apt-get -y install npm
RUN apt-get -y install balance

RUN npm install forever -g

RUN ln -s /usr/bin/nodejs /usr/bin/node

ADD package.json /tmp/package.json
RUN cd /tmp && npm install
RUN mkdir -p /nodeapp && cp -a /tmp/node_modules /nodeapp/
RUN cp -r /tmp/node_modules /node_modules

WORKDIR /nodeapp
ADD / /nodeapp

EXPOSE 80

CMD ["forever", "/nodeapp/index.js"]
