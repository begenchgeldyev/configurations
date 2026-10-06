# configurations

My dotfiles. Every file sits at the same path it has under `$HOME`, and the `install` mise task symlinks it into place, so editing `~/.zshrc` edits the copy in this repo.

## What's inside

| Path | Configures |
| --- | --- |
| `.zshrc` | zsh: adds `~/.local/bin` to `PATH` and activates mise |
| `.tmux.conf` | tmux: `Ctrl-s` prefix, vim-style pane keys, resurrect/continuum plugins via TPM |
| `.config/herdr/config.toml` | Herdr: `Ctrl-s` prefix, `prefix p` toggles the sidebar, vim-style pane focus |
| `.config/mise/config.toml` | mise: CLI tools (claude, opencode, gemini, agy, gh, neovim, tmux, herdr, ripgrep, fd, uv, node) and loading `~/.env` |
| `.config/nvim/` | Neovim on packer.nvim: gruvbox, nvim-tree, lualine, treesitter, telescope |
| `.config/opencode/` | opencode: providers and MCP servers (`opencode.json`), TUI and the oh-my-openagent plugin (`tui.json`), the `reviewer` agent, Herdr's agent-state plugin (managed by Herdr) |
| `.omo/omo.jsonc` | oh-my-openagent (OmO): which model each agent and task category runs on |
| `.env.example` | Template for `~/.env`, which holds the API keys |
| `mise-tasks/install` | The setup task described below |

## Set up a machine

Needs git, zsh and [mise](https://mise.jdx.dev/getting-started.html).

```sh
git clone git@github.com:begenchgeldyev/configurations.git ~/projects/configurations
cd ~/projects/configurations
cp .env.example ~/.env        # then fill in the keys
mise trust
mise run install --dry-run    # preview
mise run install
exec zsh
```

`mise run install`:

1. Symlinks every tracked file to the same path under `$HOME`, skipping `.gitignore` files, `.env.example`, `README.md` and `mise-tasks/`.
2. Replaces an existing file that is identical to the repo copy. A file that differs is first moved aside to `<name>.bak.<unix time>`, so nothing is lost. Links that already point here are left alone, so the task is safe to re-run.
3. Runs `mise install` for the tools in `.config/mise/config.toml`.

`--dry-run` (`-n`) only prints the plan and leaves `$HOME` alone, but mise still installs missing tools before it starts any task.

The links point into the clone, so if you move it, run the task again.

For the tmux plugins, install [TPM](https://github.com/tmux-plugins/tpm) with `git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm`, then press `prefix I` inside tmux.

## Secrets

API keys never go in the repo. They live in `~/.env` (the variables are listed in `.env.example`, and `.gitignore` blocks `.env` files here). mise loads `~/.env` into every shell it activates, and `opencode.json` refers to the keys as `{env:NAME}`. Start opencode from such a shell, or it sees no keys.

To add a key: add `NAME=` to `.env.example`, put the real value in `~/.env`, and reference it as `{env:NAME}`.

## Day to day

- Edit configs where they are (`~/.zshrc`, `~/.config/opencode/opencode.json`, ...). They are links, so the changes show up in `git status` here; commit and push from this directory.
- On another machine, `git pull` updates the linked files right away. Run `mise run install` again when the pull brings new files.
- To track a new file, copy it here under its path relative to `$HOME`, commit it, and run `mise run install`. `.config/opencode/`, `.config/herdr/` and `.omo/` ignore everything their own `.gitignore` doesn't whitelist, so add a `!<file>` line there first.
- Some programs replace a link with a regular file when they save. `mise run install --dry-run` shows any such file as `backup` or `replace`.
