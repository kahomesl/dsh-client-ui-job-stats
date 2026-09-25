/**
 * Node half of the background-job statistics plugin.
 *
 * This entry exists so the package appears as an ordinary Loader row — a bare
 * package specifier is what makes `@deepseek-ai/dsh-client-modules` publish the
 * browser half. The feature's Host side is the sibling row
 * `dsh-client-ui-job-stats/recorder`, which records job outcomes for the panel.
 * @module dsh-client-ui-job-stats
 */

/** Loader-visible no-op body; the browser half and the recorder carry the feature. */
export function apply() {}
