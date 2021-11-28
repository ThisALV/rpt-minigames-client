import { NextObserver, Subject } from 'rxjs';
import { RuntimeErrorsService } from './runtime-errors.service';
import { WebSocketSubjectConfig } from 'rxjs/internal-compatibility';


const WS_CLOSE_NORMAL = 1000; // Used to identify if connection was closed from server without any reported RTPL error


/**
 * Constructs a `ClosureHandledWebsocketConfig` with an instance of this class to report error into underlying `RuntimeErrorsService` if WS
 * close frame code notifies an error.
 *
 * Assigns `connection` field for subject to be stopped manually at disconnection. If `connection` is the `WebSocketSubject` constructed
 * with the `rptlConnectionFactory`, it ensures that WS connection subject is stopped each time connection is closed, which is required
 * to run `RptlProtocolService`.
 */
class CloseFrameObserver implements NextObserver<CloseEvent> {
  public connection?: Subject<string>;

  /**
   * Constructs observer without any `connection` to stop automatically at close frames.
   *
   * @param runtimeErrors To report errors for each abnormal connection closure
   */
  constructor(private readonly runtimeErrors: RuntimeErrorsService) {}

  /**
   * @param event Contains close frame reason and code to analyse closure.
   */
  next(event: CloseEvent): void {
    if (event.code !== WS_CLOSE_NORMAL) { // Checks for connection closure to not be abnormal using its close reason code
      this.runtimeErrors.throwError(event.reason);
    }

    // connection field must be optional
    if (this.connection !== undefined) {
      // isStopped property required for RptlProtocolService to work, but WebSocketSubject doesn't as expected in that point
      this.connection.isStopped = true;
    }
  }
}


/**
 * Overrides default `WebSocketSubject` by stopping given subject and reporting error WS close frames into the underlying
 * `RuntimeErrorServices`.
 */
export class ClosureHandledWebsocketConfig implements WebSocketSubjectConfig<string> {
  closeObserver: CloseFrameObserver;

  /**
   * @param url URL to connect with this WebSocketSubject
   * @param errorsService Service which will handle close frame with associated error code
   */
  constructor(public url: string, errorsService: RuntimeErrorsService) {
    this.closeObserver = new CloseFrameObserver(errorsService);
  }
}
