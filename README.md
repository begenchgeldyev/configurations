## Set up a machine

Prerequisites: git, zsh and mise;

```bash
git clone git@github.com:begenchgeldyev/configurations.git ~/configurations
cd ~/configurations
cp .env.example ~/.env        # then fill in the keys
mise trust
mise run install
exec zsh
```

- Existing files are kept as `<name>.bak.<time>`.
- Safe to re-run. Re-run it after moving the clone.

## What's inside

| Path | What |
| --- | --- |
| `.zshrc` | zsh: mise, starship, atuin, syntax highlighting |
| `.config/herdr/` | Herdr: `Ctrl-s` prefix, zsh as default shell |
| `.config/mise/` | CLI tools (opencode v2 comes from `npm:@opencode/cli`); loads `~/.env` |
| `.config/opencode/` | opencode: providers, MCP servers, `reviewer` agent |
| `.config/zed/` | Zed: settings, AI providers through `ai-server` |
| `.config/opencode/oh-my-opencode-slim.json` | oh-my-opencode-slim: model per agent, subagent panes in Herdr |
| `.ssh/config` | SSH hosts; `server` (VPS) is pinned to port 8022, see `docs/remote-opencode.md` |
| `.env.example` | Template for `~/.env` |

## Secrets

- Keys live in `~/.env`, never in the repo.
- mise loads `~/.env`; `opencode.json` reads keys as `{env:NAME}`.
- Start opencode from a shell where mise is active.
- Zed settings can't read env vars. They use the `ai-server` hostname, so map it once per machine:
  `echo "$(echo "$VPS_IP" | sed -E 's#^https?://([^:/]+).*#\1#') ai-server" | sudo tee -a /etc/hosts`
- mise sets the Zed key vars (`*_VIA_AI_SERVER_API_KEY`) from `VPS_API_KEY`. Start Zed from a shell where mise is active, or paste the key once in Zed's agent settings.

## Remote hosts

- `ssh server` → VPS `208.92.227.18` on port **8022**: several egresses drop
  outbound TCP/22 after a burst of connections. The `~/.ssh/server` key is not in
  the repo — copy it by hand.
- opencode on that host runs off the same configs, cli-proxy-api only (no Synecta
  hub): see [`docs/remote-opencode.md`](docs/remote-opencode.md).

## Day to day

- Edit configs in place (they are symlinks), then commit from this repo.
- OpenCode's `last-prompt` TUI plugin pins the latest user prompt in a bordered bar at the top of the session. Long prompts truncate to one line to fit the terminal. It overlays three transcript rows because OpenCode does not provide a dedicated top-of-session slot. OpenCode automatically names new sessions; manually assigned titles are preserved. Restart the TUI after installing the plugin.
- OpenCode's `context-footer` replaces the built-in prompt footer to hide dollar costs while keeping context usage, live activity, and keyboard hints. It is paired with `-opencode.prompt.footer` in `cli.json`.
