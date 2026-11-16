import type { Parser } from "../types";
import { beeperParsers } from "./beeper";
import { chatgptParser } from "./chatgpt";
import { claudeParser } from "./claude";
import { csvParser } from "./csv";
import { discordParser } from "./discord";
import { imessageParser } from "./imessage";
import { imessageExporterParser } from "./imessageExporter";
import { instagramParser, messengerParser } from "./meta";
import { snapchatParser } from "./snapchat";
import { telegramParser } from "./telegram";
import { textrovertParser } from "./textrovert";
import { whatsappParser } from "./whatsapp";

/** Each file goes to the first parser that claims it, so specific formats come before the generic CSV fallback. */
export const parsers: Parser[] = [
  textrovertParser,
  ...beeperParsers,
  imessageExporterParser,
  whatsappParser,
  imessageParser,
  instagramParser,
  messengerParser,
  snapchatParser,
  discordParser,
  telegramParser,
  chatgptParser,
  claudeParser,
  csvParser,
];
