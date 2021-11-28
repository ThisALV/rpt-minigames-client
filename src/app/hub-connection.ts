import { ClosureHandledWebsocketConfig } from './closure-handled-connection';
import { RuntimeErrorsService } from './runtime-errors.service';
import { GameServer, serversFromJsonString } from './game-server';
import { WebSocketMessage } from 'rxjs/internal/observable/dom/WebSocketSubject';
import { Subject } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/internal-compatibility';


// Message used to checkout servers list on the hub
const CHECKOUT_MESSAGE = 'REQUEST';


/**
 * Overrides default `ClosureHandledWebsocketConfig` to write "REQUEST" and read `GameServer` JSON-formatted.
 */
class HubWebsocketConfig extends ClosureHandledWebsocketConfig<GameServer[]> {
  constructor(url: string, errorsService: RuntimeErrorsService) {
    super(url, errorsService);
  }

  // Expects an empty list, will sends REQUEST to Hub no matter the value inside arguments
  serializer(value: GameServer[]): WebSocketMessage {
    // Even if the value doesn't matter, it might be a misunderstanding if this class if a non-empty list is passed
    if (value.length !== 0) {
      console.warn('Arg triggering REQUEST to hub is a non-empty list');
    }

    return CHECKOUT_MESSAGE;
  }

  // Parses JSON data from the WS message into a GameServer list
  deserializer(e: MessageEvent): GameServer[] {
    return serversFromJsonString(e.data);
  }
}


/**
 * Contains a method providing the hub connection WebSocket subject
 *
 * Encapsulation inside class is required for Jasmine spies mocking.
 */
export class HubConnectionFactory {
  /**
   * @param url Websocket protocol URL for hub to be connected with
   * @param runtimeErrors Service receiving every error relative to an abnormal WS connection closure
   *
   * @returns A `WebSocketSubject` compatible with `ServersListService`, that is, configured to only
   * send `REQUEST` message and receive game servers list JSON-formatted.
   */
  hubConnectionFor(url: string, runtimeErrors: RuntimeErrorsService): Subject<GameServer[]> {
    const config = new HubWebsocketConfig(url, runtimeErrors);
    // Creates connection with special HUB behavior configuration
    const connection: WebSocketSubject<GameServer[]> = webSocket(config);

    // Assigns established connection subject to be stopped as soon as connection is closed
    config.closeObserver.connection = connection;

    return connection;
  }
}


/**
 * @param hubUrl URL of the hub providing game servers list
 * @param errorsHandler Service which is handling connection errors
 *
 * @returns `SHARED_HUB_CONNECTION_FACTORY.hubConnectionFor()` call with given arguments
 */
export function hubConnectionFactory(hubUrl: string, errorsHandler: RuntimeErrorsService): Subject<GameServer[]> {
  return SHARED_HUB_CONNECTION_FACTORY.hubConnectionFor(hubUrl, errorsHandler);
}


/**
 * Use this shared object to call a spy-mockable `hubConnectionFor()` method.
 */
export const SHARED_HUB_CONNECTION_FACTORY: HubConnectionFactory = new HubConnectionFactory();

