/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as calendar from "../calendar.js";
import type * as crons from "../crons.js";
import type * as cycles from "../cycles.js";
import type * as dev from "../dev.js";
import type * as devices from "../devices.js";
import type * as email from "../email.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as lib_cycleMath from "../lib/cycleMath.js";
import type * as lib_paymentStateMachine from "../lib/paymentStateMachine.js";
import type * as lib_roundMath from "../lib/roundMath.js";
import type * as lib_scheduleMath from "../lib/scheduleMath.js";
import type * as memberships from "../memberships.js";
import type * as otp from "../otp.js";
import type * as paymentRecords from "../paymentRecords.js";
import type * as push from "../push.js";
import type * as rounds from "../rounds.js";
import type * as users from "../users.js";
import type * as ussdContent from "../ussdContent.js";
import type * as utils_activity from "../utils/activity.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_phone from "../utils/phone.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  calendar: typeof calendar;
  crons: typeof crons;
  cycles: typeof cycles;
  dev: typeof dev;
  devices: typeof devices;
  email: typeof email;
  groups: typeof groups;
  http: typeof http;
  "lib/cycleMath": typeof lib_cycleMath;
  "lib/paymentStateMachine": typeof lib_paymentStateMachine;
  "lib/roundMath": typeof lib_roundMath;
  "lib/scheduleMath": typeof lib_scheduleMath;
  memberships: typeof memberships;
  otp: typeof otp;
  paymentRecords: typeof paymentRecords;
  push: typeof push;
  rounds: typeof rounds;
  users: typeof users;
  ussdContent: typeof ussdContent;
  "utils/activity": typeof utils_activity;
  "utils/auth": typeof utils_auth;
  "utils/phone": typeof utils_phone;
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
