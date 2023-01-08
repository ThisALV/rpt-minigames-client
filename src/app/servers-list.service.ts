import { Injectable } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { GameServer } from './game-server';
import { RuntimeErrorsService } from './runtime-errors.service';


/**
 * Thrown by `update()` method if an other call has been performed but there is still at least one server status to retrieve.
 */
export class InvalidListeningState extends Error {
  /**
   * @param shouldListen Set this to `true` if the `ServersListService` was supposed to be listening for this operation to work, `false`
   * otherwise
   */
  constructor(shouldListen: boolean) {
    super((shouldListen ? 'Service should be listening' : 'Service should not be listening') + ' for this operation');
  }
}


/**
 * Connects to a hub server which sends to us JSON data about servers list and their state any time it is updated or any time we ask for it.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class ServersListService {
  // Assigned when listen operation is running and we're waiting for JSON data
  private hubConnection?: Subject<GameServer[]>; // Used to listen incoming messages or WSS events and to send request message
  private responseSubscription?: Subscription; // Used to stop listen operation

  private readonly serversStatus: Subject<GameServer[]>;

  /**
   * Constructs a service which is not waiting for servers list status and without any retrieved status for now.
   *
   * @param errorHandler Errors when trying to establish connection with the next game server
   */
  constructor(private readonly errorHandler: RuntimeErrorsService) {
    this.serversStatus = new Subject<GameServer[]>();
  }

  /**
   * @returns `true` if service is observing JSON data from the hub with the provided connection
   */
  isListening(): boolean {
    return this.responseSubscription !== undefined; // A subscription to a WSS stream means we're listening it
  }

  /**
   * Waits for JSON servers array to be received from the hub using the given WSS connection. When it starts listening hub, a checkout
   * request message is sent to ensure it initializes the servers list for the 1st time.
   *
   * @param connection Stream required by underlying WSS protocol to communicate with hub
   *
   * @throws InvalidListeningState if we're already listening for new servers list
   */
  listen(connection: Subject<GameServer[]>): void {
    if (this.isListening()) { // Can't handle 2 subscriptions at the same time
      throw new InvalidListeningState(false);
    }

    const context: ServersListService = this;
    this.responseSubscription = connection.subscribe({
      next(serversList: GameServer[]): void {
        // Each new data received and parsed is published to the service subject
        context.serversStatus.next(serversList);
      },
      error(err: any): void {
        // If any WebSocket usage error occurs on this connection, then it's useless to wait for response
        context.errorHandler.throwError(err.message); // Logging the WebSocket error
        context.stopListening();
      },
      complete(): void {
        // Connection closed, operation must terminate without result
        context.stopListening();
      }
    });

    this.hubConnection = connection; // Stores connection, will use it to send request message later
    // this.requestUpdate(); // So we don't need a server update to get a servers list at the beginning
  }

  /**
   * Stops listening for JSON data from the current connection with hub.
   *
   * @throws InvalidListeningState if we weren't listening for new servers list
   */
  stopListening(): void {
    if (!this.isListening()) { // Ensure this method is only called if we're listening to something
      throw new InvalidListeningState(true);
    }

    // No longer observing servers list, remove subscription to signal we're no longer listening
    this.hubConnection = undefined;
    this.responseSubscription?.unsubscribe();
    this.responseSubscription = undefined;
  }

  /**
   * Sends a request message to receive an updated servers list right now.
   *
   * @throws InvalidListeningState if we're not connected and listening to a hub right now
   */
  requestUpdate(): void {
    if (!this.isListening()) { // Cannot update if no hub can provide data
      throw new InvalidListeningState(true);
    }

    this.hubConnection?.next([]); // Empty array to send REQUEST message using hub connection serializer
  }

  /**
   * @returns `Observable` of `GameServer` array containing in list order user-useful data for each game server.
   */
  getListStatus(): Observable<GameServer[]> {
    return this.serversStatus;
  }
}
