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
import { assert } from "@std/assert/assert";
import { assertFalse } from "@std/assert/false";
import { isEmoji } from "./emoji.ts";

Deno.test("isEmoji() with valid emojis", () => {
  const validEmojis = [
    "😀", // simple emoji
    "👍", // thumbs up
    "🚀", // rocket
    "🏳️‍🌈", // pride flag (complex emoji with ZWJ sequence)
    "👨‍👩‍👧‍👦", // family (complex emoji with multiple ZWJ sequences)
    "👩🏽‍🔬", // woman scientist with medium skin tone
    "🧘🏻‍♀️", // woman in lotus position with light skin tone
    "🤦‍♂️", // man facepalming
    "🇯🇵", // flag
  ];

  for (const emoji of validEmojis) {
    assert(
      isEmoji(emoji),
      `Expected '${emoji}' to be recognized as an emoji`,
    );
  }
});

Deno.test("isEmoji() with invalid inputs", () => {
  const invalidInputs = [
    // Multiple emojis
    "😀😀",
    "👍🏻👎🏻",
    // Regular text
    "hello",
    "a",
    // Mixed content
    "hi😀",
    "👍awesome",
    // Empty string
    "",
    // Non-string values
    42,
    null,
    undefined,
    true,
    false,
    {},
    [],
    new Date(),
  ];

  for (const input of invalidInputs) {
    assertFalse(
      isEmoji(input),
      `Expected '${input}' not to be recognized as an emoji`,
    );
  }
});

Deno.test("isEmoji() with additional edge cases", () => {
  const edgeCaseEmojis = [
    "5️⃣", // key cap sequence
    "❤️", // emoji with presentation variation selector
    "☺️", // older emoji with variation selector
    "👩‍🦰", // woman with red hair (hair modifier)
    "🏊‍♀️", // woman swimming (gender modifier)
    "🧙‍♂️", // man mage (gender modifier)
    "🔢", // input numbers symbol (legacy input emoji)
    "↔️", // arrow with variation selector
    "📧", // e-mail symbol
    "📱", // mobile phone
  ];

  for (const emoji of edgeCaseEmojis) {
    assert(
      isEmoji(emoji),
      `Expected '${emoji}' to be recognized as an emoji`,
    );
  }
});

Deno.test("isEmoji() with tricky invalid inputs", () => {
  const trickyInvalidInputs = [
    " 😀", // emoji with leading space
    "😀 ", // emoji with trailing space
    "\u200B😀", // emoji with zero-width space
    // Note: Single regional indicators like "🇺" are technically valid emojis
    // even though they're usually paired to form flags
    "\u{1F3F4}\uE0067\uE0062", // incomplete tag sequence
    "\uFE0F", // variation selector alone
    "\u200D", // zero width joiner alone
    "♀️♂️", // gender symbols together (should be two separate graphemes)
  ];

  for (const input of trickyInvalidInputs) {
    assertFalse(
      isEmoji(input),
      `Expected '${input}' not to be recognized as an emoji`,
    );
  }
});
