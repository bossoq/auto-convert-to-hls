FROM ghcr.io/bossoq/ffmpeg-node-16:1.1

WORKDIR /app

COPY package.json yarn.lock ./
COPY backend/package.json backend/tsconfig.json ./backend/
COPY web/package.json web/tsconfig.json ./web/

RUN yarn

COPY backend/src/ ./backend/src/
COPY web/src/ ./web/src/
COPY web/static/ ./web/static/
COPY web/postcss.config.cjs web/svelte.config.js web/tailwind.config.js ./web/

EXPOSE ${PORT}

CMD ["yarn", "start"]
