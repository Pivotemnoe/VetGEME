# Host envelope for an external veterinary decision

The files in this directory are programmer-owned host contracts. They are not
part of the immutable author archive or its source provenance.

An external reviewer should copy `reviewer-decision-envelope-template.json`,
not the author archive's bare `source/reviewer-decision-template.json`. The host
template preserves every author field and adds `reviewPackage`, which binds the
decision to the exact P8 package, archive, provenance, and source aggregate.

Before import, replace every placeholder and provide an explicit decision for
each reviewed family, variant, or presentation. A family decision never covers
its children. `changes_required`, `rejected`, and `not_reviewed` each require a
matching domain result; `changes_required` also requires at least one issue ID.

This envelope does not grant veterinary approval, does not create an activation
manifest, and does not make any record runtime- or generator-eligible.
