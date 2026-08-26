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
import { MemoryKvStore } from "@fedify/fedify/federation";
import {
  type MeterProvider,
  metrics,
  trace,
  type TracerProvider,
} from "@opentelemetry/api";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type CircuitBreakerOptions,
  createBot,
  createInstance,
  type FederationInfrastructureOptions,
  type HttpMessageSignaturesSpec,
  type InboxChallengePolicy,
} from "./mod.ts";

const globalTracerProvider = trace.getTracerProvider();
const tracerProvider: TracerProvider = {
  getTracer(name, version, options) {
    return globalTracerProvider.getTracer(name, version, options);
  },
};
const globalMeterProvider = metrics.getMeterProvider();
const meterProvider: MeterProvider = {
  getMeter(name, version, options) {
    return globalMeterProvider.getMeter(name, version, options);
  },
};
const circuitBreaker: CircuitBreakerOptions = { failureThreshold: 5 };
const firstKnock: HttpMessageSignaturesSpec = "draft-cavage-http-signatures-12";
const inboxChallengePolicy: InboxChallengePolicy = {
  enabled: true,
  requestNonce: true,
};
const federationOptions = {
  allowPrivateAddress: true,
  circuitBreaker,
  tracerProvider,
  meterProvider,
  firstKnock,
  inboxChallengePolicy,
} satisfies FederationInfrastructureOptions;

const unsupportedFederationOptions = {
  // @ts-expect-error: Queue lifecycle is not exposed as a raw Fedify option.
  manuallyStartQueue: true,
} satisfies FederationInfrastructureOptions;
void unsupportedFederationOptions;

describe("federationOptions", () => {
  test("passes telemetry providers through createInstance()", () => {
    const instance = createInstance({
      kv: new MemoryKvStore(),
      federationOptions,
    });
    const context = instance.federation.createContext(
      new URL("https://example.com/"),
    );

    assert.strictEqual(context.tracerProvider, tracerProvider);
    assert.strictEqual(context.meterProvider, meterProvider);
  });

  test("drops unsupported Fedify options at runtime", () => {
    const optionsWithUnsupportedProperty = {
      allowPrivateAddress: false,
      get manuallyStartQueue(): boolean {
        assert.fail("Unsupported options must not be read.");
        return false;
      },
    };
    const federationOptions: FederationInfrastructureOptions =
      optionsWithUnsupportedProperty;

    assert.doesNotThrow(() =>
      createInstance({
        kv: new MemoryKvStore(),
        federationOptions,
      })
    );
  });

  test("allows private addresses through createBot() when enabled", async () => {
    const actorUrl = "http://127.0.0.1:1/actor";
    const defaultBot = createBot({
      username: "default",
      kv: new MemoryKvStore(),
    });
    const privateAddressBot = createBot({
      username: "private",
      kv: new MemoryKvStore(),
      federationOptions,
    });
    const defaultContext = defaultBot.federation.createContext(
      new URL("https://example.com/"),
    );
    const privateAddressContext = privateAddressBot.federation.createContext(
      new URL("https://example.com/"),
    );

    await assert.rejects(
      defaultContext.documentLoader(actorUrl),
      /private address/i,
    );
    await assert.rejects(
      privateAddressContext.documentLoader(actorUrl),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(!/private address/i.test(error.message));
        return true;
      },
    );
  });
});
