import { Injectable } from '@angular/core';
import { RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { MonoTypeOperatorFunction, Observable, of, race, Subject, Subscription } from 'rxjs';
import { Availability } from 'rpt-webapp-client/lib/availability';
import { first } from 'rxjs/operators';


/**
 * Object provided by service subject to passes retrieved game server status.
 */
export type CheckoutResponse = Availability | undefined;


/**
 * Thrown by `ServerStatusService.checkout()` method if an other call has been performed but a value hasn't been passed to subject
 * obtained with `getNextResponse()`.
 */
export class CheckoutBusy extends Error {
  constructor() {
    super('Already checking out game server status.');
  }
}


/**
 * Connects to a game server with given connection, sends a `CHECKOUT` RPTL command and pushes into subject the `AVAILABILITY` response
 * from server, if any, `undefined` if an error occurred.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class ServerStatusService {
  private readonly nextResponse: Subject<CheckoutResponse>; // Every status retrieved for a checkout() operation will be passed here

  private subscriptions: Subscription[]; // Every subscribe() call performed inside a checkout operation must be closed at the end
  private available: boolean; // Indicates if a current checkout is running or not

  constructor(private readonly rptlProtocol: RptlProtocolService) {
    this.nextResponse = new Subject<CheckoutResponse>();
    this.available = true; // No checkout running at initialization
    this.subscriptions = []; // No pending subscriptions as no checkout is running
  }

  /// When RPTL session is terminated, finishes current checkout operation by cancelling every pending subscription, setting
  /// available flag to `true` and pushed operation result into subject.
  private clear(operationResult?: Availability): void {
    // Terminates each subscription to avoid side effects later
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    // No more subscription
    this.subscriptions = [];

    this.available = true; // Operation finished, another checkout can begin
    this.nextResponse.next(operationResult); // Pushes result inside subject
  }

  /**
   * @returns Observable for the subject which is passed checkout operations result
   */
  getNextResponse(): Observable<CheckoutResponse> {
    return this.nextResponse;
  }

  /**
   * Sends a `CHECKOUT` and retrieves game server status from the `AVAILABILITY` response.
   *
   * @param connection Subject connected with game server to checkout for
   * @param delayPipeOperator When the `Observable<undefined>` returned by this operator next a new `undefined` value, this value is
   * passed to the `getNextResponse()` subject
   *
   * @throws CheckoutBusy if another checkout operation is still running
   */
  checkout(connection: Subject<string>, delayPipeOperator: MonoTypeOperatorFunction<undefined>): void {
    if (!this.available) { // Checks for no other checkout operation to be running, RptlProtocolService wouldn't support it
      throw new CheckoutBusy();
    }

    this.available = false; // Now RPTL protocol will be busy with given connection

    const context: ServerStatusService = this;

    // When checkout operation finished, object is passed if it succeeded, undefined is passed otherwise
    const result = new Subject<Availability | undefined>();
    // If the operation timed out, then result is undefined
    const resultSub = race(of(undefined).pipe(delayPipeOperator), result).subscribe({
      next(newStatus?: Availability): void { // When the status is received or the operation timed out
        // If no RPTL error occurred and connection is still active, closes it to actually finish the checkout operation
        if (context.rptlProtocol.isSessionRunning()) {
          // Waits for RPTL connection to have been effectively closed, aka waiting for server WS close frame
          const disconnectedSub = context.rptlProtocol.getState()
            .pipe(first((newState: RptlState) => newState === RptlState.DISCONNECTED))
            .subscribe({
              next: () => context.clear(newStatus) // When RPTL session is terminated, we can clear current checkout operation
            });

          context.rptlProtocol.endSession(); // Closes connection with server by sending a WS close frames

          context.subscriptions.push(disconnectedSub);
        } else { // Already disconnected, disconnection event will not be emitted
          context.clear(newStatus); // Immediately finishes current operation
        }
      }
    });

    this.subscriptions.push(resultSub);

    try {
      // As soon as we're connected to server...
      // Using first to match with connected event and ignores further events like this
      const connectedSub = this.rptlProtocol.getState()
        .pipe(first((newState: RptlState) => newState === RptlState.UNREGISTERED))
        .subscribe({
          next(): void {
            // Listen for the next AVAILABILITY response from server
            const retrievedStatusSub = context.rptlProtocol.getStatus().pipe(first()).subscribe({
              next: (a: Availability) => result.next(a), // If status is received, passes object
              // If failed to retrieve status, because of an unexpected internal error or connection closed, passes undefined
              complete: () => result.next(undefined),
              error: () => result.next(undefined)
            });
            context.subscriptions.push(retrievedStatusSub);

            context.rptlProtocol.updateStatusFromServer(); // Sends CHECKOUT command
          }
        });

      this.subscriptions.push(connectedSub);

      this.rptlProtocol.beginSession(connection); // Connects to server
    } catch (err: any) { // Any error should result into undefined server status
      console.error(`Checkout error: ${err.message}`);

      result.next(undefined); // Status is undefined
    }
  }
}
