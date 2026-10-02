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
import type { Context } from "@fedify/fedify/federation";
import { quoteInteraction } from "@fedify/interaction-controls";
import { QuoteAuthorization } from "@fedify/vocab";

/**
 * Expected identifiers for verifying a quote authorization stamp.
 *
 * @since 0.6.0
 */
export interface QuoteAuthorizationVerificationOptions {
  /**
   * The expected quote authorization stamp ID.  Required when
   * {@link source} is `"remote"`.
   */
  readonly authorizationId?: URL;

  /**
   * The ID of the quote object that uses the authorization.
   */
  readonly quoteId: URL;

  /**
   * The ID of the quote target object.
   */
  readonly targetId: URL;

  /**
   * The actor that owns the quote target object.
   */
  readonly targetActorId: URL | null;

  /**
   * How the authorization was obtained:
   *
   *  -  `"repository"`: stored by the bot itself, so it is authentic.
   *  -  `"remote"`: dereferenced from {@link authorizationId}, or embedded in
   *     an authenticated activity on the same origin (Fedify's vocabulary
   *     accessors re-fetch cross-origin embedded objects).  It is authentic
   *     only when its ID is the one that was dereferenced.
   */
  readonly source: "repository" | "remote";
}

/**
 * Verifies that an object is a matching FEP-044f quote authorization stamp.
 *
 * @param context The Fedify context.
 * @param authorization The fetched or stored object to verify.
 * @param options The identifiers the authorization must match.
 * @param signal An abort signal.
 * @returns The authorization if it is valid for the quote, or `null`.
 * @throws {DOMException} The signal is aborted.
 * @since 0.6.0
 */
export async function verifyQuoteAuthorization<TContextData>(
  context: Context<TContextData>,
  authorization: unknown,
  options: QuoteAuthorizationVerificationOptions,
  signal?: AbortSignal,
): Promise<QuoteAuthorization | null> {
  signal?.throwIfAborted();
  if (
    !(authorization instanceof QuoteAuthorization) ||
    options.targetActorId == null ||
    (options.authorizationId != null &&
      authorization.id?.href !== options.authorizationId.href)
  ) {
    return null;
  }
  const result = await quoteInteraction.verifyAuthorization(context, {
    authorization,
    interactingObject: options.quoteId,
    interactionTarget: options.targetId,
    attributedTo: options.targetActorId,
    verifyAuthenticity: () =>
      options.source === "repository" || options.authorizationId != null,
  });
  signal?.throwIfAborted();
  return result.verified ? result.authorization : null;
}
