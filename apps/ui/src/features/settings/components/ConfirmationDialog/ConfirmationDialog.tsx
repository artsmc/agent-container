'use client';

import { useRef, useEffect } from 'react';
import styles from './ConfirmationDialog.module.scss';

export interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming?: boolean;
}

/**
 * ConfirmationDialog -- modal dialog for destructive action confirmation.
 *
 * Uses the native <dialog> element for accessibility. The Cancel button
 * receives autoFocus to prevent accidental destructive actions on Enter.
 */
export function ConfirmationDialog({
  isOpen,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isConfirming = false,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCancel();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-body"
      data-testid="confirmation-dialog"
    >
      <div className={styles.content}>
        <h2 id="confirmation-dialog-title" className={styles.title}>
          {title}
        </h2>
        <p id="confirmation-dialog-body" className={styles.body}>
          {body}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isConfirming}
            autoFocus
            data-testid="confirmation-cancel"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={onConfirm}
            disabled={isConfirming}
            data-testid="confirmation-confirm"
          >
            {isConfirming && (
              <span className={styles.spinner} aria-hidden="true" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
