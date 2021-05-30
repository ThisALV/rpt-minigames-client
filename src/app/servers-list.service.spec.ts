import { TestBed } from '@angular/core/testing';
import { ConnectionFactory, ServersListBusy, ServersListService } from './servers-list.service';
import { MonoTypeOperatorFunction, Observable, Subject } from 'rxjs';
import { GameServerResolutionService } from './game-server-resolution.service';
import { expectArrayToBeEqual, MockedMessagingSubject, unexpected } from './testing-helpers';
import { GameServer } from './game-server';
import { Availability } from 'rpt-webapp-client';


/**
 * Get an operator which blocks values from source until a value is passed to the `trigger` Subject. If a value is emitted by source
 * after trigger, then that value will be immediately passed to returned (or delayed) Observable.
 *
 * @param trigger Subject which is listening for a value to stop blocking values from source Observable
 *
 * @returns An operator blocking while `trigger` isn't passed a value
 */
function mockedDelay(trigger: Subject<undefined>): MonoTypeOperatorFunction<undefined> {
  // Returns the operators configured to work with given trigger Subject
  return (source: Observable<undefined>): Observable<undefined> => {
    let sourceEmitted = false; // Set when source emits a next value
    let triggered = false; // Set when trigger emits a next value

    const delayed = new Subject<undefined>(); // Will next a value only when triggered and sourceEmitted will be set

    trigger.subscribe({ // Listen for delay end to be triggered by external Subject
      next(): void {
        if (sourceEmitted) { // If a value is waiting to be passed, passes it immediately
          delayed.next();
        } else { // Else, wait a value to be passed, notifying it can be passed immediately since now
          triggered = true;
        }
      }
    });

    source.subscribe({
      next(): void {
        if (triggered) { // If delay has expired, passes value immediately
          delayed.next();
        } else { // Else, wait for delay to expires to pass value
          sourceEmitted = true;
        }
      }
    });

    return delayed;
  };
}


/**
 * @param latestConnectedUrl Every URL into which given subject `connection` connects to will be passed to that subject
 * @param connection Subject returned by returned factory
 */
function mockedConnectionFactory(latestConnectedUrl: Subject<string>, connection: MockedMessagingSubject): ConnectionFactory {
  return (currentServerUrl: string): Subject<string> => {
    // Keep a trace of every server which the subject connects to
    latestConnectedUrl.next(currentServerUrl);

    return connection;
  };
}


describe('ServersListService', () => {
  let service: ServersListService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GameServerResolutionService,
          useValue: {
            // Window not available for testing: emulates case where protocol is https and hostname is localhost
            resolve(port: number): string {
              if (port === 35557) { // Emulates an error for the server Bermudes #1
                throw new Error('Bad port');
              }

              return `wss://localhost:${port}/`;
            }
          }
        }
      ]
    });

    service = TestBed.inject(ServersListService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should update every server that respond without errors and in time, others have undefined availability', () => {
    const connectedUrls = new Subject<string>(); // next() call with latest connected URL as argument
    const connection = new MockedMessagingSubject(); // Will allow to receive desired messages and to check for messages sent by service
    const delayTrigger = new Subject<undefined>(); // Call next() to time out delay for current server

    let latestConnectedUrl: string | undefined; // Saves each connection URL for the subject to checks connection servers and order
    connectedUrls.subscribe({ next: (currentServerUrl: string) => latestConnectedUrl = currentServerUrl });

    let receivedServersStatus: GameServer[] | undefined;
    service.getListStatus().subscribe({ // Allow to check for status retrieved by servers once service update is done
      next: (serversStatus: GameServer[]) => receivedServersStatus = serversStatus,
      error: unexpected,
      complete: unexpected
    });

    expect(service.isUpdating()).toBeFalse(); // update() not called yet

    service.update(mockedConnectionFactory(connectedUrls, connection), mockedDelay(delayTrigger));
    expect(service.isUpdating()).toBeTrue();

    // Checks for the 1st server: wss://localhost:35555/, Açores #1
    expect(latestConnectedUrl).toEqual('wss://localhost:35555/');
    expectArrayToBeEqual(connection.sentMessagesQueue, 'CHECKOUT');
    connection.clear(); // Every sent messages has been checked, can resets queue now
    connection.receive('AVAILABILITY 0 2'); // Emulates STATUS response in the case of server with no players connected
    connection.open(); // Re-open connection for the next server

    /*
     * Checks for the next server, and so on...
     */

    // Checks for the 2nd server: wss://localhost:35556/, Açores #2
    expect(latestConnectedUrl).toEqual('wss://localhost:35556/');
    expectArrayToBeEqual(connection.sentMessagesQueue, 'CHECKOUT');
    connection.clear();
    delayTrigger.next(); // But response is received after time out...
    connection.receive('AVAILABILITY 0 2'); // ...it will be ignored
    connection.open();

    // Checks for the 3rd server: wss://localhost:35557/, Bermudes #1
    expect(latestConnectedUrl).toEqual('wss://localhost:35557/');
    expectArrayToBeEqual(connection.sentMessagesQueue); // Connection failed, no CHECKOUT could have been sent
    connection.open();

    // Checks for the 4th server: wss://localhost:35558/, Bermudes #2
    expect(latestConnectedUrl).toEqual('wss://localhost:35558/');
    expectArrayToBeEqual(connection.sentMessagesQueue, 'CHECKOUT');
    connection.clear();
    connection.receive('AVAILABILITY 2 2');
    connection.open();

    // Checks for the 5th server: wss://localhost:35559/, Canaries #1
    expect(latestConnectedUrl).toEqual('wss://localhost:35559/');
    expectArrayToBeEqual(connection.sentMessagesQueue, 'CHECKOUT');
    connection.clear();
    connection.receive('AVAILABILITY 1 2');
    connection.open();

    // Checks for the 6th server: wss://localhost:35560/, Canaries #2
    expect(latestConnectedUrl).toEqual('wss://localhost:35560/');
    expectArrayToBeEqual(connection.sentMessagesQueue, 'CHECKOUT');
    connection.clear();
    connection.receive('I AM ERROR'); // Will not be able to handle this, connection will be closed

    // Update should be done & complete at that point, array should have been passed to subject
    expect(service.isUpdating()).toBeFalse();
    expect(receivedServersStatus).toBeDefined();
    // 3 of 6 servers status fully retrieved expected, Açores #2, Bermudes #1 and Canaries #2 are incomplete because of a
    // timeout, connection and checkout errors respectively
    expectArrayToBeEqual(receivedServersStatus as GameServer[],
      new GameServer('Açores #1', 'a', new Availability(0, 2)),
      new GameServer('Açores #2', 'a'),
      new GameServer('Bermudes #1', 'b'),
      new GameServer('Bermudes #2', 'b', new Availability(2, 2)),
      new GameServer('Canaries #1', 'c', new Availability(1, 2)),
      new GameServer('Canaries #2', 'c'),
    );
  });

  it('should not be able to update concurrently', () => {
    // Starts a 1st update, params doesn't matter we just test if it is not possible to call it twice
    service.update(mockedConnectionFactory(new Subject<string>(), new MockedMessagingSubject()));
    // Try a concurrent update while the other one is certainly still waiting for a server response
    expect(() => service.update(mockedConnectionFactory(new Subject<string>(), new MockedMessagingSubject())))
      .toThrowError(ServersListBusy);
  });
});
