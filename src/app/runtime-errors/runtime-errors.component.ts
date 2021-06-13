import { Component, OnDestroy, OnInit } from '@angular/core';
import { RuntimeError, RuntimeErrorsService } from '../runtime-errors.service';
import { of, Subscription } from 'rxjs';
import { delay } from 'rxjs/operators';


/**
 * Thrown by `hide()` method if no displayed error has given UID.
 */
export class UnknownRuntimeError extends Error {
  constructor(triedUid: number) {
    super(`No displayed error has UID ${triedUid}.`);
  }
}


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

  private readonly pendingDeletions: { [errUid: number]: Subscription }; // Subscriptions for delayed hide() calls for each displayed error
  private thrownErrorsSubscription?: Subscription; // Initialized when observing errors emitted by the underlying Angular service

  constructor(private readonly errorsSource: RuntimeErrorsService) {
    this.pendingDeletions = {};
    this.displayedErrors = [];
  }

  /**
   * @param uid Identifying the `RuntimeError` object to remove from the error messages list.
   *
   * @throws UnknownRuntimeError if no displayed error has given `uid`
   */
  hide(uid: number): void {
    // Try to get subscription for delayed hiding operation associated with given error UID
    const delayedHiding: Subscription | undefined = this.pendingDeletions[uid];
    // If a displayed error has no entry on pendingDeletions, then it doesn't exist
    if (delayedHiding === undefined) {
      throw new UnknownRuntimeError(uid);
    }

    // Cancel automatic hiding if it was manually hidden
    delayedHiding.unsubscribe();
    delete this.pendingDeletions[uid];

    // Every error excepted the identified one will remain displayed
    this.displayedErrors = this.displayedErrors.filter((err: RuntimeError) => err.uid !== uid);
  }

  /**
   * @param uid Identifying the `RuntimeError` to check state for
   *
   * @returns `true` if that `RuntimeError` is going to be automatically hidden or not. If it is the case, then it ensures that
   * `RuntimeError` is currently displayed>.
   */
  willBeHidden(uid: number): boolean {
    return this.pendingDeletions[uid] !== undefined;
  }

  /**
   * Observes errors thrown by application and displays them until a certain duration has passed.
   */
  ngOnInit(): void {
    this.thrownErrorsSubscription = this.errorsSource.observe().subscribe({
      next: (err: RuntimeError) => {
        this.displayedErrors.push(err); // Inserts message at the end of the error messages list

        // Waits for 5s before removing error from displayed list, creates an entry into pending hiding operations registry to cancel it
        // later.
        this.pendingDeletions[err.uid] = of<undefined>().pipe(delay(ERROR_DISPLAY_DURATION_MS)).subscribe({
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
