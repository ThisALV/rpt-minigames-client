import { Injectable } from '@angular/core';
import { SerProtocolService } from 'rpt-webapp-client';
import { Observable, Subject } from 'rxjs';


/**
 * Read-only runtime error identified by its `uid` and described by its `message`.
 */
export class RuntimeError {
  constructor(public readonly uid: number, public readonly message: string) {}
}


/**
 * Provides an underlying subject to signals thrown errors and to handle them.
 */
@Injectable({
  providedIn: 'root'
})
export class RuntimeErrorsService {
  private readonly errors: Subject<RuntimeError>;

  /// Provides the next runtime error UID, will be incremented for each error created by service to have an unique UID
  private errorsUidProvider: number;

  /**
   * Initializes service with no thrown errors and automatically throwing errors reported by given SER Protocol.
   *
   * @param serProtocol Will automatically throws error into service for each SER Protocol errors which occurs.
   */
  constructor(private readonly serProtocol: SerProtocolService) {
    this.errors = new Subject<RuntimeError>();
    this.errorsUidProvider = 0;

    serProtocol.getErrors().subscribe({
      next: (message: string) => this.throwError(message)
    });
  }

  /**
   * Next given message into underlying subject.
   */
  throwError(message: string): void {
    this.errors.next(new RuntimeError(this.errorsUidProvider++, message));
  }

  /**
   * Observes next-ed values inside underlying subject.
   */
  observe(): Observable<RuntimeError> {
    return this.errors;
  }
}
