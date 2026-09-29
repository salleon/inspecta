// Which branch this build came from: set by vite.config from GitHub Actions'
// GITHUB_REF_NAME, empty for a local build. Anything built from a branch
// other than main (e.g. "test") is a test version, and says so on the splash
// and in Settings, so it's never mistaken for the one the team uses.
declare const __BUILD_BRANCH__: string;

export const BUILD_BRANCH: string = __BUILD_BRANCH__;
export const IS_TEST_BUILD = BUILD_BRANCH !== "" && BUILD_BRANCH !== "main" && BUILD_BRANCH !== "master";
