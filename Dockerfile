FROM ghcr.io/bossoq/ffmpeg-node-16:latest

WORKDIR /app

ENV NVIDIA_VISIBLE_DEVICES all
ENV NVIDIA_DRIVER_CAPABILITIES all

ENV NODE_ENV production

ENV SOURCE /source/
ENV DEST /dest/
ENV PORT 3000

COPY package.json yarn.lock tsconfig.json ./

RUN yarn

COPY /src ./src

EXPOSE 3000

CMD ["yarn", "run"]
