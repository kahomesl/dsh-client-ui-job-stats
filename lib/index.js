/**
 * Node half of the background-job statistics plugin.
 *
 * Every contribution lives in the browser half (`client/client.js`); this entry
 * exists so the package appears as an ordinary Loader row, which is also what
 * makes `dsh-client-modules` publish the client bundle.
 * @module dsh-client-ui-job-stats
 */

/** Loader-visible no-op body; the browser half carries the feature. */
export function apply() {}
