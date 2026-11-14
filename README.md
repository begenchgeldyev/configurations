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
- Preview with `mise run install --dry-run`: prints the link/copy and install plan
  without running mise installs, downloading tools or changing files.

### agent-browser

`mise run install` installs the pinned `npm:agent-browser` **0.43.0**, then runs
`mise exec npm:agent-browser@0.43.0 -- agent-browser install` to download Chromium.
Finally, it uses the pinned skills installer **1.8.1** to install only the official
agent-browser discovery skill globally for OpenCode:

```bash
mise exec npm:skills@1.8.1 -- skills add vercel-labs/agent-browser --skill agent-browser --global --agent opencode --yes
```

Browser prerequisites: a supported Linux or macOS machine, network access for the
CLI/skill/browser downloads, disk space for Chromium and its required OS libraries.
On minimal Linux systems, an administrator must provision missing browser libraries
separately; this installer never uses `sudo` or `--with-deps` and stops on failure.

The skill lives at `~/.agents/skills/agent-browser/SKILL.md`, which OpenCode already
discovers; no duplicate skill or permission change is needed. Start a new OpenCode
run after setup so discovery picks it up. The official skill is a thin discovery
stub: load the version-matched core guide before browser work, not a cached guide.
From a shell with mise active:

```bash
agent-browser --version          # agent-browser 0.43.0
agent-browser skills get core
agent-browser --session my-task-unique open http://localhost:8613
agent-browser --session my-task-unique snapshot -i
# Interact using snapshot refs; take a fresh snapshot after navigation/DOM changes.
agent-browser --session my-task-unique close
```

Choose a unique session per task, pass `--session` on every browser command, and
close only that session. Prefer a local dev instance and stay within the task's
authorization; setup does not grant production, admin-write or AI-request access.

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
- OpenCode's `last-prompt` TUI plugin shows the latest user prompt in a bar just above the composer. The bar matches the Questions panel's width and text inset, with a distinct background and a yellow left accent outside the background. Long prompts truncate to one line, with one row of padding above and below and no bottom margin. The bar takes its own three rows in the layout, so it does not cover the transcript. OpenCode automatically names new sessions; manually assigned titles are preserved. Restart the TUI after installing the plugin.
- OpenCode's `context-footer` replaces the built-in prompt footer to hide dollar costs while keeping context usage, live activity, and keyboard hints. It is paired with `-opencode.prompt.footer` in `cli.json`.

### OpenCode profiles

- `opencode-profile personal`: existing GPT agent ladders with no Synecta fallback;
  global `model` and `small_model` become `proxy/gpt-6.1-sol-fast`. Disables the
  Synecta provider and Jira/Confluence/GitLab MCPs; orchestrator MCP access is empty.
- `opencode-profile work`: Synecta DeepSeek Flash first for all text agents, with
  existing GPT fallbacks; both global defaults become
  `synecta/ext-ollama-deepseek-v4.1-flash`. Enables Synecta and those work MCPs.
- Observer keeps its vision-capable GPT/Gemini ladder in both profiles; the
  separate reviewer stays GPT. Other settings and symlinks are preserved.
- Each command saves both configs, then runs `opencode service restart`. Restart
  failure is reported separately: saved settings may not yet be active. For an
  isolated config copy, set `OPENCODE_PROFILE_CONFIG_DIR=/path/to/copy`; use
  `OPENCODE_PROFILE_RESTART_COMMAND=/usr/bin/true` to save without restarting
  (runtime routing then remains unchanged until reload).
