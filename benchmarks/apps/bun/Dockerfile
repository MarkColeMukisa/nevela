# The Bun contender, from Grit's benchmark harness (github.com/MUKE-coder/grit,
# benchmarks/bun-bench, MIT). Bun's own image, production mode.
#
# Bun.serve is one thread per process, so start.ts forks one process per CPU sharing the
# socket (reusePort), as Bun's docs recommend: BUN_WORKERS is set to the CPUs every app gets.
FROM oven/bun:1.3.5-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY server.ts start.ts schema.ts ./

EXPOSE 8080
CMD ["bun", "run", "start.ts"]
