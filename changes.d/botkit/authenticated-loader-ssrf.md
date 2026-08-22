 -  Upgraded Fedify to 2.1.21, which fixes an SSRF vulnerability in
    authenticated document loaders where public document URLs could redirect
    signed requests to loopback, link-local, or private addresses.
    [[CVE-2026-77632]]

[CVE-2026-77632]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-cxc3-7q96-6cpx
