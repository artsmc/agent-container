'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EmailConfig } from '../../types';
import { fetchEmailConfig, saveEmailConfig } from '../../hooks/use-settings-api';
import styles from './EmailConfigTab.module.scss';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

/**
 * EmailConfigForm -- sender identity configuration form.
 *
 * Fetches current config on mount and validates email format before saving.
 */
export function EmailConfigForm() {
  const [config, setConfig] = useState<EmailConfig>({
    senderName: '',
    senderAddress: '',
    replyToAddress: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validation, setValidation] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchEmailConfig();
        if (!cancelled) setConfig(data);
      } catch {
        if (!cancelled) setError('Failed to load email configuration.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);

      const errors: Record<string, string> = {};
      if (!config.senderName.trim()) {
        errors.senderName = 'Sender name is required.';
      }
      if (!config.senderAddress.trim()) {
        errors.senderAddress = 'Sender address is required.';
      } else if (!validateEmail(config.senderAddress)) {
        errors.senderAddress = 'Invalid email format.';
      }
      if (config.replyToAddress && !validateEmail(config.replyToAddress)) {
        errors.replyToAddress = 'Invalid email format.';
      }

      if (Object.keys(errors).length > 0) {
        setValidation(errors);
        return;
      }

      setValidation({});
      setSaving(true);

      try {
        await saveEmailConfig(config);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch {
        setError('Failed to save email configuration.');
      } finally {
        setSaving(false);
      }
    },
    [config]
  );

  if (loading) {
    return (
      <div className={styles.loadingState} data-testid="config-loading">
        <div className={styles.skeletonField} />
        <div className={styles.skeletonField} />
        <div className={styles.skeletonField} />
      </div>
    );
  }

  return (
    <form
      className={styles.configForm}
      onSubmit={handleSave}
      data-testid="email-config-form"
    >
      <div className={styles.formField}>
        <label htmlFor="sender-name" className={styles.label}>
          Default Sender Name
        </label>
        <input
          id="sender-name"
          type="text"
          className={styles.input}
          value={config.senderName}
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, senderName: e.target.value }))
          }
          disabled={saving}
          aria-describedby={
            validation.senderName ? 'sender-name-error' : undefined
          }
        />
        {validation.senderName && (
          <p id="sender-name-error" className={styles.fieldError} role="alert">
            {validation.senderName}
          </p>
        )}
      </div>

      <div className={styles.formField}>
        <label htmlFor="sender-address" className={styles.label}>
          Default Sender Address
        </label>
        <input
          id="sender-address"
          type="email"
          className={styles.input}
          value={config.senderAddress}
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, senderAddress: e.target.value }))
          }
          disabled={saving}
          aria-describedby={
            validation.senderAddress ? 'sender-address-error' : undefined
          }
        />
        {validation.senderAddress && (
          <p
            id="sender-address-error"
            className={styles.fieldError}
            role="alert"
          >
            {validation.senderAddress}
          </p>
        )}
      </div>

      <div className={styles.formField}>
        <label htmlFor="reply-to" className={styles.label}>
          Reply-To Address
          <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="reply-to"
          type="email"
          className={styles.input}
          value={config.replyToAddress}
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, replyToAddress: e.target.value }))
          }
          disabled={saving}
          aria-describedby={
            validation.replyToAddress ? 'reply-to-error' : undefined
          }
        />
        {validation.replyToAddress && (
          <p id="reply-to-error" className={styles.fieldError} role="alert">
            {validation.replyToAddress}
          </p>
        )}
      </div>

      {error && (
        <p className={styles.formError} role="alert" data-testid="config-error">
          {error}
        </p>
      )}

      {success && (
        <p
          className={styles.successMessage}
          role="status"
          data-testid="config-success"
        >
          Email configuration saved.
        </p>
      )}

      <button
        type="submit"
        className={styles.saveButton}
        disabled={saving}
        data-testid="save-email-config"
      >
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>
    </form>
  );
}
