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
import assert from "node:assert";
import { test } from "node:test";
import { renderCustomEmojis } from "./Message.tsx";

test("renderCustomEmojis()", () => {
  const emojis = {
    ":smile:": "https://example.com/smile.png",
    ":SmIlE:": "https://example.com/smile2.png",
    ":laughing:": "https://example.com/laughing.gif",
    ":thumbs_up:": "https://example.com/thumb.webp",
  };

  // Test basic replacement
  assert.equal(
    renderCustomEmojis("Hello :smile: world!", emojis),
    'Hello <img src="https://example.com/smile.png" alt=":smile:" style="height: 1em"> world!',
  );

  // Test multiple emojis
  assert.equal(
    renderCustomEmojis("Good morning :smile: :laughing:", emojis),
    'Good morning <img src="https://example.com/smile.png" alt=":smile:" style="height: 1em"> <img src="https://example.com/laughing.gif" alt=":laughing:" style="height: 1em">',
  );

  // Test emojis adjacent to text
  assert.equal(
    renderCustomEmojis("Hi:smile:! How are you:laughing:?", emojis),
    'Hi<img src="https://example.com/smile.png" alt=":smile:" style="height: 1em">! How are you<img src="https://example.com/laughing.gif" alt=":laughing:" style="height: 1em">?',
  );

  // Test unknown emojis (should not be replaced)
  assert.equal(
    renderCustomEmojis("This is an :unknown: emoji.", emojis),
    "This is an :unknown: emoji.",
  );

  // Test emojis mixed with HTML tags
  assert.equal(
    renderCustomEmojis("<p>Hello <b>:smile:</b> world!</p>", emojis),
    '<p>Hello <b><img src="https://example.com/smile.png" alt=":smile:" style="height: 1em"></b> world!</p>',
  );
  assert.equal(
    renderCustomEmojis(
      'Check <a href="#">this :thumbs_up:</a> link.',
      emojis,
    ),
    'Check <a href="#">this <img src="https://example.com/thumb.webp" alt=":thumbs_up:" style="height: 1em"></a> link.',
  );

  // Test emojis inside HTML attributes (should not be replaced)
  assert.equal(
    renderCustomEmojis('<img alt=":smile:" src="pic.jpg">', emojis),
    '<img alt=":smile:" src="pic.jpg">',
  );

  // Test case sensitivity
  assert.equal(
    renderCustomEmojis("Case :SmIlE: test", emojis),
    'Case <img src="https://example.com/smile2.png" alt=":SmIlE:" style="height: 1em"> test',
  );

  // Test emojis with underscores
  assert.equal(
    renderCustomEmojis("Great job :thumbs_up:", emojis),
    'Great job <img src="https://example.com/thumb.webp" alt=":thumbs_up:" style="height: 1em">',
  );

  // Test empty input
  assert.equal(renderCustomEmojis("", emojis), "");

  // Test input with only HTML
  assert.equal(
    renderCustomEmojis("<p><b>Hi</b></p>", emojis),
    "<p><b>Hi</b></p>",
  );

  // Test input with only emojis
  assert.equal(
    renderCustomEmojis(":smile::laughing:", emojis),
    '<img src="https://example.com/smile.png" alt=":smile:" style="height: 1em"><img src="https://example.com/laughing.gif" alt=":laughing:" style="height: 1em">',
  );
});
