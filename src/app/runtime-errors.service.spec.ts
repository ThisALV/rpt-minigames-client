import { TestBed } from '@angular/core/testing';
import { RuntimeError, RuntimeErrorsService } from './runtime-errors.service';
import { Observable, Subject } from 'rxjs';
import { SerProtocolService } from 'rpt-webapp-client';
import { expectArrayToBeEqual, unexpected } from './testing-helpers';


/**
 * Mocks getErrors() `SerProtocolService` method behavior with a string subject streaming error messages.
 */
class MockedErrorsSource {
  readonly errors: Subject<string>;

  constructor() {
    this.errors = new Subject<string>();
  }

  getErrors(): Observable<string> {
    return this.errors;
  }
}


describe('RuntimeErrorsService', () => {
  let service: RuntimeErrorsService;
  let errorsSource: MockedErrorsSource;

  beforeEach(() => {
    errorsSource = new MockedErrorsSource();

    TestBed.configureTestingModule({
      providers: [
        { provide: SerProtocolService, useValue: errorsSource } // Only getErrors() is used by this service
      ]
    });

    service = TestBed.inject(RuntimeErrorsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should automatically listen for SER errors at construction', () => {
    const errorsReceived: string[] = [];
    service.observe().subscribe({ // Saves each error emitted by subject to check them later
      next: (error: RuntimeError) => errorsReceived.push(error.message),
      complete: unexpected,
      error: unexpected
    });

    // Emulates 2 errors from SER protocols
    errorsSource.errors.next('Runtime error 1');
    errorsSource.errors.next('Runtime error 2');

    // Checks for the 2 errors to have been reported by the service
    expectArrayToBeEqual(errorsReceived, 'Runtime error 1', 'Runtime error 2');
  });

  it('should reports error when thrown with service', () => {
    const errorsReceived: string[] = [];
    service.observe().subscribe({ // Saves each error emitted by subject to check them later
      next: (error: RuntimeError) => errorsReceived.push(error.message),
      complete: unexpected,
      error: unexpected
    });

    // Emulates 2 errors thrown manually with service
    service.throwError('Runtime error 1');
    service.throwError('Runtime error 2');

    // Checks for the 2 errors to have been reported by the service
    expectArrayToBeEqual(errorsReceived, 'Runtime error 1', 'Runtime error 2');
  });
});
