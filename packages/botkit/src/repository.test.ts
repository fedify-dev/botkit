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
import {
  type KvKey,
  type KvStore,
  type KvStoreListEntry,
  type KvStoreSetOptions,
  MemoryKvStore,
} from "@fedify/fedify/federation";
import { exportJwk, importJwk } from "@fedify/fedify/sig";
import {
  Create,
  Follow,
  Note,
  Person,
  PUBLIC_COLLECTION,
  QuoteAuthorization,
} from "@fedify/vocab";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  KvRepository,
  MemoryCachedRepository,
  MemoryRepository,
  type Repository,
  type Uuid,
} from "./repository.ts";
import { hideRepositoryMethods } from "./helpers.ts";

function createKvRepository(): Repository {
  return new KvRepository(new MemoryKvStore());
}

function createMemoryRepository(): Repository {
  return new MemoryRepository();
}

function createMemoryCachedRepository(): Repository {
  return new MemoryCachedRepository(createKvRepository());
}

const factories: Record<string, () => Repository> = {
  KvRepository: createKvRepository,
  MemoryRepository: createMemoryRepository,
  MemoryCachedRepository: createMemoryCachedRepository,
};

for (const [name, factory] of Object.entries(factories)) {
  test(`${name} stores quote authorizations`, async () => {
    const repository = factory();
    const id = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
    const interactingObject = new URL("https://remote.example/notes/1");
    const authorization = new QuoteAuthorization({
      id: new URL(
        `https://example.com/ap/actor/bot/quote-authorization/${id}`,
      ),
      attribution: new URL("https://example.com/ap/actor/bot"),
      interactingObject,
      interactionTarget: new URL("https://example.com/ap/note/1"),
    });

    await repository.addQuoteAuthorization("bot", id, authorization);

    assert.deepStrictEqual(
      (await repository.getQuoteAuthorization("bot", id))?.id?.href,
      authorization.id?.href,
    );
    assert.deepStrictEqual(
      (await repository.findQuoteAuthorization("bot", interactingObject))?.id
        ?.href,
      authorization.id?.href,
    );
    assert.deepStrictEqual(
      (await repository.removeQuoteAuthorization("bot", id))?.id?.href,
      authorization.id?.href,
    );
    assert.deepStrictEqual(
      await repository.getQuoteAuthorization("bot", id),
      undefined,
    );
    assert.deepStrictEqual(
      await repository.findQuoteAuthorization("bot", interactingObject),
      undefined,
    );
  });

  test(`${name} keeps the first quote authorization for a quote`, async () => {
    const repository = factory();
    const firstId = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
    const secondId = "01942976-3400-7f34-872e-2cbf0f9eeac5" as Uuid;
    const interactingObject = new URL("https://remote.example/notes/1");
    const target = new URL("https://example.com/ap/note/1");
    const first = new QuoteAuthorization({
      id: new URL(
        `https://example.com/ap/actor/bot/quote-authorization/${firstId}`,
      ),
      attribution: new URL("https://example.com/ap/actor/bot"),
      interactingObject,
      interactionTarget: target,
    });
    const second = new QuoteAuthorization({
      id: new URL(
        `https://example.com/ap/actor/bot/quote-authorization/${secondId}`,
      ),
      attribution: new URL("https://example.com/ap/actor/bot"),
      interactingObject,
      interactionTarget: target,
    });

    await repository.addQuoteAuthorization("bot", firstId, first);
    await repository.addQuoteAuthorization("bot", secondId, second);

    assert.deepStrictEqual(
      (await repository.findQuoteAuthorization("bot", interactingObject))?.id
        ?.href,
      first.id?.href,
    );
    assert.deepStrictEqual(
      await repository.getQuoteAuthorization("bot", secondId),
      undefined,
    );
  });

  test(`${name} stores quote authorization references`, async () => {
    const repository = factory();
    const authorization = new URL("https://remote.example/stamps/1");
    const firstMessageId = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
    const secondMessageId = "01942976-3400-7f34-872e-2cbf0f9eeac5" as Uuid;

    await repository.addQuoteAuthorizationReference(
      "bot",
      authorization,
      firstMessageId,
    );

    assert.deepStrictEqual(
      await repository.findQuoteAuthorizationReference("other", authorization),
      undefined,
    );
    assert.deepStrictEqual(
      await Array.fromAsync(
        repository.findQuoteAuthorizationReferenceIdentifiers(authorization),
      ),
      ["bot"],
    );
    assert.deepStrictEqual(
      await repository.findQuoteAuthorizationReference("bot", authorization),
      firstMessageId,
    );
    await repository.addQuoteAuthorizationReference(
      "other",
      authorization,
      firstMessageId,
    );
    assert.deepStrictEqual(
      await Array.fromAsync(
        repository.findQuoteAuthorizationReferenceIdentifiers(authorization),
      ),
      ["bot", "other"],
    );

    await repository.addQuoteAuthorizationReference(
      "bot",
      authorization,
      secondMessageId,
    );

    assert.deepStrictEqual(
      await repository.findQuoteAuthorizationReference("bot", authorization),
      secondMessageId,
    );

    await repository.removeQuoteAuthorizationReference("bot", authorization);

    assert.deepStrictEqual(
      await repository.findQuoteAuthorizationReference("bot", authorization),
      undefined,
    );
    assert.deepStrictEqual(
      await Array.fromAsync(
        repository.findQuoteAuthorizationReferenceIdentifiers(authorization),
      ),
      ["other"],
    );
  });
}

test("MemoryCachedRepository keeps duplicate quote authorizations out of cache", async () => {
  const underlying = createKvRepository();
  const repository = new MemoryCachedRepository(underlying);
  const firstId = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
  const secondId = "01942976-3400-7f34-872e-2cbf0f9eeac5" as Uuid;
  const interactingObject = new URL("https://remote.example/notes/1");
  const target = new URL("https://example.com/ap/note/1");
  const first = new QuoteAuthorization({
    id: new URL(
      `https://example.com/ap/actor/bot/quote-authorization/${firstId}`,
    ),
    attribution: new URL("https://example.com/ap/actor/bot"),
    interactingObject,
    interactionTarget: target,
  });
  const second = new QuoteAuthorization({
    id: new URL(
      `https://example.com/ap/actor/bot/quote-authorization/${secondId}`,
    ),
    attribution: new URL("https://example.com/ap/actor/bot"),
    interactingObject,
    interactionTarget: target,
  });

  await underlying.addQuoteAuthorization("bot", firstId, first);
  await repository.addQuoteAuthorization("bot", secondId, second);

  assert.deepStrictEqual(
    (await repository.findQuoteAuthorization("bot", interactingObject))?.id
      ?.href,
    first.id?.href,
  );
  assert.deepStrictEqual(
    await repository.getQuoteAuthorization("bot", secondId),
    undefined,
  );
});

test("MemoryCachedRepository does not cache failed quote authorization references", async () => {
  class FailingQuoteAuthorizationReferenceRepository extends MemoryRepository {
    override addQuoteAuthorizationReference(
      _identifier: string,
      _authorization: URL,
      _messageId: Uuid,
    ): Promise<void> {
      return Promise.reject(new TypeError("Durable write failed."));
    }
  }
  const underlying = new FailingQuoteAuthorizationReferenceRepository();
  const repository = new MemoryCachedRepository(underlying);
  const authorization = new URL("https://remote.example/stamps/1");
  const messageId = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;

  await assert.rejects(
    () =>
      repository.addQuoteAuthorizationReference(
        "bot",
        authorization,
        messageId,
      ),
    TypeError,
    "Durable write failed.",
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference("bot", authorization),
    undefined,
  );
});

test("MemoryCachedRepository keeps quote authorization reference cache on remove failures", async () => {
  class FailingQuoteAuthorizationReferenceRepository extends MemoryRepository {
    override removeQuoteAuthorizationReference(
      _identifier: string,
      _authorization: URL,
    ): Promise<void> {
      return Promise.reject(new TypeError("Durable delete failed."));
    }
  }
  const underlying = new FailingQuoteAuthorizationReferenceRepository();
  const repository = new MemoryCachedRepository(underlying);
  const authorization = new URL("https://remote.example/stamps/1");
  const messageId = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
  await underlying.addQuoteAuthorizationReference(
    "bot",
    authorization,
    messageId,
  );
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference("bot", authorization),
    messageId,
  );

  await assert.rejects(
    () => repository.removeQuoteAuthorizationReference("bot", authorization),
    TypeError,
    "Durable delete failed.",
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference("bot", authorization),
    messageId,
  );
});

test("MemoryCachedRepository tolerates missing quote reference index methods", async () => {
  const underlying = new MemoryRepository();
  const authorization = new URL("https://remote.example/stamps/1");
  const messageId = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
  await underlying.addQuoteAuthorizationReference(
    "bot",
    authorization,
    messageId,
    new URL("https://remote.example/actors/alice"),
  );
  const repository = new MemoryCachedRepository(
    hideRepositoryMethods(underlying, [
      "findQuoteAuthorizationReferenceAttribution",
      "findQuoteAuthorizationReferenceIdentifiers",
    ]),
  );

  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReference("bot", authorization),
    messageId,
  );
  assert.deepStrictEqual(
    await repository.findQuoteAuthorizationReferenceAttribution(
      "bot",
      authorization,
    ),
    undefined,
  );
  assert.deepStrictEqual(
    await Array.fromAsync(
      repository.findQuoteAuthorizationReferenceIdentifiers(authorization),
    ),
    [],
  );
});

