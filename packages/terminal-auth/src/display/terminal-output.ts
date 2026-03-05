/**
 * Writes a message to stdout followed by a newline.
 */
export function print(message: string): void {
  process.stdout.write(message + '\n');
}

/**
 * Writes an error message to stderr followed by a newline.
 */
export function printError(message: string): void {
  process.stderr.write(message + '\n');
}
