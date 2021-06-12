import { Component, OnDestroy, OnInit } from '@angular/core';
import { RuntimeError, RuntimeErrorsService } from '../runtime-errors.service';
import { of, Subscription } from 'rxjs';
import { delay } from 'rxjs/operators';


// Milliseconds to wait until an error message automatically starts to disappear
const ERROR_DISPLAY_DURATION_MS = 5000;


@Component({
  selector: 'app-runtime-errors',
  templateUrl: './runtime-errors.component.html',
  styleUrls: ['./runtime-errors.component.css']
})
export class RuntimeErrorsComponent implements OnInit, OnDestroy {
  /**
   * Errors which currently have a displayed <div> block on screen.
   */
  displayedErrors: RuntimeError[];

  private thrownErrorsSubscription?: Subscription; // Initialized when observing errors emitted by the underlying Angular service

  constructor(private readonly errorsSource: RuntimeErrorsService) {
    this.displayedErrors = [];
  }

  /**
   * @param uid Identifying the `RuntimeError` object to remove from the error messages list.
   *
   * @note Has no effect if no error is using given `uid`.
   */
  hide(uid: number): void {
    // Every error excepted the identified one will remain displayed
    this.displayedErrors = this.displayedErrors.filter((err: RuntimeError) => err.uid !== uid);
  }

  /**
   * Observes errors thrown by application and displays them until a certain duration has passed.
   */
  ngOnInit(): void {
    this.thrownErrorsSubscription = this.errorsSource.observe().subscribe({
      next: (err: RuntimeError) => {
        this.displayedErrors.push(err); // Inserts message at the end of the error messages list

        of<undefined>().pipe(delay(ERROR_DISPLAY_DURATION_MS)).subscribe({ // Waits for 5s before removing error from displayed list
          next: () => this.hide(err.uid) // Will have no effect if it was already removed manually by user
        });
      }
    });
  }

  /**
   * Stops observing errors thrown by application.
   */
  ngOnDestroy(): void {
    this.thrownErrorsSubscription?.unsubscribe();
  }
}
