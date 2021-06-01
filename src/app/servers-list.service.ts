import { Injectable } from '@angular/core';
import { servers } from './servers.json';
import { Availability, RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { MonoTypeOperatorFunction, Observable, of, race, Subject } from 'rxjs';
import { GameServerResolutionService } from './game-server-resolution.service';
import { GameServer } from './game-server';
import { RuntimeErrorsService } from './runtime-errors.service';
import { delay, filter, first, mapTo } from 'rxjs/operators';


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
 * @param source Observable to filter
 *
 * @returns Observable emitting only the first callback invoked by `source`, no matter if it is `next`, `complete` or `error`
 */
function firstCallback<T>(source: Observable<T>): Observable<T> {
  const filtered = new Subject<T>();

  let callbackInvoked = false; // Will be set to true by any source callback

  // Each callback checks if it is the first to be called. If and only if it is the case, it will pass the call to the filtered Subject
  // corresponding method and notifies that no more callback should be passed through filtered Subject
  function passOnce(callback: () => void): void {
    if (!callbackInvoked) {
      callbackInvoked = true;
      callback();
    }
  }

  source.subscribe({
    next(value?: T): void {
      passOnce(() => filtered.next(value));
    },

    error(err: any): void {
      passOnce(() => filtered.error(err));
    },

    complete(): void {
      passOnce(() => filtered.complete());
    }
  });

  return filtered;
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
          this.updateNext(connection, delayPipeOperator, updatedStatus.concat(definitiveServerData));
        }
      });

      // Will emits if catch block is executed
      const errorOccurred = new Subject<boolean>();
      try { // Uncaught errors for current server must NOT block following servers to be tested
        // Tries to connect to server parsing current URL connecting with user-provided facility
        const serverConnection = connection(currentServerUrl, this.runtimeErrors);

        // Will emits true informing us that connect operation succeeded as soon as RPTL connection is done
        const connectionDone: Observable<boolean> = this.rptlProtocol.getState().pipe(first(), filter(
          (newState: RptlState) => newState === RptlState.UNREGISTERED
          ), mapTo(true)
        );

        const context: ServersListService = this;
        // If an error is thrown before connection has been done, we must not be waiting for another RPTL connection
        race(errorOccurred, connectionDone).subscribe({
          next(connected: boolean): void {
            if (!connected) { // Checks for which observable emitted the first, if it is errorOccurred, then we cannot obtain status
              retrievedStatus.next(undefined);
              return;
            }

            // If disconnected before AVAILABILITY command is received, then status observable is errored or completed so status is
            // undefined because it hasn't been received
            context.rptlProtocol.getStatus().pipe(firstCallback).subscribe({
              next: (receivedStatus: Availability): void => retrievedStatus.next(receivedStatus),
              error: () => retrievedStatus.next(undefined),
              complete: () => retrievedStatus.next(undefined)
            });

            // Sends the CHECKOUT command to get an AVAILABILITY command as a response
            context.rptlProtocol.updateStatusFromServer();
          }
        });

        this.rptlProtocol.beginSession(serverConnection);
      } catch (err: any) {
        // Logs uncaught error
        this.runtimeErrors.throwError(err.message);
        console.error(err);

        // Notifies an error has been thrown to avoid being still waiting for RPTL connection after function exits and considers status
        // as undefined for current server
        errorOccurred.next(false);
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