test("KvRepository serializes concurrent quote authorization inserts", async () => {
  const repository = new KvRepository(new RacingQuoteAuthorizationKvStore());
  const firstId = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
  const secondId = "01942976-3400-7f34-872e-2cbf0f9eeac5" as Uuid;
  const interactingObject = new URL("https://remote.example/notes/1");
  const target = new URL("https://example.com/ap/note/1");
  const first = new QuoteAuthorization({
    id: new URL(
      `https://example.com/ap/actor/bot/quote-authorization/${firstId}`,
    ),
    attribution: new URL("https://example.com/ap/actor/bot"),
    interactingObject,
    interactionTarget: target,
  });
  const second = new QuoteAuthorization({
    id: new URL(
      `https://example.com/ap/actor/bot/quote-authorization/${secondId}`,
    ),
    attribution: new URL("https://example.com/ap/actor/bot"),
    interactingObject,
    interactionTarget: target,
  });

  await Promise.all([
    repository.addQuoteAuthorization("bot", firstId, first),
    repository.addQuoteAuthorization("bot", secondId, second),
  ]);

  const indexed = await repository.findQuoteAuthorization(
    "bot",
    interactingObject,
  );
  const stored = [
    await repository.getQuoteAuthorization("bot", firstId),
    await repository.getQuoteAuthorization("bot", secondId),
  ].filter((authorization) => authorization != null);
  assert.deepStrictEqual(stored.length, 1);
  assert.deepStrictEqual(indexed?.id?.href, stored[0].id?.href);
});

test("KvRepository replaces stale quote authorization indexes", async () => {
  const kv = new MemoryKvStore();
  const repository = new KvRepository(kv);
  const staleId = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
  const id = "01942976-3400-7f34-872e-2cbf0f9eeac5" as Uuid;
  const interactingObject = new URL("https://remote.example/notes/quote");
  const authorization = new QuoteAuthorization({
    id: new URL(
      `https://example.com/ap/actor/bot/quote-authorization/${id}`,
    ),
    attribution: new URL("https://example.com/ap/actor/bot"),
    interactingObject,
    interactionTarget: new URL("https://example.com/ap/note/1"),
  });
  const indexKey = scopedKvKey(
    "quoteAuthorizationsByInteractingObject",
    interactingObject.href,
  );
  await kv.set(indexKey, staleId);

  await repository.addQuoteAuthorization("bot", id, authorization);

  assert.deepStrictEqual(await kv.get(indexKey), id);
  assert.deepStrictEqual(
    (await repository.findQuoteAuthorization("bot", interactingObject))?.id
      ?.href,
    authorization.id?.href,
  );
});

test("KvRepository removes quote authorization indexes before parsing", async () => {
  const kv = new MemoryKvStore();
  const repository = new KvRepository(kv);
  const id = "01942976-3400-7f34-872e-2cbf0f9eeac4" as Uuid;
  const interactingObject = new URL("https://remote.example/notes/quote");
  const authorizationKey = scopedKvKey("quoteAuthorizations", id);
  const indexKey = scopedKvKey(
    "quoteAuthorizationsByInteractingObject",
    interactingObject.href,
  );
  await kv.set(authorizationKey, {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "QuoteAuthorization",
    interactingObject: interactingObject.href,
  });
  await kv.set(indexKey, id);

  const removed = await repository.removeQuoteAuthorization("bot", id);

  assert.ok(removed?.interactingObjectId == null);
  assert.deepStrictEqual(await kv.get(authorizationKey), undefined);
  assert.deepStrictEqual(await kv.get(indexKey), undefined);
  assert.deepStrictEqual(
    await repository.findQuoteAuthorization("bot", interactingObject),
    undefined,
  );
});

function scopedKvKey(...rest: readonly string[]): KvKey {
  return ["_botkit", "bots", "bot", ...rest];
}

class RecordingMemoryKvStore extends MemoryKvStore {
  readonly lockOptions: KvStoreSetOptions[] = [];
  readonly lockReleaseOptions: KvStoreSetOptions[] = [];
  readonly undefinedLockReleases: KvKey[] = [];
  releasedLockAcquisitions = 0;

  override set(
    key: KvKey,
    value: unknown,
    options?: KvStoreSetOptions,
  ): Promise<void> {
    if (key.includes("lock")) this.lockOptions.push(options ?? {});
    return super.set(key, value, options);
  }

  override cas(
    key: KvKey,
    expectedValue: unknown,
    newValue: unknown,
    options?: KvStoreSetOptions,
  ): Promise<boolean> {
    if (key.includes("lock")) {
      if (newValue === undefined) {
        this.undefinedLockReleases.push(key);
      } else if (
        typeof newValue === "object" && newValue != null &&
        "released" in newValue
      ) {
        this.lockReleaseOptions.push(options ?? {});
      } else if (
        typeof expectedValue === "object" && expectedValue != null &&
        "released" in expectedValue
      ) {
        this.releasedLockAcquisitions++;
      } else {
        this.lockOptions.push(options ?? {});
      }
    }
    return super.cas(key, expectedValue, newValue, options);
  }
}

class RecordingListMemoryKvStore extends MemoryKvStore {
  listCalls = 0;

  override list(prefix?: KvKey): AsyncIterable<KvStoreListEntry> {
    this.listCalls++;
    return super.list(prefix);
  }
}

class RacingQuoteAuthorizationKvStore extends MemoryKvStore {
  #indexGets = 0;
  #releaseIndexGets: (() => void) | undefined;
  #indexGetBarrier = new Promise<void>((resolve) => {
    this.#releaseIndexGets = resolve;
  });

  override async get<T = unknown>(key: KvKey): Promise<T | undefined> {
    if (
      key.includes("quoteAuthorizationsByInteractingObject") &&
      !key.includes("lock")
    ) {
      const lock = await super.get([...key, "lock"]);
      if (lock == null && this.#indexGets < 2) {
        this.#indexGets++;
        if (this.#indexGets === 2) this.#releaseIndexGets?.();
        await this.#indexGetBarrier;
      }
    }
    return await super.get<T>(key);
  }
}

class NonCasMemoryKvStore implements KvStore {
  readonly #kv = new MemoryKvStore();

  get<T = unknown>(key: KvKey): Promise<T | undefined> {
    return this.#kv.get<T>(key);
  }

  set(
    key: KvKey,
    value: unknown,
    options?: KvStoreSetOptions,
  ): Promise<void> {
    return this.#kv.set(key, value, options);
  }

  delete(key: KvKey): Promise<void> {
    return this.#kv.delete(key);
  }

  list(prefix?: KvKey): AsyncIterable<KvStoreListEntry> {
    return this.#kv.list(prefix);
  }
}

class FailingReleaseMemoryKvStore extends MemoryKvStore {
  override set(
    key: KvKey,
    value: unknown,
    options?: KvStoreSetOptions,
  ): Promise<void> {
    if (!key.includes("lock")) {
      throw new TypeError("Write failed.");
    }
    return super.set(key, value, options);
  }

  override cas(
    key: KvKey,
    expectedValue: unknown,
    newValue: unknown,
    options?: KvStoreSetOptions,
  ): Promise<boolean> {
    if (
      key.includes("lock") && typeof newValue === "object" &&
      newValue != null && "released" in newValue
    ) {
      throw new TypeError("Release failed.");
    }
    return super.cas(key, expectedValue, newValue, options);
  }
}

