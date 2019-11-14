# dockerfile to run tests
FROM node:4.8.3

RUN mkdir -p /usr/src
WORKDIR /usr/src

# Install packages at the root level for testing
COPY ./package.* ./
RUN npm install
RUN npm install grunt@0.4.5
RUN npm install -g grunt-cli
RUN ls -al node_modules/grunt/lib

# Copy application code
COPY ./ ./

# run tests
RUN npm run test
