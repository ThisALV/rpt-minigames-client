import { ClosureHandledWebsocketConfig } from './closure-handled-connection';
import { RuntimeErrorsService } from './runtime-errors.service';
import { GameServer } from './game-server';
import { WebSocketMessage } from 'rxjs/internal/observable/dom/WebSocketSubject';
import { Subject } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/internal-compatibility';
import { Availability } from 'rpt-webapp-client';


// Message used to checkout servers list on the hub
const CHECKOUT_MESSAGE = 'REQUEST';


/**
 * Converts a JSON array received from the Hub into a TypeScript exploitable `GameServer[]`.
 *
 * @param json JSON-formatted `GameServer` array
 *
 * @returns `GameServer[]` with, when available, updated status, usable with `ServersListService`
 */
function serversFromJsonString(json: string): GameServer[] {
  const result: GameServer[] = []; // We start with an empty servers list
  const parsedServersArray = JSON.parse(json);

  for (const server of parsedServersArray) {
    let availability: Availability | undefined;
    // availability property must be a JSON object with matching Availability TS class properties
    if (
      typeof server.availability === 'object' && server.availability !== null &&
      typeof server.availability.currentActors === 'number' &&
      typeof server.availability.actorsLimit
    ) { // If it matches, then we don't ignore this server status retrieved by the hub
      availability = new Availability(server.availability.currentActors, server.availability.actorsLimit);
    }

    // Constructs server object with data parsed from the JSON array, and adds it to the servers list
    result.push(new GameServer(server.name, server.game, availability));
  }

  return result;
}


/**
 * Overrides default `ClosureHandledWebsocketConfig` to write "REQUEST" and read `GameServer` JSON-formatted list.
 *
 * *Please note this class is exported for testing purpose only, you should not use it directly inside your code.*
 */
export class HubWebsocketConfig extends ClosureHandledWebsocketConfig<GameServer[]> {
  serializer: (value: GameServer[]) => WebSocketMessage;
  deserializer: (e: MessageEvent) => GameServer[];

  constructor(url: string, errorsService: RuntimeErrorsService) {
    super(url, errorsService);

    this.serializer = (value: GameServer[]): WebSocketMessage => {
      // Even if the value doesn't matter, it might be a misunderstanding if this class if a non-empty list is passed
      if (value.length !== 0) {
        console.warn('Arg triggering REQUEST to hub is a non-empty list');
      }

      console.log('Sends : ' + CHECKOUT_MESSAGE);
      return CHECKOUT_MESSAGE;
    };

    this.deserializer = (e: MessageEvent): GameServer[] => serversFromJsonString(e.data);
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