const keyPairs: CryptoKeyPair[] = [
  {
    publicKey: await importJwk({
      kty: "RSA",
      alg: "RS256",
      // cSpell: disable
      n: "1NZblYSc2beQqDmDUF_VDMeS7bUXShvIMK6NHd9OB-7ivBwad8vUcmqKwWj_ivqZva6EgD-n0549t0Pzn5xTArqEJ-c1DTyhC7TNtof0KIbU75qziHwHOqcyYCHusQgDm_TT7frDuxLqHJQ1UrdADMyCVDPFfcstPHhHp3NYStGeNcBo5B05DB_wkgqX2QF2MamQwkdRRMdZkVees38AsC6GTGoOFRI2lvJuUODtndpyjGAKOkLfkr9XzAcggRYx9ddsHBd5wylffwKhtUtWHkdVBdVAiEX8sZ38LhqNYm161PE83nfEvut6_lCCQ7DlPJ8Tp6SY-f2JTXA-C9sN0uJF8_YGhaCPgolv5Pk2UerQmvhMhql9MLDen1AvZrw0u1CWic0GQeIDA6Op9Exd5azhhdm4iKeYzAekUHFDi6WZRRZRCYgHaEEzXyFt9W3N3paolMYVOh1008d-aIgbYnZMToiwH897uQsNGkd1FVIutycXdeuhAbqB7AtLrzuD78wkKLO8k3DFcix2qaHRqiBKC3lUlDCD_I5yzinY_SOcagdpRxczvi6JN1ahUg39ZKYRtJIxUOp1H3iRrebbaOoxM19-axKH1om0sYtyX4JqYfN9QrSf3cO1I6CGnJY8hIkQ6CDH5Tmk_4VRRKdzphq4jZiiOYfR94WODPKDjTM",
      e: "AQAB",
      // cSpell: enable
      key_ops: ["verify"],
      ext: true,
    }, "public"),
    privateKey: await importJwk({
      kty: "RSA",
      alg: "RS256",
      // cSpell: disable
      n: "1NZblYSc2beQqDmDUF_VDMeS7bUXShvIMK6NHd9OB-7ivBwad8vUcmqKwWj_ivqZva6EgD-n0549t0Pzn5xTArqEJ-c1DTyhC7TNtof0KIbU75qziHwHOqcyYCHusQgDm_TT7frDuxLqHJQ1UrdADMyCVDPFfcstPHhHp3NYStGeNcBo5B05DB_wkgqX2QF2MamQwkdRRMdZkVees38AsC6GTGoOFRI2lvJuUODtndpyjGAKOkLfkr9XzAcggRYx9ddsHBd5wylffwKhtUtWHkdVBdVAiEX8sZ38LhqNYm161PE83nfEvut6_lCCQ7DlPJ8Tp6SY-f2JTXA-C9sN0uJF8_YGhaCPgolv5Pk2UerQmvhMhql9MLDen1AvZrw0u1CWic0GQeIDA6Op9Exd5azhhdm4iKeYzAekUHFDi6WZRRZRCYgHaEEzXyFt9W3N3paolMYVOh1008d-aIgbYnZMToiwH897uQsNGkd1FVIutycXdeuhAbqB7AtLrzuD78wkKLO8k3DFcix2qaHRqiBKC3lUlDCD_I5yzinY_SOcagdpRxczvi6JN1ahUg39ZKYRtJIxUOp1H3iRrebbaOoxM19-axKH1om0sYtyX4JqYfN9QrSf3cO1I6CGnJY8hIkQ6CDH5Tmk_4VRRKdzphq4jZiiOYfR94WODPKDjTM",
      e: "AQAB",
      d: "Yl3DrCHDIDhfifAyyWXRIHvoYyZL4jte1WkG3WSEOtRkRA41CWLSCCNHh8YQPNo_TdQnduJ0nTBIU7f7E6x7DQrI42xPL5Py1mc0oATLiiNurGJyUUUJTklR1e440-bhTCXmANnhtkcyngy9bEI3PvMR1PqsbswFVyo76586kjG5DhykHbGH2Ru14rk0nt23E5LLzY6Kd-AufCbjuQ-ccNC_zvdBFOn7At5-r7CVAVyhjlEgyPZ5P-hhGnG8ywxIANgUJhOPeexYL2o29IQiBBJxsCV0EsdN14UttN0etPvmRh5MRIFUE-zfRkRNQB20hMT8n4FKFlfgKkMS2gXep91h9VVyfYPHAt9jGJgUbIcbx_igeLK3nQlaUXaePf2bAuVRM1kW3P2UR0FOoUKDI5FZmi9XBoEtt0taQYySdKbPSXKaJWO2vKQ4SPyVXzzz-obfVe2zIe1msQ3Tco5RFoHfnufbvvnLC_WUAC9LSfp4jrPvr5lY3uoCFmPma56R-E3mVd2q87Ybk6mqvSh4yWHjid7sfzQ8Ovh9OhZlq_7Mfa3q3M92vNL98iHs8xYkJbE0DJs691UdgX45iNi4DVD-hJ7EbKQQgePsYNovWA611kM-cartevQWk7TBBggy9VYqmdWN0QuVQX9bsHFeYjjKSXg24bV5vYQW3EPkqZk",
      p: "9DeEDfMVdV605MbHCtHnw5xEbzTHd7vK-qAQNIjz5i4EmFC0tK7dvUiSn0WeyMNYJkuxVxTMHoDbWXzXq45tzbTEYuzEo5wsxyoVvldfFnnJIwMu6Hb7PWjyWfpBcbwLISr8fAJaGPzgcFsJE__KxrvLA66m1q_4k1y1L9CvXWfHDvFqb7VLGzKWXXp2wlbsACZuqx2Ff3THcWoOWb-wSww6AGsYAc3zC_DiYvAaTn9MxszZ0UYuMeJIHjLA1dmjL-Nksvq5GukjFxSSTpUS87zJ08fHoB0FzTKIIjJGpMRf6ebReLqbYCdo2Kr7eC7lbcTfwQTPI6gnHSKgPIYF5Q",
      q: "3xtArH_4MQjwRpl7JVivzQUZgDTARkynMpX-4Gvyny6Gxx0QLhHH0lQMRhtFWlI6qLZxCCLC9zhXPmGlqW-QWya8-xE80mX45JTrQlwBHISpTWTV3sI2Lp5dg7CW8Sc40CE4kB4Q2rHhf7V-Aimgmqhnl1uguzH2DXfr3RaCor0ge44k6gi1LXEJN_aFQIIFYL8HQOM0ctdY147Kr2rVHLchRnh8Q4GzBAJvpOcfvEDk9HF09NVxeaivLMXChpuSUHqbEGg_lVkotLnCMb-fUWk8QmO8EFFVU0pyOFDqHKIgrHOLSHjgUvV8moBwnMGQxMgu7rpY3g-9cXfsCoKVNw",
      dp:
        "bL1vajqrelhSGW-83r95_-pLumx4yIJwrcmpjYrRdtNUrnF5FN6r0wVGa-629dOtI1gevZSAErDzelQRP80qbSapLxcXs3XtpjzB87-5kitl-NYJA-8-jSh2iMPacgb1ua4HQDxX27p1QPH4B9SkeHrTuW8B0KQH_a2Q65pzCxcTVj7-UoEZ0SFkPHkz-fJ0INj7--soLwlTaNd9Tk8A81mdVeRZiywlpVJ7quwX-o3KJNa_weQK26FS1Udp_45pkAAjLWJgG3BldHhvcNgF2UtdXpQc-dkSZTyzyu4x8FmUD3T8HlKQrm69y4POdsQC2i6IJsy6YrkTuXBagrh2VQ",
      dq:
        "j0CQZjJEyjdTEAG8cF5hguKjXQ6B5qGROYnV_YNSZaMaJv8iRHJmO0Z8GwenoDbsMyfxq6emR9aFLijEleZsahqVfR-0TePry9lStWkdzZHgozD7oexRnd1Rbh0UzgLBF-I8z0x-xe0xPS7rmbfgx20aFrVentOViVBWwb6SYqvND4hVa2_r5SGPKb_AD4tsqJH_tkosgxCCmuW0fq256JYtZ3I1V6MPrqNhzCAa4GVKnSm8Tvg9xD_rOnRAUu3RJJuUtRQ6v0pgOKqNZiQDx-IqLvaa6l9OygwjCsXpjDkNga0u4Xm7j4jQWOPfasdejPt8Jwy_wtWYbiLyDE2MQQ",
      qi:
        "Th3TS6fHquqNljwZU2Vg7ndI0SmJidIwSTS2LlhM-Y2bxaAUF-orpS504xDVk1xjRYBrdxiTOmohbtoKtiWhLveOUAWVoNilMqgEU7lwnhaE3yfiUoE1x8df_wLP_YiAccFKeMZwsQp29aKLxuYQtO2dRSSQkN0IuxMGchnJtGOGNTbyA44O25IwggV1nlJN7OTX-nsJCSCe1XMojnGezhnD4xXGeSuR3S07oDDiWpvAO7qtRphEavVTtXdJWIr27tBvnUytbpb4uq6A3J4-TZ6X9uzlOw6jBSQhbL7fc83Z9E_wjPTnxfHufiC_AtXow6sK7lCy10aJGHp3jnGVdQ",
      // cSpell: enable
      key_ops: ["sign"],
      ext: true,
    }, "private"),
  },
  {
    privateKey: await importJwk({
      kty: "OKP",
      crv: "Ed25519",
      // cSpell: disable-next-line
      x: "CwcwyY7tu4wVzVW3KKX7AnBO8HakA2pg0rhAiMbGtfk",
      key_ops: ["sign"],
      ext: true,
      // cSpell: disable-next-line
      d: "K64nFsAPt892l7rr10uDsBXCW151CUM29SugU6l4ZzE",
    }, "private"),
    publicKey: await importJwk({
      kty: "OKP",
      crv: "Ed25519",
      // cSpell: disable-next-line
      x: "CwcwyY7tu4wVzVW3KKX7AnBO8HakA2pg0rhAiMbGtfk",
      key_ops: ["verify"],
      ext: true,
    }, "public"),
  },
];

test("KvRepository uses expiring follower locks", async () => {
  const kv = new RecordingMemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/lock-test"),
    preferredUsername: "lock-test",
  });

  await repo.addFollower(
    "bot",
    new URL("https://example.com/ap/follow/lock-test"),
    follower,
  );

  assert.ok(kv.lockOptions.length > 0);
  assert.ok(kv.lockOptions.every((options) => options.ttl != null));
  assert.ok(kv.lockReleaseOptions.length > 0);
  assert.ok(kv.lockReleaseOptions.every((options) => options.ttl != null));
  assert.deepStrictEqual(kv.undefinedLockReleases, []);
});

test("KvRepository reacquires released follower locks", async () => {
  const kv = new RecordingMemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/released-lock"),
    preferredUsername: "released-lock",
  });

  await repo.addFollower(
    "bot",
    new URL("https://example.com/ap/follow/released-lock/1"),
    follower,
  );
  await repo.addFollower(
    "bot",
    new URL("https://example.com/ap/follow/released-lock/2"),
    follower,
  );

  assert.ok(kv.releasedLockAcquisitions > 0);
});

test("KvRepository deletes stale follower indexes", async () => {
  const kv = new MemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/index-test"),
    preferredUsername: "index-test",
  });
  const follow = new URL("https://example.com/ap/follow/index-test");
  const indexKey = scopedKvKey(
    "followRequests",
    "followers",
    follower.id!.href,
  );

  await repo.addFollower("bot", follow, follower);
  assert.deepStrictEqual(await kv.get(indexKey), [follow.href]);

  await repo.removeFollower("bot", follow, follower.id!);
  assert.deepStrictEqual(await kv.get(indexKey), undefined);
});

