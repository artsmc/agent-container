'use client';

import { useRef, useState } from 'react';
import type { TranscriptSource } from '@/lib/workflow/types';
import styles from './TranscriptSourceSelector.module.scss';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

interface Tab {
  value: TranscriptSource;
  label: string;
  disabled: boolean;
  tooltip?: string;
}

const TABS: Tab[] = [
  { value: 'paste', label: 'Paste text', disabled: false },
  { value: 'upload', label: 'Upload file', disabled: false },
  { value: 'grain', label: 'Select from Grain', disabled: true, tooltip: 'Coming soon (V2)' },
];

export interface TranscriptSourceSelectorProps {
  source: TranscriptSource;
  onSourceChange: (source: TranscriptSource) => void;
  transcriptText: string;
  onTextChange: (text: string) => void;
  fileName: string | null;
  onFileChange: (fileName: string, text: string) => void;
  onFileClear: () => void;
  error?: string;
}

export default function TranscriptSourceSelector({
  source,
  onSourceChange,
  transcriptText,
  onTextChange,
  fileName,
  onFileChange,
  onFileClear,
  error,
}: TranscriptSourceSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Type validation
    if (!file.name.endsWith('.txt')) {
      setFileError('Only .txt files are supported');
      e.target.value = '';
      return;
    }

    // Size validation
    if (file.size > MAX_FILE_SIZE) {
      setFileError('File is too large (max 5 MB)');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text || text.trim() === '') {
        setFileError('The uploaded file is empty');
        return;
      }
      setFileError(null);
      onFileChange(file.name, text);
    };
    reader.onerror = () => {
      setFileError('Failed to read the file. Please try again.');
    };
    reader.readAsText(file);
  };

  const handleRemoveFile = () => {
    setFileError(null);
    onFileClear();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayError = fileError ?? error;
  const errorId = 'transcript-source-error';

  return (
    <div className={styles.container}>
      <div className={styles.tabs} role="tablist" aria-label="Transcript source">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={source === tab.value}
            aria-disabled={tab.disabled}
            disabled={tab.disabled}
            className={`${styles.tab} ${source === tab.value ? styles.tabActive : ''} ${
              tab.disabled ? styles.tabDisabled : ''
            }`}
            onClick={() => {
              if (!tab.disabled) {
                setFileError(null);
                onSourceChange(tab.value);
              }
            }}
            title={tab.tooltip}
            data-testid={`transcript-tab-${tab.value}`}
          >
            {tab.label}
            {tab.disabled && <span className={styles.comingSoon}>V2</span>}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={`${source} transcript input`}
        className={styles.panel}
      >
        {source === 'paste' && (
          <textarea
            className={`${styles.textarea} ${displayError ? styles.textareaError : ''}`}
            placeholder="Paste the call transcript here..."
            rows={8}
            value={transcriptText}
            onChange={(e) => onTextChange(e.target.value)}
            aria-label="Transcript text"
            aria-describedby={displayError ? errorId : undefined}
            aria-invalid={displayError ? true : undefined}
            data-testid="transcript-textarea"
          />
        )}

        {source === 'upload' && (
          <div className={styles.uploadArea}>
            {fileName ? (
              <div className={styles.fileDisplay}>
                <span className={styles.fileName} data-testid="uploaded-file-name">
                  {fileName}
                </span>
                <button
                  type="button"
                  className={styles.removeFileButton}
                  onClick={handleRemoveFile}
                  aria-label="Remove uploaded file"
                  data-testid="remove-file-button"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileSelect}
                  className={styles.fileInput}
                  id="transcript-file-input"
                  aria-describedby={displayError ? errorId : 'file-hint'}
                  data-testid="transcript-file-input"
                />
                <label
                  htmlFor="transcript-file-input"
                  className={styles.fileLabel}
                >
                  Choose a .txt file
                </label>
                <p id="file-hint" className={styles.fileHint}>
                  Only .txt files up to 5 MB are accepted
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {displayError && (
        <p id={errorId} className={styles.error} role="alert">
          {displayError}
        </p>
      )}
    </div>
  );
}
