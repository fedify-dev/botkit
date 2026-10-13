 -  Upgraded Fedify to 2.1.30, which fixes the following security
    vulnerabilities:

     -  Inboxes accepted signed activities whose IDs had a different origin
        from their actors, so such an activity could supply embedded objects
        that were trusted as authentic or reserve the idempotency entry of
        the genuine activity.  [[GHSA-4qhx-hhwf-8685]]

     -  Key ownership checks accepted another actor's document when
        resolving an actor ID, so an attacker whose actor document was
        reached through a victim's actor ID could sign activities that passed
        authentication as the victim.  As a consequence, an actor whose ID
        redirects to a document with a different `id` can no longer have its
        keys confirmed through that redirect, and keys cached by the built-in
        key cache are fetched and verified again after upgrading.
        [[GHSA-8863-8468-7hq7]]

[GHSA-4qhx-hhwf-8685]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-4qhx-hhwf-8685
[GHSA-8863-8468-7hq7]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-8863-8468-7hq7
