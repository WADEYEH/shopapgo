Apple Pay domain verification
=============================
Put the file downloaded from Airwallex (Payments > Settings > Apple Pay > Add domain)
in this folder, named exactly:

  apple-developer-merchantid-domain-association

The Worker serves it at
  https://<your-domain>/.well-known/apple-developer-merchantid-domain-association
with content-type application/octet-stream. See docs/commerce.md ("Apple Pay domain").
The file is a public verification token (not a secret). This README is not served at
the well-known path.
