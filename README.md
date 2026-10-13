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
| `.config/nvim/` | Neovim |
| `.config/opencode/` | opencode: providers, MCP servers, `reviewer` agent |
| `.config/opencode/oh-my-opencode-slim.json` | oh-my-opencode-slim: model per agent, subagent panes in Herdr |
| `.env.example` | Template for `~/.env` |

## Secrets

- Keys live in `~/.env`, never in the repo.
- mise loads `~/.env`; `opencode.json` reads keys as `{env:NAME}`.
- Start opencode from a shell where mise is active.

## Day to day

- Edit configs in place (they are symlinks), then commit from this repo.
