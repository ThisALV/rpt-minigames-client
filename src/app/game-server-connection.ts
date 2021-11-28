import { Subject } from 'rxjs';
import { RuntimeErrorsService } from './runtime-errors.service';
import { webSocket, WebSocketSubject } from 'rxjs/internal-compatibility';
import { ClosureHandledWebsocketConfig } from './closure-handled-connection';


/**
 * Overrides default `ClosureHandledWebsocketConfig` behavior by reading and writing raw textual data instead of JSON data.
 */
class RptlWebsocketConfig extends ClosureHandledWebsocketConfig<string> {
  serializer: (value: string) => string; // Write plain text for RPTL protocol
  deserializer: (e: MessageEvent) => string; // Read plain text for RPTL protocol

  constructor(public url: string, errorsService: RuntimeErrorsService) {
    super(url, errorsService);

    // Ignores JSON stringify/parsing to use plain text data instead
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
    const config = new RptlWebsocketConfig(url, runtimeErrors);
    // Creates connection with special RPTL behavior configuration
    const connection: WebSocketSubject<string> = webSocket(config);

    // Assigns established connection subject to be stopped as soon as connection is closed
    config.closeObserver.connection = connection;

    connection.subscribe({
      error: () => connection.isStopped = true
    });

    return connection;
  }
}


/**
 * @param currentServerUrl URL of game server to connects with
 * @param errorsHandler Service which is handling connection errors
 *
 * @returns `SHARED_CONNECTION_FACTORY.rptlConnectionFor()` call with given arguments
 */
export function rptlConnectionFactory(currentServerUrl: string, errorsHandler: RuntimeErrorsService): Subject<string> {
  return SHARED_CONNECTION_FACTORY.rptlConnectionFor(currentServerUrl, errorsHandler);
}


/**
 * Use this shared object to call a spy-mockable `rptlConnectionFor()` method.
 */
export const SHARED_CONNECTION_FACTORY: RptlConnectionFactory = new RptlConnectionFactory();
