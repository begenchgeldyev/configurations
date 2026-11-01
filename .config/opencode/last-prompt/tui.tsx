import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"

export function latestPrompt(messages: readonly { type: string; text?: string }[] | undefined): string {
  const message = messages?.findLast((item) => item.type === "user" && item.text?.trim())
  return message?.text?.replace(/\s+/g, " ").trim() ?? ""
}

export default Plugin.define({
  id: "local.last-prompt",
  setup(context) {
    const background = context.themeMode === "light" ? "#e6e6e6" : "#303030"
    const foreground = context.themeMode === "light" ? "#202020" : "#eeeeee"
    return context.ui.slot({
      append: "app",
      render: () => {
        const prompt = () => {
          const route = context.ui.router.current()
          return route.type === "session" ? latestPrompt(context.data.session.message.list(route.sessionID)) : ""
        }
        return (
          <Show when={prompt()}>
            <box
              position="absolute"
              top={context.ui.tabs.enabled() ? 1 : 0}
              left={2}
              right={2}
              height={3}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={background}
              zIndex={100}
            >
              <box
                width="100%"
                height={3}
                border
                borderStyle="single"
                borderColor={context.themeMode === "light" ? "#aaaaaa" : "#606060"}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={background}
              >
                <text width="100%" height={1} wrapMode="none" truncate fg={foreground} bg={background}>
                  {prompt()}
                </text>
              </box>
            </box>
          </Show>
        )
      },
    })
  },
})
