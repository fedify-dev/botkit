import { MemoryKvStore } from "@fedify/fedify/federation";
import {
  Hashtag,
  Mention,
  Note,
  PUBLIC_COLLECTION,
} from "@fedify/fedify/vocab";
import { assertEquals } from "@std/assert/equals";
import { assertRejects } from "@std/assert/rejects";
import { BotImpl } from "./bot-impl.ts";
import { createMessage } from "./message-impl.ts";

Deno.test("createMessage()", async () => {
  const bot = new BotImpl<void>({ kv: new MemoryKvStore(), username: "bot" });
  const session = bot.getSession("https://example.com", undefined);
  await assertRejects(
    () => createMessage<Note, void>(new Note({}), session),
    TypeError,
    "The raw.id is required.",
  );
  await assertRejects(
    () =>
      createMessage<Note, void>(
        new Note({ id: new URL("https://example.com/notes/1") }),
        session,
      ),
    TypeError,
    "The raw.content is required.",
  );
  await assertRejects(
    () =>
      createMessage<Note, void>(
        new Note({
          id: new URL("https://example.com/notes/1"),
          content: "<p>Hello, world!</p>",
        }),
        session,
      ),
    TypeError,
    "The raw.attributionId is required.",
  );

  const publicNote = new Note({
    id: new URL("https://example.com/notes/1"),
    content: "<p>#Hello, <em>world</em>!</p>",
    attribution: new URL("https://example.com/ap/actor/bot"),
    to: PUBLIC_COLLECTION,
    cc: new URL("https://example.com/ap/actor/bot/followers"),
    tags: [
      new Mention({
        name: "@bot",
        href: new URL("https://example.com/ap/actor/bot"),
      }),
      new Hashtag({
        name: "#Hello",
        href: new URL("https://example.com/tags/hello"),
      }),
    ],
  });
  const publicMessage = await createMessage<Note, void>(publicNote, session);
  assertEquals(publicMessage.raw, publicNote);
  assertEquals(publicMessage.id, publicNote.id);
  assertEquals(publicMessage.actor, await session.getActor());
  assertEquals(publicMessage.visibility, "public");
  assertEquals(publicMessage.language, undefined);
  assertEquals(publicMessage.text, "#Hello, world!");
  assertEquals(publicMessage.html, "<p>#Hello, <em>world</em>!</p>");
  assertEquals(publicMessage.replyTarget, undefined);
  assertEquals(publicMessage.mentions, [await session.getActor()]);
  assertEquals(publicMessage.hashtags, [
    new Hashtag({
      name: "#Hello",
      href: new URL("https://example.com/tags/hello"),
    }),
  ]);
  assertEquals(publicMessage.attachments, []);
  assertEquals(publicMessage.published, undefined);
  assertEquals(publicMessage.updated, undefined);

  const unlistedNote = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot/followers"),
    cc: PUBLIC_COLLECTION,
  });
  const unlistedMessage = await createMessage<Note, void>(
    unlistedNote,
    session,
  );
  assertEquals(unlistedMessage.visibility, "unlisted");

  const followersNote = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot/followers"),
    ccs: [],
  });
  const followersMessage = await createMessage<Note, void>(
    followersNote,
    session,
  );
  assertEquals(followersMessage.visibility, "followers");

  const direct = publicNote.clone({
    to: new URL("https://example.com/ap/actor/bot"),
    ccs: [],
  });
  const directMessage = await createMessage<Note, void>(direct, session);
  assertEquals(directMessage.visibility, "direct");

  const unknown = publicNote.clone({
    tos: [],
    ccs: [],
  });
  const unknownMessage = await createMessage<Note, void>(unknown, session);
  assertEquals(unknownMessage.visibility, "unknown");
});
