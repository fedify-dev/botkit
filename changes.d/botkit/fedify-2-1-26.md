 -  Upgraded Fedify to 2.1.26, which fixes a security vulnerability where
    `Context.routeActivity()` verified a dereferenced copy of an activity but
    routed the caller's unauthenticated original, so an application with an
    inbox queue or with forwarding enabled could process an activity whose
    actor, object, and addressing were chosen by an attacker as long as its
    `id` matched that of a genuine activity.
    [[GHSA-39gj-rchc-q5m3]]

[GHSA-39gj-rchc-q5m3]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-39gj-rchc-q5m3
