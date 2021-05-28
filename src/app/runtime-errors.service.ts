import { Injectable } from '@angular/core';
import { SerProtocolService } from 'rpt-webapp-client';
import { Observable, Subject } from 'rxjs';


// Provides the next runtime error UID, will be incremented for each error to have an unique UID
let errorsUidProvider = 0;

/**
 * Read-only runtime error identified by its `uid` and described by its `message`.
 */
export class RuntimeError {
  readonly uid: number;

  constructor(public readonly message: string) {
    this.uid = errorsUidProvider++;
  }
}


/**
 * Provides an underlying subject to signals thrown errors and to handle them.
 */
@Injectable({
  providedIn: 'root'
})
export class RuntimeErrorsService {
  private readonly errors: Subject<RuntimeError>;

  /**
   * Initializes service with no thrown errors and automatically throwing errors reported by given SER Protocol.
   *
   * @param serProtocol Will automatically throws error into service for each SER Protocol errors which occurs.
   */
  constructor(private readonly serProtocol: SerProtocolService) {
    this.errors = new Subject<RuntimeError>();

    serProtocol.getErrors().subscribe({
      next: (message: string) => this.throwError(message)
    });
  }

  /**
   * Next given message into underlying subject.
   */
  throwError(message: string): void {
    this.errors.next(new RuntimeError(message));
  }

  /**
   * Observes next-ed values inside underlying subject.
   */
  observe(): Observable<RuntimeError> {
    return this.errors;
  }
}
