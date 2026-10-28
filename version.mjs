// Chicla app version. Single source: "version" in the root package.json (D13).
// Line 3 below is the app leg of the status/changelog fingerprint; scripts/bump-round.mjs rewrites it.
// STATUS_FILE_FINGERPRINT: seq=281 file=CHICLA_PROJECT_STATUS-281.md app_sha256_12=065d37032ef1 changelog_sha256_12=34041d1484b2 (bump-round.mjs: app hash unchanged, changelog hash recomputed; round 276: release 0.1.1)
import { readFileSync } from "node:fs";
export const APP_VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
