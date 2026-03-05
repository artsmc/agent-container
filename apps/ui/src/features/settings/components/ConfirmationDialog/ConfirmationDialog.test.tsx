import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmationDialog } from './ConfirmationDialog';

// Mock showModal and close on HTMLDialogElement since jsdom does not support them
beforeEach(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
});

describe('ConfirmationDialog', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Delete Item',
    body: 'Are you sure you want to delete this item?',
    confirmLabel: 'Delete',
    cancelLabel: 'Keep',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    isConfirming: false,
  };

  it('renders with correct title and body', () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete this item?')
    ).toBeInTheDocument();
  });

  it('renders with correct button labels', () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByTestId('confirmation-confirm')).toHaveTextContent(
      'Delete'
    );
    expect(screen.getByTestId('confirmation-cancel')).toHaveTextContent(
      'Keep'
    );
  });

  it('fires onConfirm when Confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmationDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('confirmation-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('fires onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirmation-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('disables both buttons when isConfirming is true', () => {
    render(<ConfirmationDialog {...defaultProps} isConfirming={true} />);
    expect(screen.getByTestId('confirmation-confirm')).toBeDisabled();
    expect(screen.getByTestId('confirmation-cancel')).toBeDisabled();
  });

  it('shows spinner on Confirm button when isConfirming', () => {
    render(<ConfirmationDialog {...defaultProps} isConfirming={true} />);
    const confirmButton = screen.getByTestId('confirmation-confirm');
    const spinner = confirmButton.querySelector('[aria-hidden="true"]');
    expect(spinner).toBeInTheDocument();
  });

  it('has role="alertdialog" on the dialog element', () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByTestId('confirmation-dialog')).toHaveAttribute(
      'role',
      'alertdialog'
    );
  });

  it('has aria-modal="true" on the dialog element', () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByTestId('confirmation-dialog')).toHaveAttribute(
      'aria-modal',
      'true'
    );
  });
});
