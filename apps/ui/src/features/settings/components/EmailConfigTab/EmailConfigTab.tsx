'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EmailConfig, EmailTemplate } from '../../types';
import {
  fetchEmailConfig,
  saveEmailConfig,
  fetchEmailTemplates,
  saveEmailTemplate,
} from '../../hooks/use-settings-api';
import styles from './EmailConfigTab.module.scss';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

/**
 * EmailConfigTab -- manage email sender config and templates.
 *
 * Displays a config form (sender name, sender address, reply-to)
 * and a list of email templates with inline editing.
 */
export function EmailConfigTab() {
  // Config state
  const [config, setConfig] = useState<EmailConfig>({
    senderName: '',
    senderAddress: '',
    replyToAddress: '',
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);
  const [configValidation, setConfigValidation] = useState<
    Record<string, string>
  >({});

  // Template state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [editContent, setEditContent] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);

  // Load config
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchEmailConfig();
        if (!cancelled) setConfig(data);
      } catch {
        if (!cancelled) setConfigError('Failed to load email configuration.');
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load templates
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchEmailTemplates();
        if (!cancelled) setTemplates(data);
      } catch {
        if (!cancelled)
          setTemplatesError('Failed to load email templates.');
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfigSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setConfigError(null);
      setConfigSuccess(false);

      // Validate
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
        setConfigValidation(errors);
        return;
      }

      setConfigValidation({});
      setConfigSaving(true);

      try {
        await saveEmailConfig(config);
        setConfigSuccess(true);
        setTimeout(() => setConfigSuccess(false), 3000);
      } catch {
        setConfigError('Failed to save email configuration.');
      } finally {
        setConfigSaving(false);
      }
    },
    [config]
  );

  const handleEditTemplate = useCallback(
    (template: EmailTemplate) => {
      setEditingTemplateId(template.id);
      setEditContent(template.content);
    },
    []
  );

  const handleSaveTemplate = useCallback(async () => {
    if (!editingTemplateId) return;
    setTemplateSaving(true);
    try {
      const updated = await saveEmailTemplate(editingTemplateId, editContent);
      setTemplates((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
      setEditingTemplateId(null);
      setEditContent('');
    } catch {
      setTemplatesError('Failed to save template.');
    } finally {
      setTemplateSaving(false);
    }
  }, [editingTemplateId, editContent]);

  const handleCancelEdit = useCallback(() => {
    setEditingTemplateId(null);
    setEditContent('');
  }, []);

  return (
    <div className={styles.root} data-testid="email-config-tab">
      {/* Config Section */}
      <section className={styles.section}>
        <h2 className={styles.heading}>Email Configuration</h2>
        <p className={styles.description}>
          Configure the default sender identity for outgoing emails.
        </p>

        {configLoading ? (
          <div className={styles.loadingState} data-testid="config-loading">
            <div className={styles.skeletonField} />
            <div className={styles.skeletonField} />
            <div className={styles.skeletonField} />
          </div>
        ) : (
          <form
            className={styles.configForm}
            onSubmit={handleConfigSave}
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
                  setConfig((prev) => ({
                    ...prev,
                    senderName: e.target.value,
                  }))
                }
                disabled={configSaving}
                aria-describedby={
                  configValidation.senderName
                    ? 'sender-name-error'
                    : undefined
                }
              />
              {configValidation.senderName && (
                <p
                  id="sender-name-error"
                  className={styles.fieldError}
                  role="alert"
                >
                  {configValidation.senderName}
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
                  setConfig((prev) => ({
                    ...prev,
                    senderAddress: e.target.value,
                  }))
                }
                disabled={configSaving}
                aria-describedby={
                  configValidation.senderAddress
                    ? 'sender-address-error'
                    : undefined
                }
              />
              {configValidation.senderAddress && (
                <p
                  id="sender-address-error"
                  className={styles.fieldError}
                  role="alert"
                >
                  {configValidation.senderAddress}
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
                  setConfig((prev) => ({
                    ...prev,
                    replyToAddress: e.target.value,
                  }))
                }
                disabled={configSaving}
                aria-describedby={
                  configValidation.replyToAddress
                    ? 'reply-to-error'
                    : undefined
                }
              />
              {configValidation.replyToAddress && (
                <p
                  id="reply-to-error"
                  className={styles.fieldError}
                  role="alert"
                >
                  {configValidation.replyToAddress}
                </p>
              )}
            </div>

            {configError && (
              <p
                className={styles.formError}
                role="alert"
                data-testid="config-error"
              >
                {configError}
              </p>
            )}

            {configSuccess && (
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
              disabled={configSaving}
              data-testid="save-email-config"
            >
              {configSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </form>
        )}
      </section>

      {/* Templates Section */}
      <section className={styles.section}>
        <h2 className={styles.heading}>Email Templates</h2>
        <p className={styles.description}>
          Edit email templates used for agenda sharing and notifications.
        </p>

        {templatesLoading ? (
          <div
            className={styles.loadingState}
            data-testid="templates-loading"
          >
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </div>
        ) : templatesError ? (
          <div
            className={styles.errorState}
            role="alert"
            data-testid="templates-error"
          >
            <p>{templatesError}</p>
          </div>
        ) : templates.length === 0 ? (
          <div className={styles.emptyState} data-testid="templates-empty">
            <p>No templates configured.</p>
          </div>
        ) : (
          <ul className={styles.templateList} data-testid="template-list">
            {templates.map((template) => (
              <li
                key={template.id}
                className={styles.templateItem}
                data-testid={`template-${template.id}`}
              >
                <div className={styles.templateHeader}>
                  <div className={styles.templateInfo}>
                    <span className={styles.templateName}>
                      {template.name}
                    </span>
                    <span className={styles.templateMeta}>
                      Last modified:{' '}
                      {new Date(template.lastModified).toLocaleDateString()}
                    </span>
                  </div>
                  {editingTemplateId !== template.id && (
                    <button
                      type="button"
                      className={styles.editTemplateButton}
                      onClick={() => handleEditTemplate(template)}
                      data-testid={`edit-template-${template.id}`}
                    >
                      Edit
                    </button>
                  )}
                </div>

                {editingTemplateId === template.id && (
                  <div
                    className={styles.templateEditor}
                    data-testid={`template-editor-${template.id}`}
                  >
                    {template.variables.length > 0 && (
                      <div className={styles.variablesList}>
                        <span className={styles.variablesLabel}>
                          Available variables:
                        </span>
                        {template.variables.map((v) => (
                          <code key={v} className={styles.variable}>
                            {`{{${v}}}`}
                          </code>
                        ))}
                      </div>
                    )}
                    <textarea
                      className={styles.textarea}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={10}
                      disabled={templateSaving}
                      aria-label={`Edit template: ${template.name}`}
                    />
                    <div className={styles.editorActions}>
                      <button
                        type="button"
                        className={styles.cancelEditButton}
                        onClick={handleCancelEdit}
                        disabled={templateSaving}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.saveTemplateButton}
                        onClick={handleSaveTemplate}
                        disabled={templateSaving}
                        data-testid={`save-template-${template.id}`}
                      >
                        {templateSaving ? 'Saving...' : 'Save Template'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
