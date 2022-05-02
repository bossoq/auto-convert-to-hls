FROM ghcr.io/bossoq/ffmpeg-node-16:1.1

WORKDIR /app

COPY package.json yarn.lock tsconfig.json ./

RUN yarn

COPY /src ./src

EXPOSE ${PORT}

CMD ["yarn", "startservice"]
