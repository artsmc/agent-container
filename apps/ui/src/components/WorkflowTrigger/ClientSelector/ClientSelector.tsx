'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Client } from '@iexcel/shared-types';
import styles from './ClientSelector.module.scss';

export interface ClientSelectorProps {
  clients: Client[];
  selectedId: string | null;
  onChange: (clientId: string, clientName: string) => void;
  error?: string;
}

export default function ClientSelector({
  clients,
  selectedId,
  onChange,
  error,
}: ClientSelectorProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedClient = clients.find((c) => c.id === selectedId);

  const filtered = query
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      )
    : clients;

  const handleSelect = useCallback(
    (client: Client) => {
      onChange(client.id, client.name);
      setQuery('');
      setIsOpen(false);
    },
    [onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleClear = () => {
    setQuery('');
    onChange('', '');
    inputRef.current?.focus();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
    if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    }
  };

  const errorId = 'client-selector-error';

  return (
    <div className={styles.container} ref={containerRef}>
      <label htmlFor="client-selector-input" className={styles.label}>
        Client
      </label>
      <div className={styles.inputWrapper}>
        <input
          id="client-selector-input"
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="client-selector-listbox"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className={`${styles.input} ${error ? styles.inputError : ''}`}
          placeholder="Select a client..."
          value={isOpen ? query : selectedClient?.name ?? query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          data-testid="client-selector-input"
        />
        {selectedId && !isOpen && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear client selection"
            data-testid="client-selector-clear"
          >
            &times;
          </button>
        )}
      </div>
      {isOpen && (
        <ul
          id="client-selector-listbox"
          role="listbox"
          className={styles.dropdown}
          data-testid="client-selector-dropdown"
        >
          {filtered.length === 0 ? (
            <li className={styles.noResults}>No clients found</li>
          ) : (
            filtered.map((client) => (
              <li
                key={client.id}
                role="option"
                aria-selected={client.id === selectedId}
                className={`${styles.option} ${
                  client.id === selectedId ? styles.optionSelected : ''
                }`}
                onClick={() => handleSelect(client)}
                data-testid={`client-option-${client.id}`}
              >
                {client.name}
              </li>
            ))
          )}
        </ul>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
