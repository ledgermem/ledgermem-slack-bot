# LedgerMem Slack Bot

Capture, recall, and forget memories from Slack with three slash commands and a "Save to memory" message shortcut, backed by [LedgerMem](https://ledgermem.dev).

## Features

- `/remember <text>` — saves the text as a memory
- `/recall <query>` — searches your workspace and returns the top 3 hits as an ephemeral message
- `/forget <id>` — deletes a memory by ID
- **Save to memory** message shortcut — right-click any message → "Save to memory"
- Per-channel opt-in via `OPT_IN_CHANNELS` env var or `channels.json` file
- Socket Mode for local development, HTTP mode for production deployment

## Setup

1. Create a Slack app at https://api.slack.com/apps
2. Enable Socket Mode and generate an App-Level Token (`xapp-...`) with `connections:write`
3. Bot Token Scopes: `commands`, `chat:write`, `chat:write.public`
4. Add the three slash commands and one message shortcut (callback ID `save_to_memory`)
5. Install the app to your workspace and copy the Bot Token (`xoxb-...`)

_Screenshots: `docs/slack-app-config.png` (placeholder)_

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | yes | `xoxb-...` from your Slack app install |
| `SLACK_APP_TOKEN` | only in socket mode | `xapp-...` for Socket Mode |
| `SLACK_SIGNING_SECRET` | yes | App signing secret |
| `LEDGERMEM_API_KEY` | yes | LedgerMem API key |
| `LEDGERMEM_WORKSPACE_ID` | yes | LedgerMem workspace ID |
| `SOCKET_MODE` | no | `false` to run in HTTP mode (default: `true`) |
| `PORT` | no | HTTP port when not in socket mode (default: `3000`) |
| `OPT_IN_CHANNELS` | no | Comma-separated channel IDs allowed to capture |
| `OPT_IN_FILE` | no | Path to JSON array of channel IDs (default: `./channels.json`) |

If neither `OPT_IN_CHANNELS` nor `OPT_IN_FILE` is set, all channels are allowed.

## Run

```bash
cp .env.example .env
# fill in the env vars
npm install
npm run dev          # local socket mode
npm run build && npm start
npm test
```

## Deploy

- **Docker:** `docker build -t ledgermem-slack-bot . && docker run --env-file .env -p 3000:3000 ledgermem-slack-bot`
- **Fly.io / Railway / Render:** push the image, set the env vars, expose port 3000
- **AWS ECS / Fargate:** use the Dockerfile, set `SOCKET_MODE=false` and put it behind an HTTPS load balancer pointed at `/slack/events`

## License

MIT
