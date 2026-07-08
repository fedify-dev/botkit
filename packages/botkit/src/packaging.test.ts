// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2025–2026 Hong Minhee <https://hongminhee.org/>
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
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("declaration files do not contain runtime polyfill code", async (t) => {
  const directory = dirname(fileURLToPath(import.meta.url));
  if (basename(directory) !== "dist") {
    t.skip("Declaration files are only emitted in the built package.");
    return;
  }
  for (const file of await readdir(directory)) {
    if (!file.endsWith(".d.ts")) continue;
    const declaration = await readFile(join(directory, file), "utf8");
    assert.ok(
      !declaration.includes("Date.prototype.toTemporalInstant"),
      `${file} contains runtime Temporal polyfill code.`,
    );
  }
});
