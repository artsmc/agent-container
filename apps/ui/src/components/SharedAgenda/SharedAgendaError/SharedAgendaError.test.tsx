import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharedAgendaError } from './SharedAgendaError';

describe('SharedAgendaError', () => {
  describe('type="invalid"', () => {
    it('renders "This link is not valid" heading', () => {
      render(<SharedAgendaError type="invalid" />);
      expect(screen.getByTestId('error-heading')).toHaveTextContent(
        'This link is not valid'
      );
    });

    it('renders the invalid link explanation', () => {
      render(<SharedAgendaError type="invalid" />);
      expect(screen.getByTestId('error-body')).toHaveTextContent(
        'The agenda link you followed could not be found'
      );
    });

    it('renders guidance to contact account manager', () => {
      render(<SharedAgendaError type="invalid" />);
      expect(screen.getByTestId('error-guidance')).toHaveTextContent(
        'please contact your account manager'
      );
    });
  });

  describe('type="expired"', () => {
    it('renders "This link has expired" heading', () => {
      render(<SharedAgendaError type="expired" />);
      expect(screen.getByTestId('error-heading')).toHaveTextContent(
        'This link has expired'
      );
    });

    it('renders the expired link explanation', () => {
      render(<SharedAgendaError type="expired" />);
      expect(screen.getByTestId('error-body')).toHaveTextContent(
        'The agenda link you followed is no longer active'
      );
    });

    it('renders guidance to request updated link', () => {
      render(<SharedAgendaError type="expired" />);
      expect(screen.getByTestId('error-guidance')).toHaveTextContent(
        'request an updated link'
      );
    });
  });

  describe('type="generic"', () => {
    it('renders "Something went wrong" heading', () => {
      render(<SharedAgendaError type="generic" />);
      expect(screen.getByTestId('error-heading')).toHaveTextContent(
        'Something went wrong'
      );
    });

    it('renders the generic error explanation', () => {
      render(<SharedAgendaError type="generic" />);
      expect(screen.getByTestId('error-body')).toHaveTextContent(
        'We were unable to load this agenda'
      );
    });

    it('renders guidance to try again or contact account manager', () => {
      render(<SharedAgendaError type="generic" />);
      expect(screen.getByTestId('error-guidance')).toHaveTextContent(
        'If the problem persists, please contact your account manager'
      );
    });
  });

  it('renders the error container with data-testid', () => {
    render(<SharedAgendaError type="generic" />);
    expect(screen.getByTestId('shared-agenda-error')).toBeInTheDocument();
  });
});
