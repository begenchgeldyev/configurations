export PATH="$HOME/.local/bin:$PATH"
eval "$(mise activate zsh)"

unset NO_COLOR
stty -ixon 2>/dev/null   # allow herdr Ctrl-S prefix

eval "$(starship init zsh)"
source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
. "$HOME/.atuin/bin/env"
eval "$(atuin init zsh)"

alias v='nvim'
alias c='opencode'
export EDITOR=nvim
export VISUAL=nvim
bindkey -M viins '^[^L' clear-screen
export M5_PATH="$HOME/m5/system"

if [ -f "$HOME/.config/opencode/.env" ]; then
  set -a; source "$HOME/.config/opencode/.env"; set +a
fi