test("KvRepository rebuilds missing follower indexes", async () => {
  const kv = new MemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/missing-index"),
    preferredUsername: "missing-index",
  });
  const firstFollow = new URL(
    "https://example.com/ap/follow/missing-index/1",
  );
  const secondFollow = new URL(
    "https://example.com/ap/follow/missing-index/2",
  );
  const indexKey = scopedKvKey(
    "followRequests",
    "followers",
    follower.id!.href,
  );

  await repo.addFollower("bot", firstFollow, follower);
  await repo.addFollower("bot", secondFollow, follower);
  await kv.delete(indexKey);

  assert.deepStrictEqual(
    await repo.removeFollower("bot", firstFollow, follower.id!),
    undefined,
  );
  assert.ok(await repo.hasFollower("bot", follower.id!));
  assert.deepStrictEqual(await kv.get(indexKey), [secondFollow.href]);
});

test("KvRepository trusts empty follower indexes", async () => {
  const kv = new RecordingListMemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/empty-index"),
    preferredUsername: "empty-index",
  });
  const follow = new URL("https://example.com/ap/follow/empty-index");

  await repo.addFollower("bot", follow, follower);
  kv.listCalls = 0;

  assert.deepStrictEqual(
    await repo.removeFollower("bot", follow, follower.id!),
    follower,
  );
  assert.deepStrictEqual(kv.listCalls, 0);
  assert.ok(!await repo.hasFollower("bot", follower.id!));
});

test("KvRepository removes requests with missing followers", async () => {
  const kv = new MemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/missing-follower"),
    preferredUsername: "missing-follower",
  });
  const follow = new URL("https://example.com/ap/follow/missing-follower");
  const followRequestKey = scopedKvKey(
    "followRequests",
    follow.href,
  );
  const indexKey = scopedKvKey(
    "followRequests",
    "followers",
    follower.id!.href,
  );

  await repo.addFollower("bot", follow, follower);
  await kv.delete(scopedKvKey("followers", follower.id!.href));

  assert.deepStrictEqual(
    await repo.removeFollower("bot", follow, follower.id!),
    undefined,
  );
  assert.deepStrictEqual(await kv.get(followRequestKey), undefined);
  assert.deepStrictEqual(await kv.get(indexKey), undefined);
  assert.ok(!await repo.hasFollower("bot", follower.id!));
});

test("KvRepository uses follower indexes when adding requests", async () => {
  const kv = new RecordingListMemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/index-add"),
    preferredUsername: "index-add",
  });
  const firstFollow = new URL("https://example.com/ap/follow/index-add/1");
  const secondFollow = new URL("https://example.com/ap/follow/index-add/2");
  const indexKey = scopedKvKey(
    "followRequests",
    "followers",
    follower.id!.href,
  );

  await repo.addFollower("bot", firstFollow, follower);
  kv.listCalls = 0;
  await repo.addFollower("bot", secondFollow, follower);

  assert.deepStrictEqual(await kv.get(indexKey), [
    firstFollow.href,
    secondFollow.href,
  ]);
  assert.deepStrictEqual(kv.listCalls, 0);

  kv.listCalls = 0;
  assert.deepStrictEqual(
    await repo.removeFollower("bot", firstFollow, follower.id!),
    undefined,
  );
  assert.deepStrictEqual(kv.listCalls, 0);
  assert.deepStrictEqual(await kv.get(indexKey), [secondFollow.href]);
});

test("KvRepository rebuilds legacy requests for new follower rows", async () => {
  const kv = new MemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/legacy-new-row"),
    preferredUsername: "legacy-new-row",
  });
  const legacyFollow = new URL(
    "https://example.com/ap/follow/legacy-new-row/1",
  );
  const newFollow = new URL(
    "https://example.com/ap/follow/legacy-new-row/2",
  );
  const indexKey = scopedKvKey(
    "followRequests",
    "followers",
    follower.id!.href,
  );

  await kv.set(
    scopedKvKey("followRequests", legacyFollow.href),
    follower.id!.href,
  );
  await repo.addFollower("bot", newFollow, follower);

  assert.deepStrictEqual(
    await repo.removeFollower("bot", newFollow, follower.id!),
    undefined,
  );
  assert.ok(await repo.hasFollower("bot", follower.id!));
  assert.deepStrictEqual(await kv.get(indexKey), [legacyFollow.href]);
});

test("KvRepository recovers legacy follower locks", async () => {
  const kv = new MemoryKvStore();
  const repo = new KvRepository(kv);
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/legacy-lock"),
    preferredUsername: "legacy-lock",
  });
  const lockKey = scopedKvKey(
    "followRequests",
    "lock",
    "https://example.com/ap/follow/legacy-lock",
  );

  await kv.set(lockKey, follower.id!.href);
  await repo.addFollower(
    "bot",
    new URL("https://example.com/ap/follow/legacy-lock"),
    follower,
  );

  assert.ok(await repo.hasFollower("bot", follower.id!));
  assert.notDeepStrictEqual(await kv.get(lockKey), follower.id!.href);
});

test("KvRepository supports non-CAS follower mutations", async () => {
  const repo = new KvRepository(new NonCasMemoryKvStore());
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/no-cas"),
    preferredUsername: "no-cas",
  });
  const follow = new URL("https://example.com/ap/follow/no-cas");

  await repo.addFollower("bot", follow, follower);
  assert.ok(await repo.hasFollower("bot", follower.id!));
  assert.deepStrictEqual(
    await repo.removeFollower("bot", follow, follower.id!),
    follower,
  );
  assert.ok(!await repo.hasFollower("bot", follower.id!));
});

test("KvRepository preserves errors when lock release fails", async () => {
  const repo = new KvRepository(new FailingReleaseMemoryKvStore());
  const follower = new Person({
    id: new URL("https://example.com/ap/actor/release-failure"),
    preferredUsername: "release-failure",
  });

  await assert.rejects(
    () =>
      repo.addFollower(
        "bot",
        new URL("https://example.com/ap/follow/release-failure"),
        follower,
      ),
    { name: "TypeError", message: "Write failed." },
  );
});

