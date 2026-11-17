# Private certificate authorities

For corporate HTTPS environments, install the organization's root CA in the
platform trust store used by Chromium. Jusi uses Chromium's normal TLS verifier
for both browser adapters. There is no Jusi CA-bundle setting or certificate
exception command. A CA import in Chrome's own settings is not proof that it is
also present in the platform store.

Trust persists outside Jusi and applies to other applications using that store,
including all Jusi profiles and private browser sessions. `JusiWebClear` does not
remove it. Use the public CA certificate supplied by your organization (usually
PEM/CRT/CER); this flow does not require a private key or a client identity.

## macOS

1. Open **Keychain Access** and select the **login** keychain (or the managed
   System keychain specified by your organization).
2. Import the CA certificate with **File → Import Items**. If it is already
   installed, use that existing entry.
3. Open the certificate, expand **Trust**, and set **Secure Sockets Layer (SSL)**
   to **Always Trust**. Confirm the change through macOS if prompted.
4. Fully quit and reopen Jusi, then open the corporate HTTPS URL.

Importing a certificate and assigning trust are separate steps. Cancel the import
or trust prompt to leave that operation unapplied. To remove your addition, delete
that exact certificate from the selected keychain; to keep it installed but undo
its explicit trust, restore its previous SSL trust setting. Restart Jusi afterward.
For managed certificates, use your organization's management process.

Apple documents [certificate import](https://support.apple.com/guide/keychain-access/add-certificates-to-a-keychain-kyca2431/mac)
and [trust settings](https://support.apple.com/guide/keychain-access/change-the-trust-settings-of-a-certificate-kyca11871/mac).

## Linux

Chromium uses the user's NSS shared certificate database. Since M146 the default is `~/.local/share/pki/nssdb`; an existing `~/.pki/nssdb`
takes precedence. Install `libnss3-tools` on Debian/Ubuntu, or `nss-tools` on Fedora, for `certutil`.

Close Jusi. Select and list the database:

```sh
if [ -d "$HOME/.pki/nssdb" ]; then
  jusi_ca_db="$HOME/.pki/nssdb"
else
  jusi_ca_db="$HOME/.local/share/pki/nssdb"
fi
certutil -d "sql:$jusi_ca_db" -L
```

If no database exists, initialize it with `mkdir -p
"$jusi_ca_db"` and `certutil -d "sql:$jusi_ca_db" -N`.
Resolve existing-database errors before importing.

Import with an unused nickname and your file path:

```sh
certutil -d "sql:$jusi_ca_db" -A -t 'C,,' \
  -n 'Corporate Development Root' -i '/absolute/path/corporate-root.crt'
certutil -d "sql:$jusi_ca_db" -L -n 'Corporate Development Root'
```

`C,,` trusts this CA for TLS server certificates. Add a required intermediate
with its own nickname and `-t ',,'`, rather than making it another trust anchor.
Restart Jusi to test. Remove your addition by nickname:

```sh
certutil -d "sql:$jusi_ca_db" -D -n 'Corporate Development Root'
```

Restart after removal. CLI import has no confirmation prompt. See Chromium's
[Linux certificate management guide](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md).

## Checking the result

Open the actual HTTPS hostname covered by the server certificate. The CA must
chain to that server, and hostname, validity dates and server-authentication usage
must still validate. A missing intermediate should be corrected in the server's
served chain. Importing the CA does not repair an expired or wrong-host certificate.

If it still fails, record the platform, Jusi/Electron version, and exact `ERR_CERT_*`
error. DevTools (`:JusiWebDevTools`) can help inspect loading failures. Trust-store
selection and browser restart should be checked before changing the server.

These are upstream platform procedures, not completed Jusi platform acceptance.
The corporate endpoint and import/removal flow have not yet been exercised here.
