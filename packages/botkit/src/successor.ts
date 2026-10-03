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
import type { Repository } from "./repository.ts";

/**
 * Checks the account migration storage contract before wrapping a repository.
 * @param repository The repository to check.
 * @throws {TypeError} If either required successor method is missing.
 * @internal
 */
export function assertSuccessorRepository(repository: Repository): void {
  if (
    typeof repository.getSuccessor !== "function" ||
    typeof repository.setSuccessor !== "function"
  ) {
    throw new TypeError(
      "Repository must implement getSuccessor() and setSuccessor().",
    );
  }
}
