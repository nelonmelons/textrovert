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

Open the app and follow its three steps:

1. **Allow access to Messages.** macOS only lets apps read `~/Library/Messages` with Full Disk Access. The app opens the right settings page and says what to turn on. Every build is signed ad hoc, so after a rebuild you may need to remove Textrovert from that list and add it again.
2. **Upload your messages.** The first upload creates an account and keeps its key in your login keychain (**Copy Account Key** copies it). The export goes to a private temporary folder, is zipped and uploaded, and is deleted as soon as the upload ends. Uploading again only adds messages that are new.
3. **Search your messages.** Full-text search over everything stored for the account, to check what came through.

The app uses the dev deployment. To point it at another one, run `defaults write com.textrovert.mac backend https://<deployment>.convex.cloud`. That deployment has to run a `packages/history` that includes the imessage-exporter parser, or processing fails with "No chats found".

## Without the window

`mac/build/textrovert-upload` runs the same export and upload from a terminal, which then needs Full Disk Access itself:

```sh
mac/build/textrovert-upload --backend https://<deployment>.convex.cloud --owner-key <key>   # or --new for a new account
```

`--db <chat.db>` exports another database (useful for testing), `--contacts <path>` sets the contacts database imessage-exporter uses to name people, and `--search <query>` searches the account once the upload is done.

## License

imessage-exporter is GPL-3.0. The app runs it as a separate program and ships its license in `Contents/Resources`.