for (const name in factories) {
  const factory = factories[name];

  describe(name, () => {
    const repo = factory();

    test("key pairs", async () => {
      assert.deepStrictEqual(await repo.getKeyPairs("bot"), undefined);
      await repo.setKeyPairs("bot", keyPairs);
      assert.deepStrictEqual(await repo.getKeyPairs("bot"), keyPairs);
    });

    test("messages", async () => {
      assert.deepStrictEqual(await repo.countMessages("bot"), 0);
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01941f29-7c00-7fe8-ab0a-7b593990a3c0"),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01942976-3400-7f34-872e-2cbf0f9eeac4"),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01942e9c-9000-7480-a553-7a6ce737ce14"),
        undefined,
      );
      assert.deepStrictEqual(
        await Array.fromAsync(repo.getMessages("bot")),
        [],
      );

      const messageA = new Create({
        id: new URL(
          "https://example.com/ap/create/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hello, world!",
          published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
      });
      const messageB = new Create({
        id: new URL(
          "https://example.com/ap/create/0194244f-d800-7873-8993-ef71ccd47306",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hello, world!",
          published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
      });
      const messageC = new Create({
        id: new URL(
          "https://example.com/ap/create/01942976-3400-7f34-872e-2cbf0f9eeac4",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hello, world!",
          published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
      });
      const messageD = new Create({
        id: new URL(
          "https://example.com/ap/create/01942e9c-9000-7480-a553-7a6ce737ce14",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hello, world!",
          published: Temporal.Instant.from("2025-01-04T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-04T00:00:00Z"),
      });
      const messageC2 = new Create({
        id: new URL(
          "https://example.com/ap/create/01942976-3400-7f34-872e-2cbf0f9eeac4",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hi, world!",
          published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
          updated: Temporal.Instant.from("2025-01-03T12:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
        updated: Temporal.Instant.from("2025-01-03T12:00:00Z"),
      });

      await repo.addMessage(
        "bot",
        "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        messageA,
      );
      assert.deepStrictEqual(await repo.countMessages("bot"), 1);
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01942976-3400-7f34-872e-2cbf0f9eeac4"),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01942e9c-9000-7480-a553-7a6ce737ce14"),
        undefined,
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages("bot"))).map((m) =>
            m.toJsonLd()
          ),
        ),
        [await messageA.toJsonLd()],
      );

      await repo.addMessage(
        "bot",
        "0194244f-d800-7873-8993-ef71ccd47306",
        messageB,
      );
      assert.deepStrictEqual(await repo.countMessages("bot"), 2);
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "0194244f-d800-7873-8993-ef71ccd47306",
        ))
          ?.toJsonLd(),
        await messageB.toJsonLd(),
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01942976-3400-7f34-872e-2cbf0f9eeac4"),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01942e9c-9000-7480-a553-7a6ce737ce14"),
        undefined,
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages("bot"))).map((m) =>
            m.toJsonLd()
          ),
        ),
        [await messageB.toJsonLd(), await messageA.toJsonLd()],
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages("bot", { order: "oldest" })))
            .map((
              m,
            ) => m.toJsonLd()),
        ),
        [await messageA.toJsonLd(), await messageB.toJsonLd()],
      );

      await repo.addMessage(
        "bot",
        "01942976-3400-7f34-872e-2cbf0f9eeac4",
        messageC,
      );
      assert.deepStrictEqual(await repo.countMessages("bot"), 3);
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "0194244f-d800-7873-8993-ef71ccd47306",
        ))
          ?.toJsonLd(),
        await messageB.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942976-3400-7f34-872e-2cbf0f9eeac4",
        ))
          ?.toJsonLd(),
        await messageC.toJsonLd(),
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01942e9c-9000-7480-a553-7a6ce737ce14"),
        undefined,
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages("bot", { order: "newest" })))
            .map((
              m,
            ) => m.toJsonLd()),
        ),
        [
          await messageC.toJsonLd(),
          await messageB.toJsonLd(),
          await messageA.toJsonLd(),
        ],
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages("bot", { order: "oldest" })))
            .map((
              m,
            ) => m.toJsonLd()),
        ),
        [
          await messageA.toJsonLd(),
          await messageB.toJsonLd(),
          await messageC.toJsonLd(),
        ],
      );

      await repo.addMessage(
        "bot",
        "01942e9c-9000-7480-a553-7a6ce737ce14",
        messageD,
      );
      assert.deepStrictEqual(await repo.countMessages("bot"), 4);
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "0194244f-d800-7873-8993-ef71ccd47306",
        ))
          ?.toJsonLd(),
        await messageB.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942976-3400-7f34-872e-2cbf0f9eeac4",
        ))
          ?.toJsonLd(),
        await messageC.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942e9c-9000-7480-a553-7a6ce737ce14",
        ))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages("bot"))).map((
            m,
          ) => m.toJsonLd()),
        ),
        [
          await messageD.toJsonLd(),
          await messageC.toJsonLd(),
          await messageB.toJsonLd(),
          await messageA.toJsonLd(),
        ],
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(
            repo.getMessages("bot", {
              order: "oldest",
              until: Temporal.Instant.from("2025-01-03T00:00:00Z"),
            }),
          )).map((m) => m.toJsonLd()),
        ),
        [
          await messageA.toJsonLd(),
          await messageB.toJsonLd(),
          await messageC.toJsonLd(),
        ],
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(
            repo.getMessages("bot", {
              since: Temporal.Instant.from("2025-01-02T00:00:00Z"),
            }),
          )).map((m) => m.toJsonLd()),
        ),
        [
          await messageD.toJsonLd(),
          await messageC.toJsonLd(),
          await messageB.toJsonLd(),
        ],
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(
            repo.getMessages("bot", {
              until: Temporal.Instant.from("2025-01-03T00:00:00Z"),
              since: Temporal.Instant.from("2025-01-02T00:00:00Z"),
            }),
          )).map((m) => m.toJsonLd()),
        ),
        [
          await messageC.toJsonLd(),
          await messageB.toJsonLd(),
        ],
      );

      const removed = await repo.removeMessage(
        "bot",
        "0194244f-d800-7873-8993-ef71ccd47306",
      );
      assert.deepStrictEqual(
        await removed?.toJsonLd(),
        await messageB.toJsonLd(),
      );
      assert.deepStrictEqual(await repo.countMessages("bot"), 3);
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942976-3400-7f34-872e-2cbf0f9eeac4",
        ))
          ?.toJsonLd(),
        await messageC.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942e9c-9000-7480-a553-7a6ce737ce14",
        ))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages("bot", { order: "newest" })))
            .map((
              m,
            ) => m.toJsonLd()),
        ),
        [
          await messageD.toJsonLd(),
          await messageC.toJsonLd(),
          await messageA.toJsonLd(),
        ],
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages("bot", { order: "oldest" })))
            .map((
              m,
            ) => m.toJsonLd()),
        ),
        [
          await messageA.toJsonLd(),
          await messageC.toJsonLd(),
          await messageD.toJsonLd(),
        ],
      );

      await repo.updateMessage(
        "bot",
        "01942976-3400-7f34-872e-2cbf0f9eeac4",
        async (messageC) =>
          messageC.clone({
            object: await messageC2.getObject(),
            updated: messageC2.updated,
          }),
      );
      assert.deepStrictEqual(await repo.countMessages("bot"), 3);
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942976-3400-7f34-872e-2cbf0f9eeac4",
        ))
          ?.toJsonLd(),
        await messageC2.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942e9c-9000-7480-a553-7a6ce737ce14",
        ))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );

      let updaterCalled = false;
      const updated = await repo.updateMessage(
        "bot",
        "00000000-0000-0000-0000-000000000000",
        (message) => {
          updaterCalled = true;
          return message;
        },
      );
      assert.deepStrictEqual(updated, false);
      assert.deepStrictEqual(updaterCalled, false);
      assert.deepStrictEqual(await repo.countMessages("bot"), 3);
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942976-3400-7f34-872e-2cbf0f9eeac4",
        ))
          ?.toJsonLd(),
        await messageC2.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942e9c-9000-7480-a553-7a6ce737ce14",
        ))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );

      const updated2 = await repo.updateMessage(
        "bot",
        "01942e9c-9000-7480-a553-7a6ce737ce14",
        (_) => undefined,
      );
      assert.deepStrictEqual(updated2, false);
      assert.deepStrictEqual(await repo.countMessages("bot"), 3);
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assert.deepStrictEqual(
        await repo.getMessage("bot", "0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942976-3400-7f34-872e-2cbf0f9eeac4",
        ))
          ?.toJsonLd(),
        await messageC2.toJsonLd(),
      );
      assert.deepStrictEqual(
        await (await repo.getMessage(
          "bot",
          "01942e9c-9000-7480-a553-7a6ce737ce14",
        ))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );
    });

    test("followers", async () => {
      const followerA = new Person({
        id: new URL("https://example.com/ap/actor/john"),
        preferredUsername: "john",
      });
      const followFromA = new URL(
        "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0",
      );
      const followerB = new Person({
        id: new URL("https://example.com/ap/actor/jane"),
        preferredUsername: "jane",
      });
      const followFromB = new URL(
        "https://example.com/ap/follow/8b76286d-5eef-4f02-8a16-080ff2b0e2ca",
      );

      assert.deepStrictEqual(await repo.countFollowers("bot"), 0);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", followerA.id!),
        false,
      );
      assert.deepStrictEqual(
        await repo.hasFollower("bot", followerB.id!),
        false,
      );
      assert.deepStrictEqual(
        await Array.fromAsync(repo.getFollowers("bot")),
        [],
      );

      await repo.addFollower("bot", followFromA, followerA);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.ok(await repo.hasFollower("bot", followerA.id!));
      assert.deepStrictEqual(
        await repo.hasFollower("bot", followerB.id!),
        false,
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers("bot"))).map((f) =>
            f.toJsonLd()
          ),
        ),
        [await followerA.toJsonLd()],
      );

      await repo.addFollower("bot", followFromB, followerB);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 2);
      assert.ok(await repo.hasFollower("bot", followerA.id!));
      assert.ok(await repo.hasFollower("bot", followerB.id!));
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers("bot"))).map((f) =>
            f.toJsonLd()
          ),
        ),
        [await followerA.toJsonLd(), await followerB.toJsonLd()],
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers("bot", { offset: 1 }))).map((
            f,
          ) => f.toJsonLd()),
        ),
        [await followerB.toJsonLd()],
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers("bot", { limit: 1 }))).map((
            f,
          ) => f.toJsonLd()),
        ),
        [await followerA.toJsonLd()],
      );

      assert.deepStrictEqual(
        await repo.removeFollower("bot", followFromA, followerB.id!),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.removeFollower("bot", followFromB, followerA.id!),
        undefined,
      );
      assert.deepStrictEqual(await repo.countFollowers("bot"), 2);
      assert.ok(await repo.hasFollower("bot", followerA.id!));
      assert.ok(await repo.hasFollower("bot", followerB.id!));

      await repo.removeFollower("bot", followFromA, followerA.id!);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", followerA.id!),
        false,
      );
      assert.ok(await repo.hasFollower("bot", followerB.id!));

      await repo.removeFollower("bot", followFromB, followerB.id!);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 0);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", followerA.id!),
        false,
      );
      assert.deepStrictEqual(
        await repo.hasFollower("bot", followerB.id!),
        false,
      );
    });

    test("followers with multiple follow requests", async () => {
      const follower = new Person({
        id: new URL("https://example.com/ap/actor/alice"),
        preferredUsername: "alice",
      });
      const followA = new URL(
        "https://example.com/ap/follow/f2fb7255-d3ad-4fef-8f9a-1d0f2c2ec0b4",
      );
      const followB = new URL(
        "https://example.com/ap/follow/a3d4cc4f-af93-4a9f-a7b3-0b7c0fe4901d",
      );

      await repo.addFollower("bot", followA, follower);
      await repo.addFollower("bot", followB, follower);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.ok(await repo.hasFollower("bot", follower.id!));

      assert.deepStrictEqual(
        await repo.removeFollower("bot", followA, follower.id!),
        undefined,
      );
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.ok(await repo.hasFollower("bot", follower.id!));

      assert.deepStrictEqual(
        await (await repo.removeFollower("bot", followB, follower.id!))
          ?.toJsonLd(),
        await follower.toJsonLd(),
      );
      assert.deepStrictEqual(await repo.countFollowers("bot"), 0);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", follower.id!),
        false,
      );
    });

    test("followers with reassigned follow requests", async () => {
      const oldFollower = new Person({
        id: new URL("https://example.com/ap/actor/alice"),
        preferredUsername: "alice",
      });
      const newFollower = new Person({
        id: new URL("https://example.com/ap/actor/bob"),
        preferredUsername: "bob",
      });
      const followA = new URL(
        "https://example.com/ap/follow/f2fb7255-d3ad-4fef-8f9a-1d0f2c2ec0b4",
      );
      const followB = new URL(
        "https://example.com/ap/follow/a3d4cc4f-af93-4a9f-a7b3-0b7c0fe4901d",
      );

      await repo.addFollower("bot", followA, oldFollower);
      await repo.addFollower("bot", followB, oldFollower);
      await repo.addFollower("bot", followA, newFollower);

      assert.deepStrictEqual(await repo.countFollowers("bot"), 2);
      assert.ok(await repo.hasFollower("bot", oldFollower.id!));
      assert.ok(await repo.hasFollower("bot", newFollower.id!));

      assert.deepStrictEqual(
        await (await repo.removeFollower("bot", followB, oldFollower.id!))
          ?.toJsonLd(),
        await oldFollower.toJsonLd(),
      );
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", oldFollower.id!),
        false,
      );
      assert.ok(await repo.hasFollower("bot", newFollower.id!));

      await repo.addFollower("bot", followA, oldFollower);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.ok(await repo.hasFollower("bot", oldFollower.id!));
      assert.deepStrictEqual(
        await repo.hasFollower("bot", newFollower.id!),
        false,
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers("bot"))).map((follower) =>
            follower.toJsonLd()
          ),
        ),
        [await oldFollower.toJsonLd()],
      );
    });

    test("sent follows", async () => {
      const follow = new Follow({
        id: new URL(
          "https://example.com/ap/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new URL("https://example.com/ap/actor/john"),
      });

      assert.deepStrictEqual(
        await repo.getSentFollow("bot", "03a395a2-353a-4894-afdb-2cab31a7b004"),
        undefined,
      );

      await repo.addSentFollow(
        "bot",
        "03a395a2-353a-4894-afdb-2cab31a7b004",
        follow,
      );
      assert.deepStrictEqual(
        await (await repo.getSentFollow(
          "bot",
          "03a395a2-353a-4894-afdb-2cab31a7b004",
        ))
          ?.toJsonLd(),
        await follow.toJsonLd(),
      );

      await repo.removeSentFollow(
        "bot",
        "03a395a2-353a-4894-afdb-2cab31a7b004",
      );
      assert.deepStrictEqual(
        await repo.getSentFollow("bot", "03a395a2-353a-4894-afdb-2cab31a7b004"),
        undefined,
      );
    });

    test("followees", async () => {
      const followeeId = new URL("https://example.com/ap/actor/john");
      const follow = new Follow({
        id: new URL(
          "https://example.com/ap/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: followeeId,
      });

      assert.deepStrictEqual(
        await repo.getFollowee("bot", followeeId),
        undefined,
      );

      await repo.addFollowee("bot", followeeId, follow);
      assert.deepStrictEqual(
        await (await repo.getFollowee("bot", followeeId))?.toJsonLd(),
        await follow.toJsonLd(),
      );

      await repo.removeFollowee("bot", followeeId);
      assert.deepStrictEqual(
        await repo.getFollowee("bot", followeeId),
        undefined,
      );
    });

    test("poll voting", async () => {
      const messageId1 = "01945678-1234-7890-abcd-ef0123456789";
      const messageId2 = "01945678-5678-7890-abcd-ef0123456789";
      const voter1 = new URL("https://example.com/ap/actor/alice");
      const voter2 = new URL("https://example.com/ap/actor/bob");
      const voter3 = new URL("https://example.com/ap/actor/charlie");

      // Initially, no votes exist
      assert.deepStrictEqual(await repo.countVoters("bot", messageId1), 0);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId1), {});
      assert.deepStrictEqual(await repo.countVoters("bot", messageId2), 0);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId2), {});

      // Single voter, single option
      await repo.vote("bot", messageId1, voter1, "option1");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId1), 1);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId1), {
        "option1": 1,
      });

      // Same voter votes for same option again (should be ignored)
      await repo.vote("bot", messageId1, voter1, "option1");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId1), 1);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId1), {
        "option1": 1,
      });

      // Same voter votes for different option (multiple choice)
      await repo.vote("bot", messageId1, voter1, "option2");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId1), 1);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId1), {
        "option1": 1,
        "option2": 1,
      });

      // Different voter votes for same option
      await repo.vote("bot", messageId1, voter2, "option1");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId1), 2);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId1), {
        "option1": 2,
        "option2": 1,
      });

      // Third voter votes for new option
      await repo.vote("bot", messageId1, voter3, "option3");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId1), 3);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId1), {
        "option1": 2,
        "option2": 1,
        "option3": 1,
      });

      // Votes for different message should be separate
      await repo.vote("bot", messageId2, voter1, "optionA");
      await repo.vote("bot", messageId2, voter2, "optionB");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId2), 2);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId2), {
        "optionA": 1,
        "optionB": 1,
      });

      // Original message votes should remain unchanged
      assert.deepStrictEqual(await repo.countVoters("bot", messageId1), 3);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId1), {
        "option1": 2,
        "option2": 1,
        "option3": 1,
      });

      // Test with empty options (edge case)
      await repo.vote("bot", messageId1, voter1, "");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId1), 3);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId1), {
        "option1": 2,
        "option2": 1,
        "option3": 1,
        "": 1,
      });
    });
  });
}

