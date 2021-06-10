import { Injectable } from '@angular/core';
import { servers } from './servers.json';
import { Availability, RptlProtocolService } from 'rpt-webapp-client';
import { MonoTypeOperatorFunction, Observable, Subject } from 'rxjs';
import { GameServerResolutionService } from './game-server-resolution.service';
import { GameServer } from './game-server';
import { RuntimeErrorsService } from './runtime-errors.service';
import { delay } from 'rxjs/operators';
import { ServerStatusService } from './server-status.service';


/**
 * Thrown by `update()` method if an other call has been performed but there is still at least one server status to retrieve.
 */
export class ServersListBusy extends Error {
  constructor() {
    super('Already updating servers list');
  }
}


/**
 * Used by `ServersListService.update()` to create connection with each server in the list using its URL and runtime errors handler
 */
export type ConnectionFactory = (currentServerUrl: string, errorsHandler: RuntimeErrorsService) => Subject<string>;


/**
 * Connects and performs an RPTL checkout on each service listed inside `servers.json` file, then provides data for status response
 * from current HTTPS server.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class ServersListService {
  private currentServer?: number; // Index of server which is currently waiting a status, if any
  private readonly serversStatus: Subject<GameServer[]>;

  /**
   * Constructs a service which is not waiting for server status and without any retrieved status for now.
   *
   * @param rptlProtocol Protocol to send CHECKOUT commands with
   * @param urlProvider Get WS URL for game servers using this service
   * @param statusProvider Service to perform checkout operation on each service one-by-one
   * @param errorHandler Errors when trying to establish connection with the next game server
   */
  constructor(private readonly rptlProtocol: RptlProtocolService,
              private readonly urlProvider: GameServerResolutionService,
              private readonly statusProvider: ServerStatusService,
              private readonly errorHandler: RuntimeErrorsService)
  {
    this.serversStatus = new Subject<GameServer[]>();
  }

  // Called recursively and asynchronously while every server status hasn't been retrieved
  private updateNext(connection: ConnectionFactory,
                     delayPipeOperator: MonoTypeOperatorFunction<undefined>,
                     updatedStatus: GameServer[] = []): void
  {
    // If every server status has been updated, marks update as done, pushes new status inside subject then stops async recursion
    if (this.currentServer === servers.length) {
      this.currentServer = undefined;
      this.serversStatus.next(updatedStatus);
    } else { // If there is another server status to update, sends CHECKOUT command and saves response inside array for recursion
      const currentServerData = servers[(this.currentServer as number)++];
      const currentServerUrl = this.urlProvider.resolve(currentServerData.port);

      const context: ServersListService = this;
      // The next checkout operation result will be pushed into recursively passed results array
      this.statusProvider.getNextResponse().subscribe({
        next(status?: Availability): void {
          // Makes recursive call to the next game server
          context.updateNext(connection, delayPipeOperator, updatedStatus.concat(
            new GameServer(currentServerData.name, currentServerData.game, status)
          ));
        }
      });

      // Performs checkout operation
      this.statusProvider.checkout(connection(currentServerUrl, this.errorHandler), delayPipeOperator);
    }
  }

  /**
   * @returns `true` if service is currently waiting for at least one server status, `false` otherwise
   */
  isUpdating(): boolean {
    return this.currentServer !== undefined; // No server index means nothing to update
  }

  /**
   * Sends a CHECKOUT command and listen for STATUS response for each listed serve, one by one, then publish new servers status array
   * which can be obtained using `getListStatus()`.
   *
   * @param connection Stream required by underlying RPTL protocol to communicate with server
   * @param delayPipeOperator When the `Observable<undefined>` returned by this operator next a new `undefined` value, a server checkout
   * times out and the process go to the next server, considering current server as not working
   *
   * @throws ServersListBusy if another update operation is still running but no new array has been passed to subject yet
   */
  update(connection: ConnectionFactory, delayPipeOperator: MonoTypeOperatorFunction<undefined> = delay(500)): void {
    if (this.isUpdating()) { // Can't handle 2 recursive updates at the same time
      throw new ServersListBusy();
    }

    // Initializes servers status update
    this.currentServer = 0; // Beginning with the first server to be listed
    this.updateNext(connection, delayPipeOperator);
  }

  /**
   * @returns `Observable` of `GameServer` array containing in list order user-useful data for each game server.
   */
  getListStatus(): Observable<GameServer[]> {
    return this.serversStatus;
  }
}
