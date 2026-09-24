import styles from './system.module.css';

/**
 * The siddur library behind Source changes is regenerated from shireishabbat every Monday and arrives
 * as a pull request, so "refresh now" is that workflow's own Run button rather than a control here:
 * nothing in the product should be able to rewrite the library. It moved here from /setup, which is
 * now each operator's install flow; System is where Daniel uses it. CRC only.
 */
export default function SiddurLibraryCard() {
  return <section className={styles.libraryCard}>
    <h2>Siddur library</h2>
    <p>The library behind Source changes is rebuilt from shireishabbat every Monday. A pull request appears only when the library or the moments table actually changed; merging it feeds the source-review inbox and publishes nothing.</p>
    <a href="https://github.com/RavBogard/crc-overlays/actions/workflows/siddur-library.yml" target="_blank" rel="noreferrer noopener">Refresh now on GitHub</a>
    <p>Run workflow → leave Dry run off.</p>
  </section>;
}
