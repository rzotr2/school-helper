/** Base error for PDF inspection failures. Messages are safe to show to users. */
export class PdfInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfInspectionError';
  }
}

/** Thrown when processing was cancelled by the caller. Not a failure. */
export class PdfCancellationError extends PdfInspectionError {
  constructor() {
    super('PDF inspection cancelled');
    this.name = 'PdfCancellationError';
  }
}

/** Throws a PdfCancellationError when the signal is already aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PdfCancellationError();
}
