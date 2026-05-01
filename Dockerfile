FROM jrottenberg/ffmpeg:4.1-nvidia

RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -sL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && apt-get update && apt-get install -y yarn \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock ./
COPY backend/package.json backend/tsconfig.json ./backend/
COPY backend/prisma/ ./backend/prisma/
COPY web/package.json web/tsconfig.json ./web/

RUN yarn

COPY backend/src/ ./backend/src/
COPY web/src/ ./web/src/
COPY web/static/ ./web/static/
COPY web/postcss.config.cjs web/svelte.config.js web/tailwind.config.cjs ./web/

EXPOSE 3000
EXPOSE ${PORT}

ENTRYPOINT ["/usr/bin/env"]
CMD ["yarn", "start"]
