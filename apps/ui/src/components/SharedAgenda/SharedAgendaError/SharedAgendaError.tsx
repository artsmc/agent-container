import styles from './SharedAgendaError.module.scss';

type ErrorType = 'invalid' | 'expired' | 'generic';

const ERROR_CONTENT: Record<
  ErrorType,
  { heading: string; body: string; guidance: string }
> = {
  invalid: {
    heading: 'This link is not valid',
    body: 'The agenda link you followed could not be found. It may have been removed or the URL may be incorrect.',
    guidance:
      'If you believe this is an error, please contact your account manager.',
  },
  expired: {
    heading: 'This link has expired',
    body: 'The agenda link you followed is no longer active.',
    guidance:
      'Please contact your account manager to request an updated link.',
  },
  generic: {
    heading: 'Something went wrong',
    body: 'We were unable to load this agenda. Please try again in a few moments.',
    guidance:
      'If the problem persists, please contact your account manager.',
  },
};

interface SharedAgendaErrorProps {
  type: ErrorType;
}

export function SharedAgendaError({ type }: SharedAgendaErrorProps) {
  const content = ERROR_CONTENT[type];
  return (
    <div className={styles.errorContainer} data-testid="shared-agenda-error">
      <h1 className={styles.errorHeading} data-testid="error-heading">
        {content.heading}
      </h1>
      <p className={styles.errorBody} data-testid="error-body">
        {content.body}
      </p>
      <p className={styles.errorGuidance} data-testid="error-guidance">
        {content.guidance}
      </p>
    </div>
  );
}
