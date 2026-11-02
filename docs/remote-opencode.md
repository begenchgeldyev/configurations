# opencode on a remote host (cli-proxy-api only)

Runbook for the VPS `server` (208.92.227.18, root, Ubuntu 24.04): install opencode
there and point it at the same cli-proxy-api the workstation uses. No Synecta
models on the server — the Synecta hub (`10.9.0.2:4000`) is only reachable from
the workstation network, so it is cut from the remote config entirely.

## 1. Connection

`server` listens on **8022**, not 22. Several egresses rate-limit outbound
TCP/22: SYNs get dropped after a burst of connections, while the host answers
ping and other ports normally (a local `tcpdump` on the VPS shows the SYN-ACK
leaving, so the loss is on the client side). `~/.ssh/config` pins the port:

```bash
ssh server            # -> root@208.92.227.18:8022
hc machine ls         # herdr-core reuses ~/.ssh/config, so this also works
```

Gotchas:

- No IPv6 path: the VPS has `2605:e440:48::328`, but the workstation has no
  global IPv6, and the address never resolves to the IPv4 host.
- sshd drops new handshakes with `banner exchange timeout` while its
  unauthenticated queue is full. After a burst of parallel probes, stay quiet for
  ~5 minutes instead of retrying in a loop.

## 2. Packages and opencode

```bash
apt-get update -qq && apt-get install -y -qq tar gzip git
curl -fsSL https://opencode.ai/install | bash   # -> /root/.opencode/bin
ln -sf /root/.opencode/bin/opencode /usr/local/bin/opencode
```

`tar` and `gzip` are required by the installer, `git` by the superpowers plugin.
The image ships none of them.

## 3. Config

Copy `~/.config/opencode` from the workstation, dereferencing symlinks, then
rewrite the two absolute paths:

| in `opencode.json` | workstation | remote |
| --- | --- | --- |
| `skills.paths[0]` | `~/projects/mattpocock-skills/skills` | `/root/.config/opencode/skills` |
| `plugins[].package` (proxy-model-sync) | `~/projects/configurations/.config/opencode/proxy-model-sync` | `/root/.config/opencode/proxy-model-sync` |

Drop the `synecta` provider and repoint the model defaults at cli-proxy-api; all
agents in `oh-my-opencode-slim.json` and `agents/*.md` must lose their
`synecta/...` models too:

```jsonc
"model": "openai/gpt-6.1-sol",
"small_model": "openai/gpt-6-luna",
// providers: only `openai` and `gemini`, both
// http://208.92.227.18:8317/v1 with {env:VPS_API_KEY}
```

Keep `proxy-model-sync` — it pulls the live model list from
`http://208.92.227.18:8317/v1/models`.

## 4. Keys

Only what cli-proxy-api needs; nothing else from `~/.env`:

```bash
install -m 600 /dev/null /root/.config/opencode/.env
printf 'VPS_IP=%s\nVPS_API_KEY=%s\n' "$VPS_IP" "$VPS_API_KEY" \
  > /root/.config/opencode/.env
```

opencode resolves `{env:VPS_API_KEY}` from the process environment, so load it
wherever a shell starts:

```bash
# /etc/profile.d/opencode-env.sh
if [ "$(id -u)" = "0" ] && [ -f /root/.config/opencode/.env ]; then
  set -a; . /root/.config/opencode/.env; set +a
fi
case ":$PATH:" in *":/root/.opencode/bin:"*) ;; *) export PATH="/root/.opencode/bin:$PATH" ;; esac
```

The same guarded `set -a; . ~/.config/opencode/.env; set +a` block goes into
`/root/.bashrc` (interactive) and `/root/.profile` (login).

## 5. Verify

```bash
opencode --version                      # 1.19.5
opencode debug config | head            # model/small_model, providers: gemini, openai
opencode models | grep -c '^openai/'    # ~79 models from cli-proxy-api
opencode run -m openai/gpt-6.1-sol "reply with exactly: ok"
```

`Unauthorized: Invalid API key` means `VPS_API_KEY` was not in the environment —
check the profile blocks, not the key itself.

## 6. What is not there

Jira / Confluence / GitLab / Figma / GitHub tokens stay on the workstation, and
the matching MCP servers cannot start on this host anyway: there is no `docker`,
`glab`, or `node`/`npx`.
