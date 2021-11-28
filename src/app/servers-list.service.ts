import { Injectable } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { GameServer } from './game-server';
import { RuntimeErrorsService } from './runtime-errors.service';


/**
 * Thrown by `update()` method if an other call has been performed but there is still at least one server status to retrieve.
 */
export class ServersListBusy extends Error {
  constructor() {
    super('Already updating servers list');
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
  private updating: boolean;
  private responseSubscription?: Subscription; // Assigned when update operation is running and we're waiting for JSON data

  private readonly serversStatus: Subject<GameServer[]>;

  /**
   * Constructs a service which is not waiting for servers list status and without any retrieved status for now.
   *
   * @param errorHandler Errors when trying to establish connection with the next game server
   */
  constructor(private readonly errorHandler: RuntimeErrorsService) {
    this.updating = false;
    this.serversStatus = new Subject<GameServer[]>();
  }

  /**
   * Sets `updating` flag to `false`, pushes given value into service subject if it is not `undefined` and stop listening for incoming
   * response so we don't handle message for further operations.
   */
  private terminate(newServersList?: GameServer[]): void {
    this.updating = false;

    if (newServersList !== undefined) {
      this.serversStatus.next(newServersList);
    }

    this.responseSubscription?.unsubscribe();
    this.responseSubscription = undefined;
  }

  /**
   * @returns `true` if service has sent a `REQUEST` and is waiting for a JSON servers array response
   */
  isUpdating(): boolean {
    return this.updating;
  }

  /**
   * Sends a `REQUEST` message to hub connected with `connection`, and wait for its JSON game servers array response.
   *
   * @param connection Stream required by underlying WSS protocol to communicate with hub
   *
   * @throws ServersListBusy if another update operation is still running but no new array has been passed to subject yet
   */
  update(connection: Subject<GameServer[]>): void {
    if (this.isUpdating()) { // Can't handle 2 updates at the same time
      throw new ServersListBusy();
    }

    this.updating = true; // Now we're updating
    connection.next([]); // Empty array to send REQUEST message to hub

    const context: ServersListService = this;
    this.responseSubscription = connection.subscribe({
      next(serversList: GameServer[]): void {
        // Terminates with the received and parsed result
        context.terminate(serversList);
      },
      error(err: any): void {
        // If any WebSocket usage error occurs on this connection, then it's useless to wait for response
        context.errorHandler.throwError(err.message); // Logging the WebSocket error

        context.terminate(); // Terminates with no valid result obtained from the hub
      },
      complete(): void {
        // Connection closed, operation must terminate without result
        context.terminate();
      }
    });
  }

  /**
   * @returns `Observable` of `GameServer` array containing in list order user-useful data for each game server.
   */
  getListStatus(): Observable<GameServer[]> {
    return this.serversStatus;
  }
}
