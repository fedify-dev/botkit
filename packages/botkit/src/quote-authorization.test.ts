// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2025-2026 Hong Minhee <https://hongminhee.org/>
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
import { createFederation, MemoryKvStore } from "@fedify/fedify/federation";
import { QuoteAuthorization } from "@fedify/vocab";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type QuoteAuthorizationVerificationOptions,
  verifyQuoteAuthorization,
} from "./quote-authorization.ts";

const context = createFederation<void>({ kv: new MemoryKvStore() })
  .createContext(new URL("https://example.com/"), undefined);
const authorizationId = new URL("https://example.com/stamps/1");
const quoteId = new URL("https://quote.example/notes/1");
const targetId = new URL("https://example.com/notes/1");
const targetActorId = new URL("https://example.com/users/alice");

function createAuthorization(
  values: {
    readonly id?: URL;
    readonly attribution?: URL;
    readonly interactingObject?: URL;
    readonly interactionTarget?: URL;
  } = {},
): QuoteAuthorization {
  return new QuoteAuthorization({
    id: values.id ?? authorizationId,
    attribution: values.attribution ?? targetActorId,
    interactingObject: values.interactingObject ?? quoteId,
    interactionTarget: values.interactionTarget ?? targetId,
  });
}

async function verify(
  authorization: unknown,
  options: Partial<QuoteAuthorizationVerificationOptions> = {},
): Promise<boolean> {
  return await verifyQuoteAuthorization(context, authorization, {
    authorizationId,
    quoteId,
    targetId,
    targetActorId,
    source: "remote",
    ...options,
  }) != null;
}

test("verifyQuoteAuthorization() accepts matching authorization", async () => {
  const authorization = createAuthorization();
  assert.deepStrictEqual(
    await verifyQuoteAuthorization(context, authorization, {
      authorizationId,
      quoteId,
      targetId,
      targetActorId,
      source: "remote",
    }),
    authorization,
  );
  assert.ok(
    await verify(authorization, {
      authorizationId: undefined,
      source: "repository",
    }),
  );
});

test("verifyQuoteAuthorization() rejects mismatched authorizations", async () => {
  const cases: readonly [
    string,
    QuoteAuthorization,
    URL | undefined,
  ][] = [
    [
      "attributionId",
      createAuthorization({
        attribution: new URL("https://example.com/users/bob"),
      }),
      authorizationId,
    ],
    [
      "interactingObjectId",
      createAuthorization({
        interactingObject: new URL("https://quote.example/notes/2"),
      }),
      authorizationId,
    ],
    [
      "interactionTargetId",
      createAuthorization({
        interactionTarget: new URL("https://example.com/notes/2"),
      }),
      authorizationId,
    ],
    [
      "authorizationId",
      createAuthorization(),
      new URL("https://example.com/stamps/2"),
    ],
    [
      "origin",
      createAuthorization({
        id: new URL("https://malicious.example/stamps/1"),
      }),
      new URL("https://malicious.example/stamps/1"),
    ],
  ];

  for (const [name, authorization, expectedAuthorizationId] of cases) {
    assert.ok(
      !await verify(authorization, {
        authorizationId: expectedAuthorizationId,
      }),
      name,
    );
  }
});

test("verifyQuoteAuthorization() rejects non-authorization objects", async () => {
  assert.ok(!await verify({}));
});

test("verifyQuoteAuthorization() rejects missing target actors", async () => {
  assert.ok(!await verify(createAuthorization(), { targetActorId: null }));
});

test("verifyQuoteAuthorization() requires IDs for remote authorizations", async () => {
  assert.ok(
    !await verify(createAuthorization(), { authorizationId: undefined }),
  );
});

test("verifyQuoteAuthorization() compares FEP-fe34 origins", async () => {
  const opaqueId = new URL("urn:example:stamp");
  assert.ok(
    !await verify(
      createAuthorization({ id: opaqueId, attribution: opaqueId }),
      {
        authorizationId: opaqueId,
        targetActorId: opaqueId,
      },
    ),
    "opaque IDs",
  );
  const actor = new URL("did:example:alice");
  const stamp = new URL("did:example:alice#stamp");
  assert.ok(
    await verify(createAuthorization({ id: stamp, attribution: actor }), {
      authorizationId: stamp,
      targetActorId: actor,
    }),
    "same DID",
  );
  const other = new URL("did:example:bob#stamp");
  assert.ok(
    !await verify(createAuthorization({ id: other, attribution: actor }), {
      authorizationId: other,
      targetActorId: actor,
    }),
    "different DIDs",
  );
});
