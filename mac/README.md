# Textrovert for Mac

Exports your iMessage history with [imessage-exporter](https://github.com/ReagentX/imessage-exporter) and uploads it to the Textrovert backend, where it is stored, deduplicated and searchable like any other export.

## Build

Needs only the Command Line Tools (`xcode-select --install`), not Xcode.

```sh
mac/build.sh
open mac/build/Textrovert.app
```

The build downloads imessage-exporter 5.0.1 for your Mac's chip, checks it against a pinned SHA-256, and puts it inside the app. To move to a newer release, update `EXPORTER_VERSION` and both checksums in `build.sh` (each release asset's digest on GitHub).

## Using it

1. **Full Disk Access.** macOS only lets apps read `~/Library/Messages` with it. Click *Open Full Disk Access Settings*, turn on Textrovert (or add it with +), then quit and reopen the app. Every build is signed ad hoc, so after a rebuild you may need to remove Textrovert from that list and add it again.
2. **Account.** The backend defaults to the dev deployment; point it at any `https://<deployment>.convex.cloud`. Create an account or paste an existing account key. The key is kept in your login keychain.
3. **Export and upload.** The export goes to a private temporary folder, is zipped and uploaded, and is deleted as soon as the upload ends. Uploading again only adds messages that are new.

The deployment has to run a `packages/history` that includes the imessage-exporter parser, or processing fails with "No chats found".

## Without the window

`mac/build/textrovert-upload` runs the same export and upload from a terminal, which then needs Full Disk Access itself:

```sh
mac/build/textrovert-upload --backend https://<deployment>.convex.cloud --owner-key <key>   # or --new for a new account
```

`--db <chat.db>` exports another database (useful for testing), and `--contacts <path>` sets the contacts database imessage-exporter uses to name people.

## License

imessage-exporter is GPL-3.0. The app runs it as a separate program and ships its license in `Contents/Resources`.
