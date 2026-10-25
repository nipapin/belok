# FirstVDS deployment

GitHub Actions builds on Linux and streams a standalone release over SSH to
`deployer@213.159.215.179`. Each repository has its own restricted SSH key.
The receiver permits deployment only for that key's project; root SSH is disabled.
Production secrets and uploaded files remain outside release archives.

The receiver starts a candidate on a separate local port and checks readiness
before switching this application's process. A failed activation restores its
previous process. Database migrations, when present, require backward-compatible
changes and are not automatically reversed.

Exactly two successful release directories are retained: current and previous.
Failed releases and uploaded temporary archives are removed immediately. Cleanup
validates real paths and never deletes environment files or shared uploads.

Server receiver: `/usr/local/lib/firstvds-receiver.py`.
Root-owned settings: `/etc/firstvds-deploy/projects.json`.
Root-owned PM2 configs: `/etc/firstvds-deploy/<project>.config.json`.
Workflow settings: FIRSTVDS_DEPLOY_ENABLED, FIRSTVDS_HOST,
FIRSTVDS_KNOWN_HOSTS and secret FIRSTVDS_DEPLOY_KEY.

Until DNS cutover, production background jobs remain disabled on the copy.
Before changing DNS, synchronize databases and uploads once more, stop the old
workers, then enable the new workers. Existing servers remain unchanged.

The receiver source is versioned in `deploy/firstvds-receiver.py`; updating it in
Git alone does not install it on the server. Run its tests before installing a
new version as root. Application archives cannot replace the receiver itself.
