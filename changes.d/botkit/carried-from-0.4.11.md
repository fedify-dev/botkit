 -  Upgraded Fedify to 2.3.15, which fixes a security vulnerability where DNS
    rebinding bypassed the SSRF protection in document loading, outbound
    activity delivery, and NodeInfo queries.  Because the hostname was
    resolved once to check that it was public and again to connect, an
    attacker could reach internal services with a hostname that answered
    with a public address for the check and a private one for the
    connection.  On Node.js and Bun, connections are now made only to the
    addresses that passed the check; Bun deployments behind an HTTP proxy
    should use Bun 1.4.3 or later, and Bun versions before 1.3.11 can no
    longer reach HTTPS servers on non-default ports.  On Deno, `fetch()`
    offers no way to choose the addresses it connects to, so Deno
    deployments must also run Deno 2.8.1 or later with `--deny-net`
    covering private IPv4 ranges, `[::1]`, and `[::]`, listen on a Unix
    domain socket, and block IPv6 private ranges at the network layer.
    [[GHSA-r48c-xx2h-fv4g]]

[GHSA-r48c-xx2h-fv4g]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-r48c-xx2h-fv4g
