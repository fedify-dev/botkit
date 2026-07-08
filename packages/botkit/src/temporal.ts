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
import { Temporal, toTemporalInstant } from "@js-temporal/polyfill";

if (!("Temporal" in globalThis)) {
  Reflect.set(globalThis, "Temporal", Temporal);
}
if (Date.prototype.toTemporalInstant == null) {
  Reflect.set(Date.prototype, "toTemporalInstant", toTemporalInstant);
}