function createNote(uuid: Uuid, actor: string): Create {
  return new Create({
    id: new URL(`https://example.com/ap/actor/${actor}/create/${uuid}`),
    actor: new URL(`https://example.com/ap/actor/${actor}`),
    to: new URL(`https://example.com/ap/actor/${actor}/followers`),
    cc: PUBLIC_COLLECTION,
    object: new Note({
      id: new URL(`https://example.com/ap/actor/${actor}/note/${uuid}`),
      attribution: new URL(`https://example.com/ap/actor/${actor}`),
      to: new URL(`https://example.com/ap/actor/${actor}/followers`),
      cc: PUBLIC_COLLECTION,
      content: "Hello, world!",
      published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
    }),
    published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
  });
}

for (const name in factories) {
  const factory = factories[name];

  describe(`${name}: bot isolation`, () => {
    test("key pairs are isolated by bot identifier", async () => {
      const repo = factory();
      await repo.setKeyPairs("botA", keyPairs);
      assert.deepStrictEqual(await repo.getKeyPairs("botB"), undefined);
      assert.deepStrictEqual(await repo.getKeyPairs("botA"), keyPairs);
    });

    test("messages are isolated by bot identifier", async () => {
      const repo = factory();
      const messageId: Uuid = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
      const message = createNote(messageId, "botA");
      await repo.addMessage("botA", messageId, message);
      assert.deepStrictEqual(
        await repo.getMessage("botB", messageId),
        undefined,
      );
      assert.deepStrictEqual(await repo.countMessages("botB"), 0);
      assert.deepStrictEqual(
        await Array.fromAsync(repo.getMessages("botB")),
        [],
      );
      assert.deepStrictEqual(await repo.countMessages("botA"), 1);
      assert.deepStrictEqual(
        await (await repo.getMessage("botA", messageId))?.toJsonLd(),
        await message.toJsonLd(),
      );

      // Removing through the wrong bot identifier must not delete the message:
      assert.deepStrictEqual(
        await repo.removeMessage("botB", messageId),
        undefined,
      );
      assert.deepStrictEqual(await repo.countMessages("botA"), 1);

      // Updating through the wrong bot identifier must not touch the message:
      let updaterCalled = false;
      const updated = await repo.updateMessage("botB", messageId, (message) => {
        updaterCalled = true;
        return message;
      });
      assert.deepStrictEqual(updated, false);
      assert.deepStrictEqual(updaterCalled, false);
    });

    test("followers are isolated by bot identifier", async () => {
      const repo = factory();
      const follower = new Person({
        id: new URL("https://example.com/ap/actor/john"),
        preferredUsername: "john",
      });
      const followId = new URL(
        "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0",
      );
      await repo.addFollower("botA", followId, follower);
      assert.deepStrictEqual(
        await repo.hasFollower("botB", follower.id!),
        false,
      );
      assert.deepStrictEqual(await repo.countFollowers("botB"), 0);
      assert.deepStrictEqual(
        await Array.fromAsync(repo.getFollowers("botB")),
        [],
      );
      assert.ok(await repo.hasFollower("botA", follower.id!));

      // Removing through the wrong bot identifier must not delete the follower:
      assert.deepStrictEqual(
        await repo.removeFollower("botB", followId, follower.id!),
        undefined,
      );
      assert.ok(await repo.hasFollower("botA", follower.id!));
    });

    test("sent follows are isolated by bot identifier", async () => {
      const repo = factory();
      const followUuid: Uuid = "03a395a2-353a-4894-afdb-2cab31a7b004";
      const follow = new Follow({
        id: new URL(`https://example.com/ap/actor/botA/follow/${followUuid}`),
        actor: new URL("https://example.com/ap/actor/botA"),
        object: new URL("https://example.com/ap/actor/john"),
      });
      await repo.addSentFollow("botA", followUuid, follow);
      assert.deepStrictEqual(
        await repo.getSentFollow("botB", followUuid),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.removeSentFollow("botB", followUuid),
        undefined,
      );
      assert.deepStrictEqual(
        await (await repo.getSentFollow("botA", followUuid))?.toJsonLd(),
        await follow.toJsonLd(),
      );
    });

    test("followees are isolated by bot identifier", async () => {
      const repo = factory();
      const followeeId = new URL("https://example.com/ap/actor/john");
      const follow = new Follow({
        id: new URL(
          "https://example.com/ap/actor/botA/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
        ),
        actor: new URL("https://example.com/ap/actor/botA"),
        object: followeeId,
      });
      await repo.addFollowee("botA", followeeId, follow);
      assert.deepStrictEqual(
        await repo.getFollowee("botB", followeeId),
        undefined,
      );
      assert.deepStrictEqual(
        await repo.removeFollowee("botB", followeeId),
        undefined,
      );
      assert.deepStrictEqual(
        await (await repo.getFollowee("botA", followeeId))?.toJsonLd(),
        await follow.toJsonLd(),
      );
    });

    test("poll votes are isolated by bot identifier", async () => {
      const repo = factory();
      const messageId: Uuid = "01945678-1234-7890-abcd-ef0123456789";
      const voter = new URL("https://example.com/ap/actor/alice");
      await repo.vote("botA", messageId, voter, "option1");
      assert.deepStrictEqual(await repo.countVoters("botB", messageId), 0);
      assert.deepStrictEqual(await repo.countVotes("botB", messageId), {});
      assert.deepStrictEqual(await repo.countVoters("botA", messageId), 1);
      assert.deepStrictEqual(await repo.countVotes("botA", messageId), {
        option1: 1,
      });
    });
  });

  describe(`${name}: findFollowedBots()`, () => {
    test("yields the identifiers of bots following the given actor", async () => {
      const repo = factory();
      const followeeId = new URL("https://example.com/ap/actor/john");
      const otherFolloweeId = new URL("https://example.com/ap/actor/jane");
      const followA = new Follow({
        id: new URL(
          "https://example.com/ap/actor/botA/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
        ),
        actor: new URL("https://example.com/ap/actor/botA"),
        object: followeeId,
      });
      const followB = new Follow({
        id: new URL(
          "https://example.com/ap/actor/botB/follow/e35ff5d8-ede9-4f5e-9b83-4bfcd4c9a69c",
        ),
        actor: new URL("https://example.com/ap/actor/botB"),
        object: followeeId,
      });

      assert.deepStrictEqual(
        await Array.fromAsync(repo.findFollowedBots(followeeId)),
        [],
      );

      await repo.addFollowee("botA", followeeId, followA);
      await repo.addFollowee("botB", followeeId, followB);
      const bots = await Array.fromAsync(repo.findFollowedBots(followeeId));
      bots.sort();
      assert.deepStrictEqual(bots, ["botA", "botB"]);
      assert.deepStrictEqual(
        await Array.fromAsync(repo.findFollowedBots(otherFolloweeId)),
        [],
      );

      // Adding the same followee twice must not duplicate the identifier:
      await repo.addFollowee("botA", followeeId, followA);
      const bots2 = await Array.fromAsync(repo.findFollowedBots(followeeId));
      bots2.sort();
      assert.deepStrictEqual(bots2, ["botA", "botB"]);

      await repo.removeFollowee("botA", followeeId);
      assert.deepStrictEqual(
        await Array.fromAsync(repo.findFollowedBots(followeeId)),
        ["botB"],
      );

      await repo.removeFollowee("botB", followeeId);
      assert.deepStrictEqual(
        await Array.fromAsync(repo.findFollowedBots(followeeId)),
        [],
      );
    });
  });

  describe(`${name}: forIdentifier()`, () => {
    test("returns a repository view scoped to the given identifier", async () => {
      const repo = factory();
      const scoped = repo.forIdentifier("botA");
      assert.deepStrictEqual(scoped.identifier, "botA");

      // Writes through the scoped view are visible through the root:
      const messageId: Uuid = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
      const message = createNote(messageId, "botA");
      await scoped.addMessage(messageId, message);
      assert.deepStrictEqual(
        await (await repo.getMessage("botA", messageId))?.toJsonLd(),
        await message.toJsonLd(),
      );
      assert.deepStrictEqual(
        await repo.getMessage("botB", messageId),
        undefined,
      );
      assert.deepStrictEqual(await scoped.countMessages(), 1);

      // Writes through the root are visible through the scoped view:
      const follower = new Person({
        id: new URL("https://example.com/ap/actor/john"),
        preferredUsername: "john",
      });
      const followId = new URL(
        "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0",
      );
      await repo.addFollower("botA", followId, follower);
      assert.ok(await scoped.hasFollower(follower.id!));
      assert.deepStrictEqual(await scoped.countFollowers(), 1);

      // Key pairs round-trip through the scoped view:
      await scoped.setKeyPairs(keyPairs);
      assert.deepStrictEqual(await scoped.getKeyPairs(), keyPairs);
      assert.deepStrictEqual(await repo.getKeyPairs("botA"), keyPairs);
      assert.deepStrictEqual(await repo.getKeyPairs("botB"), undefined);
    });
  });
}

