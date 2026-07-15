# Future staging profile

This profile is intentionally disabled and is not a deployment instruction.
It exists only to keep the local image and a future TLS reverse proxy compatible.

Before any staging run, the project owner must approve a domain and server. Then:

1. replace `stage.example.invalid` in `proxy.conf` with the approved host;
2. place that host's certificate and private key in the ignored `certs/` directory;
3. keep `VETGEME_STAGE_BIND=127.0.0.1` until the host firewall and access policy are ready;
4. validate the combined configuration explicitly;
5. start only the `staging` profile after the image has passed the local acceptance gate.

Example configuration check (it does not start containers):

```bash
docker compose -f compose.yaml -f docker/staging/compose.staging.yaml config --quiet
```

The profile contains no credentials, domain ownership, deployment automation, API or
database. Production remains a separate owner-approved operation. Rollback switches
`VETGEME_IMAGE_TAG` to a previously verified commit tag; localStorage has no server-side
migration.
