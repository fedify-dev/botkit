~~~~ typescript twoslash
import type { Session } from "@fedify/botkit";
import { hashtag, Image, text } from "@fedify/botkit";

declare const session: Session<void>;
declare const url: URL;
// ---cut-before---
await session.publish(
  text`Chart update! ${hashtag("BotKit")}`,
  {
    attachments: [
      new Image({ url, mediaType: "image/png" }),
    ],
    visibility: "public",
  },
);
~~~~