describe("KvRepository.migrate()", () => {
  async function seedLegacyData(kv: MemoryKvStore): Promise<{
    messageId: Uuid;
    messageJson: unknown;
    followerId: URL;
    followRequestId: URL;
    followeeId: URL;
    followeeFollowJson: unknown;
    quoteAuthorizationRefId: URL;
    sentFollowId: Uuid;
    sentFollowJson: unknown;
  }> {
    // Simulates the key layout of BotKit 0.4 and earlier, which was not
    // scoped by bot identifiers.
    const messageId: Uuid = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
    const message = createNote(messageId, "bot");
    const messageJson = await message.toJsonLd({ format: "compact" });
    await kv.set(["_botkit", "messages"], [messageId]);
    await kv.set(["_botkit", "messages", messageId], messageJson);

    const keyPairsData = [];
    for (const pair of keyPairs) {
      keyPairsData.push({
        private: await exportJwk(pair.privateKey),
        public: await exportJwk(pair.publicKey),
      });
    }
    await kv.set(["_botkit", "keyPairs"], keyPairsData);

    const follower = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    });
    const followRequestId = new URL(
      "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0",
    );
    await kv.set(["_botkit", "followers"], [follower.id!.href]);
    await kv.set(
      ["_botkit", "followers", follower.id!.href],
      await follower.toJsonLd({ format: "compact" }),
    );
    await kv.set(
      ["_botkit", "followRequests", followRequestId.href],
      follower.id!.href,
    );

    const followeeId = new URL("https://example.com/ap/actor/jane");
    const followeeFollow = new Follow({
      id: new URL(
        "https://example.com/ap/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: followeeId,
    });
    const followeeFollowJson = await followeeFollow.toJsonLd({
      format: "compact",
    });
    await kv.set(["_botkit", "followees", followeeId.href], followeeFollowJson);

    const quoteAuthorizationRefId = new URL("https://example.com/stamps/1");
    await kv.set(
      ["_botkit", "quoteAuthorizationRefs", quoteAuthorizationRefId.href],
      messageId,
    );

    const sentFollowId: Uuid = "e35ff5d8-ede9-4f5e-9b83-4bfcd4c9a69c";
    const sentFollow = new Follow({
      id: new URL(`https://example.com/ap/follow/${sentFollowId}`),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new URL("https://example.com/ap/actor/joe"),
    });
    const sentFollowJson = await sentFollow.toJsonLd({ format: "compact" });
    await kv.set(["_botkit", "follows", sentFollowId], sentFollowJson);

    // Poll votes for the message:
    await kv.set(["_botkit", "polls", messageId], ["option1", "option2"]);
    await kv.set(["_botkit", "polls", messageId, "option1"], [
      "https://example.com/ap/actor/alice",
      "https://example.com/ap/actor/bob",
    ]);
    await kv.set(["_botkit", "polls", messageId, "option2"], [
      "https://example.com/ap/actor/alice",
    ]);

    return {
      messageId,
      messageJson,
      followerId: follower.id!,
      followRequestId,
      followeeId,
      followeeFollowJson,
      quoteAuthorizationRefId,
      sentFollowId,
      sentFollowJson,
    };
  }

  test("adopts legacy unscoped data", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new KvRepository(kv);

    await repo.migrate("bot");

    assert.deepStrictEqual(await repo.getKeyPairs("bot"), keyPairs);
    assert.deepStrictEqual(await repo.countMessages("bot"), 1);
    assert.deepStrictEqual(
      await (await repo.getMessage("bot", seed.messageId))?.toJsonLd({
        format: "compact",
      }),
      seed.messageJson,
    );
    assert.deepStrictEqual(
      (await Array.fromAsync(repo.getMessages("bot"))).length,
      1,
    );
    assert.ok(await repo.hasFollower("bot", seed.followerId));
    assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
    assert.deepStrictEqual(await repo.countVoters("bot", seed.messageId), 2);
    assert.deepStrictEqual(await repo.countVotes("bot", seed.messageId), {
      option1: 2,
      option2: 1,
    });

    // Data must belong to the migrated identifier only:
    assert.deepStrictEqual(await repo.getKeyPairs("other"), undefined);
    assert.deepStrictEqual(await repo.countMessages("other"), 0);

    // Legacy keys are kept (copy, not move), so a partially failed run can
    // be retried without data loss:
    assert.ok(await kv.get(["_botkit", "messages", seed.messageId]) != null);
  });

  test("is idempotent", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new KvRepository(kv);

    await repo.migrate("bot");
    await repo.migrate("bot");

    assert.deepStrictEqual(await repo.countMessages("bot"), 1);
    assert.deepStrictEqual(await repo.countFollowers("bot"), 1);

    // A migrated message that is removed afterwards must not reappear:
    await repo.removeMessage("bot", seed.messageId);
    await repo.migrate("bot");
    assert.deepStrictEqual(await repo.countMessages("bot"), 0);
  });

  test("does nothing without legacy data", async () => {
    const kv = new MemoryKvStore();
    const repo = new KvRepository(kv);
    await repo.migrate("bot");
    assert.deepStrictEqual(await repo.countMessages("bot"), 0);
    assert.deepStrictEqual(await repo.getKeyPairs("bot"), undefined);
  });

  test("does not clobber scoped data written before migration", async () => {
    const kv = new MemoryKvStore();
    await seedLegacyData(kv);
    const repo = new KvRepository(kv);
    await repo.setKeyPairs("bot", keyPairs.slice(0, 1));
    await repo.migrate("bot");
    assert.deepStrictEqual(await repo.getKeyPairs("bot"), [keyPairs[0]]);
  });

  test("migrates sent follows eagerly", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new KvRepository(kv);
    await repo.migrate("bot");

    const follow = await repo.getSentFollow("bot", seed.sentFollowId);
    assert.deepStrictEqual(
      await follow?.toJsonLd({ format: "compact" }),
      seed.sentFollowJson,
    );
    // Legacy keys are copied, not moved:
    assert.ok(
      await kv.get(["_botkit", "follows", seed.sentFollowId]) != null,
    );

    // The adoption applies only to the migrating identifier:
    const kv2 = new MemoryKvStore();
    const seed2 = await seedLegacyData(kv2);
    const repo2 = new KvRepository(kv2);
    await repo2.migrate("bot");
    assert.deepStrictEqual(
      await repo2.getSentFollow("other", seed2.sentFollowId),
      undefined,
    );
  });

  test("migrates followees eagerly with their reverse index", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new KvRepository(kv);
    await repo.migrate("bot");

    // The reverse index is populated by the migration itself, before any
    // followee is individually accessed, so timeline routing works right
    // after an upgrade:
    assert.deepStrictEqual(
      await Array.fromAsync(repo.findFollowedBots(seed.followeeId)),
      ["bot"],
    );
    const follow = await repo.getFollowee("bot", seed.followeeId);
    assert.deepStrictEqual(
      await follow?.toJsonLd({ format: "compact" }),
      seed.followeeFollowJson,
    );
  });

  test("migrates quote authorization references with their reverse index", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new KvRepository(kv);
    await repo.migrate("bot");

    assert.deepStrictEqual(
      await repo.findQuoteAuthorizationReference(
        "bot",
        seed.quoteAuthorizationRefId,
      ),
      seed.messageId,
    );
    assert.deepStrictEqual(
      await Array.fromAsync(
        repo.findQuoteAuthorizationReferenceIdentifiers(
          seed.quoteAuthorizationRefId,
        ),
      ),
      ["bot"],
    );
  });

  test("migrates follow requests eagerly", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new KvRepository(kv);
    await repo.migrate("bot");

    // removeFollower() consults the migrated follow request record:
    const removed = await repo.removeFollower(
      "bot",
      seed.followRequestId,
      seed.followerId,
    );
    assert.ok(removed != null);
    assert.deepStrictEqual(
      await repo.hasFollower("bot", seed.followerId),
      false,
    );
    assert.deepStrictEqual(await repo.countFollowers("bot"), 0);
  });

  test("migrates poll options named like lock keys", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    // Poll option names are user-controlled, so an option may collide with
    // the transient "lock" suffix used by the message/follower index lists:
    await kv.set(["_botkit", "polls", seed.messageId], ["lock", "open"]);
    await kv.set(
      ["_botkit", "polls", seed.messageId, "lock"],
      ["https://example.com/ap/actor/voter1"],
    );
    await kv.set(
      ["_botkit", "polls", seed.messageId, "open"],
      ["https://example.com/ap/actor/voter2"],
    );
    const repo = new KvRepository(kv);
    await repo.migrate("bot");

    assert.deepStrictEqual(await repo.countVotes("bot", seed.messageId), {
      lock: 1,
      open: 1,
    });
  });

  test("adopts legacy data for one identifier only", async () => {
    const kv = new MemoryKvStore();
    await seedLegacyData(kv);
    const repo = new KvRepository(kv);

    await repo.migrate("botA");
    // A later migration for another identifier must not adopt the same
    // legacy rows again; that would break cross-identifier isolation:
    await repo.migrate("botB");

    assert.deepStrictEqual(await repo.countMessages("botA"), 1);
    assert.deepStrictEqual(await repo.countMessages("botB"), 0);
    assert.deepStrictEqual(await repo.getKeyPairs("botB"), undefined);
    assert.deepStrictEqual(await repo.countFollowers("botB"), 0);
  });

  test("claims the legacy data atomically under concurrency", async () => {
    // Slows reads down so that two concurrent migrations overlap on the
    // missing-marker check; the CAS-backed claim must still admit only one:
    class SlowKvStore implements KvStore {
      readonly #inner = new MemoryKvStore();
      async get<T = unknown>(key: KvKey): Promise<T | undefined> {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return await this.#inner.get<T>(key);
      }
      set(key: KvKey, value: unknown): Promise<void> {
        return this.#inner.set(key, value);
      }
      delete(key: KvKey): Promise<void> {
        return this.#inner.delete(key);
      }
      cas(
        key: KvKey,
        expectedValue: unknown,
        newValue: unknown,
      ): Promise<boolean> {
        return this.#inner.cas!(key, expectedValue, newValue);
      }
      list(prefix?: KvKey): AsyncIterable<KvStoreListEntry> {
        return this.#inner.list(prefix);
      }
    }
    const kv = new SlowKvStore();
    // Seed legacy data through the inner store's interface:
    const messageId: Uuid = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
    const message = createNote(messageId, "bot");
    await kv.set(["_botkit", "messages"], [messageId]);
    await kv.set(
      ["_botkit", "messages", messageId],
      await message.toJsonLd({ format: "compact" }),
    );

    const repo = new KvRepository(kv);
    await Promise.all([repo.migrate("botA"), repo.migrate("botB")]);

    const counts = [
      await repo.countMessages("botA"),
      await repo.countMessages("botB"),
    ];
    counts.sort();
    // Exactly one identifier adopted the legacy data:
    assert.deepStrictEqual(counts, [0, 1]);
  });

  test("keeps the legacy data with the adopting identifier", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new KvRepository(kv);

    await repo.migrate("botA");
    await repo.migrate("botB");

    assert.deepStrictEqual(
      await repo.getSentFollow("botB", seed.sentFollowId),
      undefined,
    );
    assert.ok(await repo.getSentFollow("botA", seed.sentFollowId) != null);
  });

  test("forwards migration through MemoryCachedRepository", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new MemoryCachedRepository(new KvRepository(kv));

    await repo.migrate?.("bot");

    assert.deepStrictEqual(await repo.getKeyPairs("bot"), keyPairs);
    assert.deepStrictEqual(await repo.countMessages("bot"), 1);
    assert.ok(await repo.hasFollower("bot", seed.followerId));
    // Records keyed by UUIDs are migrated as well:
    assert.deepStrictEqual(
      await (await repo.getSentFollow("bot", seed.sentFollowId))?.toJsonLd({
        format: "compact",
      }),
      seed.sentFollowJson,
    );
  });

  test("does not expose legacy data before migrate() is called", async () => {
    const kv = new MemoryKvStore();
    const seed = await seedLegacyData(kv);
    const repo = new KvRepository(kv);
    assert.deepStrictEqual(
      await repo.getSentFollow("bot", seed.sentFollowId),
      undefined,
    );
  });
});

