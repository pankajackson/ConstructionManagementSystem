FROM node:20-alpine

WORKDIR /app

# Yarn is preinstalled on node:20-alpine but pin the network setup so CI is fast
ENV CI=true \
    NODE_OPTIONS=--openssl-legacy-provider \
    NPM_CONFIG_LOGLEVEL=warn

# Install deps first for cache reuse
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --network-timeout 600000

# Copy source
COPY . .

EXPOSE 3000

# CRA dev server with hot reload
CMD ["yarn", "start"]
