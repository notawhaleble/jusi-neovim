# ADR 0010: Explicit browser profile selection and private buffers

Status: implemented; partial M4 acceptance.

Neovim owns the profile/private options of each presentation. JusiWebProfile changes
the default for future web opens and reports the current buffer separately; it never
moves an existing page between accounts. Configuration chooses the default on later
app starts. Names use the existing 1–64 ASCII alphanumeric/underscore/hyphen contract.

JusiWebPrivate opens a fresh in-memory partition derived from the presentation UUID,
independent of the selected persistent profile. Parking and navigation retain it;
a new private buffer gets another partition. Chromium may retain the old in-memory
session until process exit. Local files continue using the existing isolated local
partition, irrespective of profile/private settings.

The option passes through Lua, typed bridge metadata and presentation contracts.
The web backend selects the partition before guest attachment. Main admits the
private partition family while enforcing the same sandbox, navigation and permission
rules as persistent browsing. Documents receive no additional host API. A shell-owned
label identifies persistent, private or local storage scope.

Electron documents persistent partitions with the persist: prefix and in-memory
partitions without it in its [session API](https://www.electronjs.org/docs/latest/api/session).
The restart test uses the actual host commands and a stable loopback origin, with
an expiring HttpOnly login cookie plus localStorage. Two sequential app processes
share a disposable app-data directory; the test quits normally through Neovim and
does not explicitly flush storage. It proves fixture persistence and isolation,
not universal website/OAuth compatibility or session-cookie restoration.

Private browsing here concerns browser storage. It does not hide network identity,
erase Neovim registers or exported data, or guarantee erasure from process memory.
Profile clearing, permission revocation, OAuth and device/certificate flows remain
separate M4 work. No Chrome profile reuse, TLS relaxation or security-parity claim.
