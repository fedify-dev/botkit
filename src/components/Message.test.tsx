// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2025 Hong Minhee <https://hongminhee.org/>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
import { assertEquals } from "@std/assert/equals";
import { renderCustomEmojis } from "./Message.tsx";

Deno.test("renderCustomEmojis()", () => {
  const emojis = {
    ":smile:": "https://example.com/smile.png",
    ":SmIlE:": "https://example.com/smile2.png",
    ":laughing:": "https://example.com/laughing.gif",
    ":thumbs_up:": "https://example.com/thumb.webp",
  };

  // Test basic replacement
  assertEquals(
    renderCustomEmojis("Hello :smile: world!", emojis),
    'Hello <img src="https://example.com/smile.png" alt=":smile:" style="height: 1em"> world!',
  );

  // Test multiple emojis
  assertEquals(
    renderCustomEmojis("Good morning :smile: :laughing:", emojis),
    'Good morning <img src="https://example.com/smile.png" alt=":smile:" style="height: 1em"> <img src="https://example.com/laughing.gif" alt=":laughing:" style="height: 1em">',
  );

  // Test emojis adjacent to text
  assertEquals(
    renderCustomEmojis("Hi:smile:! How are you:laughing:?", emojis),
    'Hi<img src="https://example.com/smile.png" alt=":smile:" style="height: 1em">! How are you<img src="https://example.com/laughing.gif" alt=":laughing:" style="height: 1em">?',
  );

  // Test unknown emojis (should not be replaced)
  assertEquals(
    renderCustomEmojis("This is an :unknown: emoji.", emojis),
    "This is an :unknown: emoji.",
  );

  // Test emojis mixed with HTML tags
  assertEquals(
    renderCustomEmojis("<p>Hello <b>:smile:</b> world!</p>", emojis),
    '<p>Hello <b><img src="https://example.com/smile.png" alt=":smile:" style="height: 1em"></b> world!</p>',
  );
  assertEquals(
    renderCustomEmojis(
      'Check <a href="#">this :thumbs_up:</a> link.',
      emojis,
    ),
    'Check <a href="#">this <img src="https://example.com/thumb.webp" alt=":thumbs_up:" style="height: 1em"></a> link.',
  );

  // Test emojis inside HTML attributes (should not be replaced)
  assertEquals(
    renderCustomEmojis('<img alt=":smile:" src="pic.jpg">', emojis),
    '<img alt=":smile:" src="pic.jpg">',
  );

  // Test case sensitivity
  assertEquals(
    renderCustomEmojis("Case :SmIlE: test", emojis),
    'Case <img src="https://example.com/smile2.png" alt=":SmIlE:" style="height: 1em"> test',
  );

  // Test emojis with underscores
  assertEquals(
    renderCustomEmojis("Great job :thumbs_up:", emojis),
    'Great job <img src="https://example.com/thumb.webp" alt=":thumbs_up:" style="height: 1em">',
  );

  // Test empty input
  assertEquals(renderCustomEmojis("", emojis), "");

  // Test input with only HTML
  assertEquals(
    renderCustomEmojis("<p><b>Hi</b></p>", emojis),
    "<p><b>Hi</b></p>",
  );

  // Test input with only emojis
  assertEquals(
    renderCustomEmojis(":smile::laughing:", emojis),
    '<img src="https://example.com/smile.png" alt=":smile:" style="height: 1em"><img src="https://example.com/laughing.gif" alt=":laughing:" style="height: 1em">',
  );
});
