/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as lib_paymentStateMachine from "../lib/paymentStateMachine.js";
import type * as memberships from "../memberships.js";
import type * as users from "../users.js";
import type * as utils_activity from "../utils/activity.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_phone from "../utils/phone.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  groups: typeof groups;
  http: typeof http;
  "lib/paymentStateMachine": typeof lib_paymentStateMachine;
  memberships: typeof memberships;
  users: typeof users;
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
