# Extra certificate authorities

This directory is mounted read-only at `/etc/planeo-ca` in the services that make
outbound TLS calls. Point `NODE_EXTRA_CA_CERTS` at a file here to have Node trust
that root in addition to its built-in bundle.

```bash
# .env
NODE_EXTRA_CA_CERTS=/etc/planeo-ca/tls-inspection-root.crt
```

Leave `NODE_EXTRA_CA_CERTS` empty and nothing changes.

## Why this exists

Networks that inspect TLS terminate the connection and re-sign it with their own
root. Node does not trust that root, so outbound HTTPS fails with
`SELF_SIGNED_CERT_IN_CHAIN` and email never leaves the queue.

`tls-inspection-root.crt` is the root this network presents, exported from the
machine's own trust store where it was already installed. It is a public
certificate, not a secret, and it is specific to this environment. On a network
that does not inspect TLS, delete it and clear `NODE_EXTRA_CA_CERTS`. On a
different corporate network, replace it with that network's root.

Adding a root here extends trust. It never disables verification, so a
certificate this root did not sign is still rejected. Do not set
`NODE_TLS_REJECT_UNAUTHORIZED=0` as a substitute: that turns verification off
entirely and accepts any certificate from anyone.

## Replacing it

Find the root your network presents, then export it from the system trust store
rather than from the connection itself, so you are copying a certificate you
already decided to trust:

```powershell
Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match '<issuer name>' }
```
