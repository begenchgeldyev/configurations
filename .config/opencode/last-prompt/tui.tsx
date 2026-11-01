import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"

export function latestPrompt(messages: readonly { type: string; text?: string }[] | undefined): string {
  const message = messages?.findLast((item) => item.type === "user" && item.text?.trim())
  const text = message?.text?.replace(/\s+/g, " ").trim() ?? ""
  return text.length > 180 ? `${text.slice(0, 179)}…` : text
}

export default Plugin.define({
  id: "local.last-prompt",
  setup(context) {
    return context.ui.slot({
      prepend: "session.composer.top",
      render: (props) => {
        const prompt = () => latestPrompt(context.data.session.message.list(props.sessionID))
        return (
          <Show when={prompt()}>
            <box paddingLeft={1} paddingRight={1}>
              <text fg={context.theme.text.muted}>Last prompt: {prompt()}</text>
            </box>
          </Show>
        )
      },
    })
  },
})
