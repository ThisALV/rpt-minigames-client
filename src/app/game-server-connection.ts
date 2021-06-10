import { NextObserver, Subject } from 'rxjs';
import { RuntimeErrorsService } from './runtime-errors.service';
import { webSocket, WebSocketSubject, WebSocketSubjectConfig } from 'rxjs/internal-compatibility';
import { WebSocketMessage } from 'rxjs/internal/observable/dom/WebSocketSubject';


const WS_CLOSE_NORMAL = 1000; // Used to identify if connection was closed from server without any reported RTPL error


/**
 * Constructs a `RptlWebsocketConfig` with an instance of this class to report error into underlying `RuntimeErrorsService` if WS
 * close frame code notifies an error.
 *
 * Assigns `connection` field for subject to be stopped manually at disconnection. If `connection` is the `WebSocketSubject` constructed
 * with the `RptlWebsocketConfig` described above, it ensures that WS connection subject is stopped each time connection is closed,
 * which is required to run `RptlProtocolService`.
 */
class RptlWebsocketClosureObserver implements NextObserver<CloseEvent> {
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
 * Overrides default `WebSocketSubject` behavior by reading and writing raw textual data instead of JSON data.
 */
class RptlWebsocketConfig implements WebSocketSubjectConfig<string> {
  closeObserver: NextObserver<CloseEvent>;
  serializer: (value: string) => WebSocketMessage;
  deserializer: (e: MessageEvent) => string;

  constructor(public url: string, closeFrameObserver: RptlWebsocketClosureObserver) {
    this.closeObserver = closeFrameObserver;

    // Ignores JSON stringify/parsing to use raw textual data instead
    this.serializer = (value: string) => value;
    this.deserializer = (e: MessageEvent) => e.data;
  }
}


/**
 * Contains a method providing the RPTL connection WebSocket subject
 *
 * Encapsulation inside class is required for Jasmine spies mocking.
 */
export class RptlConnectionFactory {
  /**
   * @param url Websocket protocol URL for server to be connected with
   * @param runtimeErrors Service receiving every error relative to an abnormal WS connection closure
   *
   * @returns A `WebSocketSubject` compatible with `RptlProtocolService`, that is, configured to not use JSON data but textual data inside
   * messages instead, and to set `isStopped` flag when it is closed.
   */
  rptlConnectionFor(url: string, runtimeErrors: RuntimeErrorsService): Subject<string> {
    // Must be initialized separately to have a connection field accessible later, when webSocket() will have been called
    const closeFrameObserver: RptlWebsocketClosureObserver = new RptlWebsocketClosureObserver(runtimeErrors);
    // Creates connection with special RPTL behavior configuration
    const connection: WebSocketSubject<string> = webSocket(new RptlWebsocketConfig(url, closeFrameObserver));

    // Assigns established connection subject to be stopped as soon as connection is closed
    closeFrameObserver.connection = connection;

    connection.subscribe({
      error: () => connection.isStopped = true
    });

    return connection;
  }
}


/**
 * Use this shared object to call a spy-mockable `rptlConnectionFor()` method.
 */
export const SHARED_CONNECTION_FACTORY: RptlConnectionFactory = new RptlConnectionFactory();
