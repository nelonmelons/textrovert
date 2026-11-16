# Textrovert for Mac

Exports your iMessage history with [imessage-exporter](https://github.com/ReagentX/imessage-exporter) and saves it as one file for the Textrovert iPhone app, which turns it into texting stats and a Wrapped for each of your top people.

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
2. **Save your messages for iPhone.** The app exports every conversation to a private temporary folder, converts it into `Textrovert Messages.textrovert` in your Downloads folder, deletes the temporary folder, and opens AirDrop. Nothing is uploaded.
3. **Open them on your iPhone.** Accept the AirDrop and choose Textrovert. If you sent the file another way, save it to Files and tap **Import messages file** on the Today screen.

The file is JSON: every chat with its title, whether it is a group, the other people in it, and its messages oldest first. Each message has `t` (seconds since 1970), `from` (left out for yours), `text`, `kind` (left out for text; otherwise photo, video, gif, audio, sticker, location, contact, file, deleted or system) and `reactions` (tapbacks as `[sender, emoji]`). `Sources/TextrovertCore/MessagesFile.swift` writes it, reading imessage-exporter's text output the same way the backend's `packages/history/pipeline/parsers/imessageExporter.ts` does.

## Without the window

`mac/build/textrovert-upload` runs the same export from a terminal, which then needs Full Disk Access itself:

```sh
mac/build/textrovert-upload --save ~/Downloads/messages.textrovert
```

It can also upload the export to a backend deployment instead, to test ingestion and search there:

```sh
mac/build/textrovert-upload --backend https://<deployment>.convex.cloud --owner-key <key>   # or --new for a new account
```

That deployment has to run a `packages/history` that includes the imessage-exporter parser. `--db <chat.db>` exports another database (useful for testing), `--contacts <path>` sets the contacts database imessage-exporter uses to name people, and `--search <query>` searches the account once the upload is done.

## License

imessage-exporter is GPL-3.0. The app runs it as a separate program and ships its license in `Contents/Resources`.
