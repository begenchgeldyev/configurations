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

The host runs the same V2 line as the workstation. `curl -fsSL https://opencode.ai/install | bash`
installs the V1 binary (`1.19.5`) and V1 quietly drops V2-only settings — the log then reads
`configuration compatibility diagnostic … path=["plugins"] kind=unsupported action="Omitted native setting that cannot be represented in V1"`,
so no plugin (superpowers, oh-my-opencode-slim, proxy-model-sync) loads. Copy the
workstation binary instead:

```bash
rsync -z ~/.opencode/bin/opencode server:/root/.opencode/bin/opencode-v2.1.2
ssh server 'cp -p /root/.opencode/bin/opencode /root/.opencode/bin/opencode-v1.19.5'
ssh server 'cp -f /root/.opencode/bin/opencode-v2.1.2 /root/.opencode/bin/opencode &&
            ln -sfn /root/.opencode/bin/opencode /usr/local/bin/opencode'
```

`/etc/profile.d/opencode-env.sh` puts `/root/.opencode/bin` ahead of `/usr/local/bin`,
so the switch has to happen on the file inside that directory; repointing the
`/usr/local/bin` symlink alone leaves login shells on the old binary. On first run V2
installs the plugins into `/root/.cache/opencode/npm/` (~200 MB, a few seconds) — a
`ServiceUnavailableError: Location plugins did not finish activating` during that
window just means "retry".

`git` is required by the superpowers plugin (`git+https://…`); the base image
ships neither it nor `tar`/`gzip`.

## 3. Config

`mise run sync-remote-opencode` pushes the workstation config (add `--dry-run` to
inspect the payload, `mise run sync-remote-opencode <host>` for another host). It:

- dereferences symlinks and leaves `.env` and `node_modules` on the workstation;
- drops the `synecta` provider, points `model`/`small_model` at cli-proxy-api and keeps
  `openai` + `gemini` on `http://208.92.227.18:8317/v1` with `{env:VPS_API_KEY}`;
- flattens `oh-my-opencode-slim.json` to one `personal` preset (local `work` merged with
  `personal`), so no `synecta/*` model survives in any agent;
- rewrites the two absolute paths to `/root/.config/opencode/…`:

  | in `opencode.json` | workstation | remote |
  | --- | --- | --- |
  | `skills.paths[0]` | `~/projects/mattpocock-skills/skills` | `/root/.config/opencode/skills` |
  | `plugins[].package` (proxy-model-sync) | `~/projects/configurations/.config/opencode/proxy-model-sync` | `/root/.config/opencode/proxy-model-sync` |

- tars `/root/.config/opencode` into `/root/backups/` before rsyncing over it.

Keep `proxy-model-sync` — it pulls the live model list from
`http://208.92.227.18:8317/v1/models`. `skills/` and `plugins/repo-skills/` are plain
copies on the host and are refreshed only when the source repositories change.

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
opencode --version                          # v2.1.2
command -v opencode                         # /root/.opencode/bin/opencode (login shell too)
opencode debug config | jq '.[0].info | {model, small_model}'   # V2 prints a document list
opencode models | grep -c '^openai/'        # ~26 models synced from cli-proxy-api
opencode run "reply with exactly: ok"       # banner shows `orchestrator · gpt-6.1-sol`
```

`opencode run` printing `> build · …` instead of `> orchestrator · …` means
oh-my-opencode-slim did not load — check the V2 binary and the `plugins` entry first.
`Unauthorized: Invalid API key` means `VPS_API_KEY` was not in the environment —
check the profile blocks, not the key itself.

## 6. What is not there

Jira / Confluence / GitLab / Figma / GitHub tokens stay on the workstation, and
the matching MCP servers cannot start on this host anyway: there is no `docker`,
`glab`, or `node`/`npx`.

`herdr` is not installed either, so the slim panes have no multiplexer to open;
agents still run, they just do not get their own pane.