for (const [name, factory] of Object.entries(factories)) {
  test(`${name} successor is write-once and bot-scoped`, async (t) => {
    const repository = factory();
    const target = new URL("https://new.example/actor");
    assert.strictEqual(
      await repository.getSuccessor("old", t.signal),
      undefined,
    );
    const results = await Promise.all([
      repository.setSuccessor("old", target, t.signal),
      repository.setSuccessor(
        "old",
        new URL("https://other.example/actor"),
        t.signal,
      ),
    ]);
    assert.strictEqual(results.filter(Boolean).length, 1);
    const successor = await repository.getSuccessor("old", t.signal);
    assert.ok(successor);
    assert.ok(!await repository.setSuccessor("old", successor, t.signal));
    assert.strictEqual(await repository.getSuccessor("sibling"), undefined);
    const href = successor.href;
    successor.pathname = "/mutated";
    target.pathname = "/mutated";
    assert.strictEqual((await repository.getSuccessor("old"))?.href, href);
    const signal = AbortSignal.abort();
    await assert.rejects(repository.setSuccessor("sibling", target, signal), {
      name: "AbortError",
    });
    assert.strictEqual(await repository.getSuccessor("sibling"), undefined);
  });
}

test("MemoryCachedRepository observes successor changes through other views", async () => {
  const underlying = new MemoryRepository();
  const first = new MemoryCachedRepository(underlying);
  const second = new MemoryCachedRepository(underlying);
  assert.strictEqual(await first.getSuccessor("old"), undefined);
  const target = new URL("https://new.example/actor");
  assert.ok(await second.setSuccessor("old", target));
  assert.deepStrictEqual(await first.getSuccessor("old"), target);
  const scoped = first.forIdentifier("old");
  assert.deepStrictEqual(await scoped.getSuccessor(), target);
  assert.ok(!await scoped.setSuccessor(target));
});

test("KvRepository successor CAS coordinates independent views", async () => {
  const kv = new MemoryKvStore();
  const first = new KvRepository(kv);
  const second = new KvRepository(kv);
  const results = await Promise.all([
    first.setSuccessor("bot", new URL("https://new.example/first")),
    second.setSuccessor("bot", new URL("https://new.example/second")),
  ]);
  assert.strictEqual(results.filter(Boolean).length, 1);
  assert.deepStrictEqual(
    await first.getSuccessor("bot"),
    await second.getSuccessor("bot"),
  );
});

test("KvRepository successor fallback serializes within one non-CAS view", async () => {
  const kv = new Proxy(new MemoryKvStore(), {
    get(target, property, receiver) {
      if (property === "cas") return undefined;
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const repository = new KvRepository(kv);
  const results = await Promise.all([
    repository.setSuccessor("bot", new URL("https://new.example/first")),
    repository.setSuccessor("bot", new URL("https://new.example/second")),
  ]);
  assert.deepStrictEqual(results, [true, false]);
});
