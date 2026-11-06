# Changelog

All notable changes to this repository are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/):

- **Major**: applying the change needs manual steps (new required tool or env var, moved paths, relearned keybindings).
- **Minor**: a new tool or config is added.
- **Patch**: small tweaks and fixes.

## [Unreleased]

### Added

- **Zed** (`.config/zed/settings.json`): AI turned on, with Claude, Codex and Gemini providers through the proxy at `http://ai-server:8317`. Claude Opus 5.5 is the default agent model.
- **mise**: sets `CLAUDE_VIA_AI_SERVER_API_KEY`, `CODEX_VIA_AI_SERVER_API_KEY` and `GEMINI_VIA_AI_SERVER_API_KEY` from `VPS_API_KEY` so Zed can read them.
- **Agent memory** (`.config/opencode/plugins/memory-brief.ts`, `AGENTS.md` §3): every primary session starts with a bounded `## Память (авто)` block injected through the `context` hook — curated rules from `MEMORY.md`, then the freshest observations. The journal, review queue and tooling live outside this repo (`~/.local/bin/opencode-{observe,memory}`, `~/.agents/memory/`), so nothing session-shaped lands in git.

### Manual step

- Map `ai-server` to the VPS IP in `/etc/hosts`. Zed settings can't read env vars, so the hostname keeps the IP out of the public repo.
- `mise run install` copies `memory-brief.ts` instead of symlinking it: the plugin loader cannot import a symlinked `.ts` entrypoint. Restart the background server once (`opencode service restart`) after the first install so it picks the plugin up.

## [1.0.0] - 2026-10-11

First tagged release. It captures the setup in use since August 2025.

### Added

- **Setup**: `mise run install` links the dotfiles into `$HOME`. It backs up existing files as `<name>.bak.<time>` and is safe to re-run.
- **zsh** (`.zshrc`): mise activation, starship prompt, atuin history, syntax highlighting, `nvim` as the default editor, `c` alias for opencode, and insert mode kept on `Ctrl+Alt+L` clear-screen.
- **mise** (`.config/mise/`): manages CLI tools (opencode v2 from `npm:@opencode/cli`, Herdr from GitHub releases, Neovim, Node, gh, ripgrep, fd, uv, Claude, Gemini, agy) and loads secrets from `~/.env`.
- **Herdr** (`.config/herdr/`): `Ctrl-s` prefix, zsh as the default shell, `prefix-p` sidebar toggle, workspace navigation keys.
- **Neovim** (`.config/nvim/`): packer with gruvbox, lualine, nvim-tree, telescope and treesitter.
- **opencode v2** (`.config/opencode/`):
  - Anthropic, OpenAI and Gemini providers through the proxy, configured with `VPS_IP` and `VPS_API_KEY`.
  - Chrome DevTools and GitHub MCP servers.
  - `reviewer` agent.
  - Herdr agent-state plugin.
  - `cli.json` with the system theme and the sidebar hidden.
- **oh-my-openagent** (`.omo/omo.jsonc`): model routing per agent, with Gemini handling the oracle, librarian and writing lanes. Falls back to other models on rate limits and server errors, including for the reviewer agent.
- **Secrets**: `.env.example` template (`VPS_IP`, `VPS_API_KEY`, `GITHUB_PAT`). Keys stay in `~/.env` and are never committed.

### Removed

- tmux config, replaced by Herdr.
- Synecta provider, superpowers and oh-my-openagent opencode plugins, and Jira and Figma MCP servers.

[Unreleased]: https://github.com/begenchgeldyev/configurations/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/begenchgeldyev/configurations/releases/tag/v1.0.0
