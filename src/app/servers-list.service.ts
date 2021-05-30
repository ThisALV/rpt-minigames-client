import { Injectable } from '@angular/core';
import { servers } from './servers.json';
import { RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { MonoTypeOperatorFunction, Observable, of, race, Subject } from 'rxjs';
import { GameServerResolutionService } from './game-server-resolution.service';
import { GameServer } from './game-server';
import { rptlConnectionFor } from './game-server-connection';
import { RuntimeErrorsService } from './runtime-errors.service';
import { delay, find } from 'rxjs/operators';
import { Availability } from 'rpt-webapp-client/lib/availability';


/**
 * Thrown by `update()` method if an other call has been performed but there is still at least one server status to retrieve.
 */
export class ServersListBusy extends Error {
  constructor() {
    super('Already updating servers list');
  }
}


/**
 * Connects and sends a checkout RPTL command to each service listed inside `servers.json` file, then provides data for status response
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
   * @param runtimeErrors Errors during status update are reported through this serice
   */
  constructor(private readonly rptlProtocol: RptlProtocolService,
              private readonly urlProvider: GameServerResolutionService,
              private readonly runtimeErrors: RuntimeErrorsService)
  {
    this.serversStatus = new Subject<GameServer[]>();
  }

  // Called recursively and asynchronously while every server status hasn't been retrieved
  private updateNext(delayPipeOperator: MonoTypeOperatorFunction<undefined>, updatedStatus: GameServer[] = []): void {
    // If every server status has been updated, marks update as done, pushes new status inside subject then stops async recursion
    if (this.currentServer === servers.length) {
      this.currentServer = undefined;
      this.serversStatus.next(updatedStatus);
    } else { // If there is another server status to update, sends CHECKOUT command and saves response inside array for recursion
      const currentServerData = servers[(this.currentServer as number)++];
      const currentServerUrl = this.urlProvider.resolve(currentServerData.port);
      // A value will be pushed if status is successfully retrieved from server
      const retrievedStatus = new Subject<Availability>();

      // If delay operator next() before a value is available for retrieved status, then undefined will be transmitted meaning that no
      // status has been obtained from server
      // An undefined value might also be passed to retrieved status meaning that an error occurred and server checkout failed, in
      // both cases, undefined should be assigned as-it inside the GameServer of the array
      race(of(undefined).pipe(delayPipeOperator), retrievedStatus).subscribe({
        next: (serverStatus?: Availability) => {
          // In any case, no session should be still running after that operation or RptlProtocolService would no longer be available
          if (this.rptlProtocol.isSessionRunning()) {
            this.rptlProtocol.endSession();
          }

          // Final server status after having tried to obtain status from server
          const definitiveServerData = new GameServer(currentServerData.name, currentServerData.game, serverStatus);
          // A new server status has been defined, go to next server
          this.updateNext(delayPipeOperator, updatedStatus.concat(definitiveServerData));
        }
      });

      try { // Uncaught errors for current server must NOT block following servers to be tested
        // Connects to evaluated game server URL, reporting any WS error through service errors handler
        const serverConnection = rptlConnectionFor(currentServerUrl, this.runtimeErrors);

        const context: ServersListService = this;
        // As soon as RPTL connection is done (not registered, just connected), begin CHECKOUT sending and response handling
        this.rptlProtocol.getState().pipe(find((newState: RptlState) => newState === RptlState.UNREGISTERED)).subscribe({
          next(): void {
            // As soon as STATUS command is received as a response, pushes value into retrieved status
            context.rptlProtocol.getStatus().subscribe({
              next: (serverStatus: Availability) => retrievedStatus.next(serverStatus)
            });

            // Sends the CHECKOUT command to get a STATUS command as a response
            context.rptlProtocol.updateStatusFromServer();
          }
        });

        this.rptlProtocol.beginSession(serverConnection);
      } catch (err: any) {
        // Logs uncaught error
        this.runtimeErrors.throwError(err.message);
        console.error(err);

        // Manually stops waiting for a response, ensures that race subscriber next() callback is called, so we can put connection close
        // code there
        retrievedStatus.next(undefined);
      }
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
   * @param delayPipeOperator When the `Observable<undefined>` returned by this operator next a new `undefined` value, a server checkout
   * times out and the process go to the next server, considering current server as not working
   */
  update(delayPipeOperator: MonoTypeOperatorFunction<undefined> = delay(500)): void {
    if (this.isUpdating()) { // Can't handle 2 recursive updates at the same time
      throw new ServersListBusy();
    }

    // Initializes servers status update
    this.currentServer = 0; // Beginning with the first server to be listed
    this.updateNext(delayPipeOperator);
  }

  /**
   * @returns `Observable` of `GameServer` array containing in list order user-useful data for each game server.
   */
  getListStatus(): Observable<GameServer[]> {
    return this.serversStatus;
  }
}
