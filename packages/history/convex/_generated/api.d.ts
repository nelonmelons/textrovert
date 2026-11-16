/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as assistant from "../assistant.js";
import type * as commonGround from "../commonGround.js";
import type * as conversations from "../conversations.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as ingestData from "../ingestData.js";
import type * as insights from "../insights.js";
import type * as interests from "../interests.js";
import type * as lib_matching from "../lib/matching.js";
import type * as lib_owner from "../lib/owner.js";
import type * as matches from "../matches.js";
import type * as messageStore from "../messageStore.js";
import type * as messages from "../messages.js";
import type * as owners from "../owners.js";
import type * as people from "../people.js";
import type * as uploads from "../uploads.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  assistant: typeof assistant;
  commonGround: typeof commonGround;
  conversations: typeof conversations;
  health: typeof health;
  http: typeof http;
  ingest: typeof ingest;
  ingestData: typeof ingestData;
  insights: typeof insights;
  interests: typeof interests;
  "lib/matching": typeof lib_matching;
  "lib/owner": typeof lib_owner;
  matches: typeof matches;
  messageStore: typeof messageStore;
  messages: typeof messages;
  owners: typeof owners;
  people: typeof people;
  uploads: typeof uploads;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
