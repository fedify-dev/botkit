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
import type {
  CircuitBreakerOptions,
  InboxChallengePolicy,
} from "@fedify/fedify/federation";
import type { HttpMessageSignaturesSpec } from "@fedify/fedify/sig";
import type { MeterProvider, TracerProvider } from "@opentelemetry/api";

export type {
  CircuitBreakerOptions,
  HttpMessageSignaturesSpec,
  InboxChallengePolicy,
};

/**
 * Selected Fedify infrastructure options exposed by BotKit.
 *
 * BotKit continues to manage the federation's key–value store, message queue,
 * and user agent.  Other Fedify options are not available through this
 * interface unless BotKit explicitly adopts them.
 * @since 0.6.0
 */
export interface FederationInfrastructureOptions {
  /**
   * Whether the document loader can fetch private network addresses.
   *
   * This is mainly useful for tests that communicate with a local server.
   * Enabling it in production disables an important SSRF protection.
   * @default `false`
   * @since 0.6.0
   */
  readonly allowPrivateAddress?: boolean;

  /**
   * The circuit breaker for queued outbound activity delivery.  Set this to
   * `false` to disable the circuit breaker.
   * @since 0.6.0
   */
  readonly circuitBreaker?: false | CircuitBreakerOptions;

  /**
   * The OpenTelemetry tracer provider for federation operations.  If omitted,
   * the global tracer provider is used.
   * @since 0.6.0
   */
  readonly tracerProvider?: TracerProvider;

  /**
   * The OpenTelemetry meter provider for federation metrics.  If omitted, the
   * global meter provider is used.
   * @since 0.6.0
   */
  readonly meterProvider?: MeterProvider;

  /**
   * The HTTP Signatures specification to try first when communicating with an
   * unknown server.
   * @default `"rfc9421"`
   * @since 0.6.0
   */
  readonly firstKnock?: HttpMessageSignaturesSpec;

  /**
   * The policy for including `Accept-Signature` challenges in inbox `401`
   * responses.
   * @since 0.6.0
   */
  readonly inboxChallengePolicy?: InboxChallengePolicy;
}
