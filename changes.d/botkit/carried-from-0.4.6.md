 -  Upgraded Fedify to 2.3.5, which addresses two security vulnerabilities:
     -  Fixed an SSRF vulnerability in authenticated document loaders where
        public document URLs could redirect signed requests to loopback,
        link-local, or private addresses.  [[CVE-2026-77632]]
     -  Prevented remote actors from causing unbounded circuit-breaker state
        growth through failed deliveries, which could eventually exhaust
        storage or memory.  [[CVE-2026-69132]]

[CVE-2026-77632]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-cxc3-7q96-6cpx
[CVE-2026-69132]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-fx98-wc5v-jrg5
