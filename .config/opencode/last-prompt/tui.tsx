import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"

export function latestPrompt(messages: readonly { type: string; text?: string }[] | undefined): string {
  const message = messages?.findLast((item) => item.type === "user" && item.text?.trim())
  return message?.text?.replace(/\s+/g, " ").trim() ?? ""
}

function LastPrompt(props: { context: Plugin.Context }) {
  const context = props.context
  const background = context.themeMode === "light" ? "#e6e6e6" : "#303030"
  const foreground = context.themeMode === "light" ? "#202020" : "#eeeeee"
  // Mirror the Questions panel below the composer: it spans the full composer
  // column with no side margins, and its text sits three columns in (a one
  // column left border plus two columns of padding) with three columns kept
  // free on the right.
  const prompt = () => {
    const route = context.ui.router.current()
    return route.type === "session" ? latestPrompt(context.data.session.message.list(route.sessionID)) : ""
  }

  return (
    <Show when={prompt()}>
      <box
        flexShrink={0}
        height={3}
        marginBottom={0}
        border={["left"]}
        borderColor="#ffcc00"
        customBorderChars={{
          topLeft: "",
          bottomLeft: "╹",
          vertical: "┃",
          topRight: "",
          bottomRight: "",
          horizontal: " ",
          bottomT: "",
          topT: "",
          cross: "",
          leftT: "",
          rightT: "",
        }}
      >
        <box
          flexGrow={1}
          paddingLeft={2}
          paddingRight={3}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={background}
        >
          <text width="100%" height={1} wrapMode="none" truncate fg={foreground} bg={background}>
            {prompt()}
          </text>
        </box>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "local.last-prompt",
  setup(context) {
    return context.ui.slot({
      append: "session.composer.top",
      render: () => <LastPrompt context={context} />,
    })
  },
})
