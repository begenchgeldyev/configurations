import { Plugin } from "@opencode/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, Match, Show, Switch } from "solid-js"

const number = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

// Same usage calculation as OpenCode 2.0.32's footer, without monetary cost.
function Footer(props: {
  context: Plugin.Context
  sessionID?: string
  mode: "normal" | "shell"
  showDetails: boolean
}) {
  const context = props.context
  const dimensions = useTerminalDimensions()
  const [hovered, setHovered] = createSignal(false)
  const shortcut = (id: string) => context.keymap.shortcuts(id)[0]
  const usage = createMemo(() => {
    if (!props.sessionID) return ""
    const session = context.data.session.get(props.sessionID)
    if (!session) return ""
    const messages = context.data.session.message.list(props.sessionID)
    const boundary = session.revert?.messageID
    const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1
    if (boundary && boundaryIndex === -1) return ""
    const end = boundaryIndex === -1 ? messages.length : boundaryIndex
    const compacted = messages.findLastIndex(
      (message, index) => message.type === "compaction" && message.status === "completed" && index < end,
    )
    const last = messages.findLast(
      (message, index) => message.type === "assistant" && message.tokens !== undefined && index > compacted && index < end,
    )
    if (last?.type !== "assistant" || !last.tokens) return ""
    const tokens = last.tokens.input + last.tokens.output + last.tokens.reasoning
      + last.tokens.cache.read + last.tokens.cache.write
    if (tokens <= 0) return ""
    const model = context.data.location.model.list(session.location)?.find(
      (item) => item.providerID === last.model.providerID && item.id === last.model.id,
    )
    const value = number.format(tokens)
    return model?.limit.context ? `${value} (${Math.round(tokens / model.limit.context * 100)}%)` : value
  })
  const live = createMemo(() => {
    if (!props.sessionID) return ""
    const agents = context.data.session.family(props.sessionID).filter(
      (id) => id !== props.sessionID && context.data.session.status(id) === "running",
    ).length
    const shells = context.data.shell.list(context.location).filter(
      (shell) => shell.metadata.sessionID === props.sessionID,
    ).length
    return [
      agents ? `${agents} subagent${agents === 1 ? "" : "s"}` : "",
      shells ? `${shells} shell${shells === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" · ")
  })
  const layout = createMemo(() => {
    if (!usage()) return { usage: false, shortcuts: dimensions().width >= 44 }
    const width = Math.max(0, dimensions().width - 8)
    const available = Math.max(0, width - Math.min(28, Math.floor(width / 2)))
    const hint = shortcut("command.palette.show")
    return {
      usage: usage().length <= available,
      shortcuts: `${usage()}${hint ? ` · ${hint} commands` : ""}`.length <= available,
    }
  })

  return (
    <Switch>
      <Match when={props.mode === "normal"}>
        <Switch>
          <Match when={live() || usage()}>
            <box flexDirection="row" flexShrink={props.showDetails && layout().usage ? 0 : 1} minWidth={0}>
              <Show when={live()}>
                <box
                  flexShrink={0}
                  onMouseOver={() => setHovered(true)}
                  onMouseOut={() => setHovered(false)}
                  onMouseUp={() => context.keymap.dispatch("session.child.first")}
                >
                  <text fg={hovered() ? context.theme.text.base : context.theme.text.muted} wrapMode="none">
                    <Show when={shortcut("session.child.first")}>
                      {(value) => <span style={{ fg: context.theme.text.base }}>{value()} </span>}
                    </Show>
                    {live()}
                  </text>
                </box>
              </Show>
              <Show when={props.showDetails && layout().usage && usage()}>
                <text fg={context.theme.text.muted} wrapMode="none" flexShrink={0}>
                  {live() ? " · " : ""}{usage()}
                </text>
              </Show>
            </box>
          </Match>
          <Match when={props.showDetails && layout().shortcuts}>
            <text fg={context.theme.text.base} flexShrink={0}>
              {shortcut("agent.cycle")} <span style={{ fg: context.theme.text.muted }}>agents</span>
            </text>
          </Match>
        </Switch>
        <Show when={props.showDetails && layout().shortcuts}>
          <text fg={context.theme.text.base} wrapMode="none" flexShrink={0}>
            {shortcut("command.palette.show")} <span style={{ fg: context.theme.text.muted }}>commands</span>
          </text>
        </Show>
      </Match>
      <Match when={props.mode === "shell"}>
        <text fg={context.theme.text.base} flexShrink={0}>
          esc <span style={{ fg: context.theme.text.muted }}>{dimensions().width < 44 ? "shell" : "exit shell mode"}</span>
        </text>
      </Match>
    </Switch>
  )
}

export default Plugin.define({
  id: "local.context-footer",
  setup(context) {
    return context.ui.slot({
      append: "prompt.footer",
      render: (props) => <Footer context={context} {...props} />,
    })
  },
})
