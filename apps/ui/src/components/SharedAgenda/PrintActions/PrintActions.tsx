'use client';

import styles from './PrintActions.module.scss';

export function PrintActions() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={styles.printActions} data-testid="print-actions">
      <button
        className={styles.printButton}
        onClick={handlePrint}
        type="button"
        aria-label="Print this agenda"
        data-testid="print-button"
      >
        Print
      </button>
      <button
        className={styles.downloadButton}
        onClick={handlePrint}
        type="button"
        aria-label="Download this agenda as PDF"
        data-testid="download-pdf-button"
      >
        Download as PDF
      </button>
    </div>
  );
}
