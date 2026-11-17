# ADR 0052: Provider source snapshots and MIME discovery

Status: implemented; verification recorded in STATUS.

Installed providers optionally declare media_types. Notebook core can choose a
compatible provider and stage transferred content on the frontend without naming
reader implementations. The host records immutable document identities for reuse
and optionally reports open readiness to its trusted caller.

source.snapshot is a negotiated worker capability, separate from text.extract.
The trusted caller captures a host ticket; the worker captures the corresponding
source before doing asynchronous extraction/rendering. Accepted work cannot be
retargeted by navigation. A host-issued private directory carries binary files
between local processes; bounded JSON carries descriptors only. The runtime
validates tickets, safe names, sizes and regular files. Each result has explicit
release ownership, and close/cancel/timeout prevents late callbacks from publishing
content. Document scripts never see staging paths or host IPC.

This adds no Electron API or renderer behavior. PDF/DjVu implementation remains
in their independent repositories. Notebook core owns remote HTTP transfer,
submission correlation, managed explanation lifetime and assistant integration.
