FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@9.12.0

COPY package.json pnpm-lock.yaml* ./

# Install ALL dependencies (including devDependencies) so tsx is available
# for the migrate/seed scripts that run at container startup.
RUN pnpm install

COPY . .

RUN pnpm build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Startup: migrate → seed → start.
# tsx is available because we installed all deps above.
CMD ["sh", "-c", "node_modules/.bin/tsx db/migrate.ts && node_modules/.bin/tsx db/seed.ts && node_modules/.bin/next start"]
