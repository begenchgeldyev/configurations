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
      append: "app",
      render: () => {
        const prompt = () => {
          const route = context.ui.router.current()
          return route.type === "session" ? latestPrompt(context.data.session.message.list(route.sessionID)) : ""
        }
        return (
          <Show when={prompt()}>
            <box position="absolute" top={context.ui.tabs.enabled() ? 1 : 0} left={0} width="100%" height={1} backgroundColor="#383838" zIndex={100}>
              <text fg={context.theme.text.base} bg="#383838">› {prompt()}</text>
            </box>
          </Show>
        )
      },
    })
  },
})
