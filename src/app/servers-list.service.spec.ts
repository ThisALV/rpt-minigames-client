import { TestBed } from '@angular/core/testing';
import { ConnectionFactory, ServersListBusy, ServersListService } from './servers-list.service';
import { Observable, Subject } from 'rxjs';
import { GameServerResolutionService } from './game-server-resolution.service';
import { expectArrayToBeEqual, mockedDelay, MockedMessagingSubject, unexpected } from './testing-helpers';
import { GameServer } from './game-server';
import { Availability } from 'rpt-webapp-client';
import { CheckoutResponse, ServerStatusService } from './server-status.service';


/**
 * Mocks `ServerStatusService` to make `getNextResponse()` providing status assigned to the next element inside `operationResults` queue
 * when `checkout()` is called.
 *
 * It can be stopped using the `stopped` field, if so `checkout()` will no longer passes new value.
 */
class MockedServerStatusProvider {
  readonly operationResults: CheckoutResponse[];
  stopped: boolean;

  private readonly currentOperationResult: Subject<CheckoutResponse>;
  private currentResult: number;

  constructor() {
    this.operationResults = [ // Default results mock configuration used for unit testing
      new Availability(0, 2),
      undefined,
      undefined,
      new Availability(2, 2),
      new Availability(1, 2),
      undefined
    ];

    this.currentResult = 0; // Begins from the first configured and mocked checkout result
    this.stopped = false;
    this.currentOperationResult = new Subject<CheckoutResponse>();
  }

  /// Retrieves configured results when `checkout()` is called.
  getNextResponse(): Observable<CheckoutResponse> {
    return this.currentOperationResult;
  }

  /// Pushes next configured result inside queue into retrieved subject, if and only if this service isn't stopped
  checkout(): void {
    if (!this.stopped) {
      this.currentOperationResult.next(this.operationResults[this.currentResult++]);
    }
  }
}


/**
 * @param serverUrls Every connection inside `connections` will saves URL of mocked server into this array at the same index of current
 * mocked connection
 * @param connections Queue of subjects returned, the next subject will be provided to for connection to the next server inside service
 * servers list
 */
function mockedConnectionFactory(serverUrls: string[], connections: MockedMessagingSubject[]): ConnectionFactory {
  let currentConnection = 0;

  return (currentServerUrl: string): Subject<string> => {
    // Keep a trace of every server which the subject connects to
    serverUrls[currentConnection] = currentServerUrl;
    // Provides current mocked connection subject
    const providedMock = connections[currentConnection];

    // Go for the next subject to provide for connection mocking. RptlProtocolService requires different subjects so mocking with only
    // one subject doesn't work
    currentConnection++;

    return providedMock;
  };
}


/**
 * @param count Required number of default constructed `MockedMessagingSubject`
 *
 * @returns An array containing `count` default constructed `MockedMessagingSubject`
 */
function mockedConnections(count: number): MockedMessagingSubject[] {
  const connections: MockedMessagingSubject[] = [];

  // Because subject must be a different instance, we cannot use fill()
  for (let i = 0; i < count; i++) {
    connections.push(new MockedMessagingSubject());
  }

  return connections;
}


describe('ServersListService', () => {
  let service: ServersListService;
  let statusProvider: MockedServerStatusProvider; // Used to block the updating process to launch concurrent updates for the last unit test

  beforeEach(() => {
    statusProvider = new MockedServerStatusProvider(); // Instance must be directly accessible to use the stopped field

    TestBed.configureTestingModule({
      providers: [
        {
          provide: GameServerResolutionService,
          useValue: {
            // Window not available for testing: emulates case where protocol is https and hostname is localhost
            resolve: (port: number): string => `wss://localhost:${port}/`
          }
        },
        { // We can custom individuals servers result
          provide: ServerStatusService,
          useValue: statusProvider
        }
      ]
    });

    service = TestBed.inject(ServersListService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should checkout every server recursively then update status list', () => {
    const serverUrls: string[] = new Array<string>(6); // URL for each mocked connection will be saved here
    const connections = mockedConnections(6); // Will allow to 6 different mocked connections and saves connected with URL into array
    const delayTrigger = new Subject<undefined>(); // Call next() to time out delay for current server

    let receivedServersStatus: GameServer[] | undefined;
    service.getListStatus().subscribe({ // Allow to check for status retrieved by servers once service update is done
      next: (serversStatus: GameServer[]) => receivedServersStatus = serversStatus,
      error: unexpected,
      complete: unexpected
    });

    service.update(mockedConnectionFactory(serverUrls, connections), mockedDelay(delayTrigger));

    // Checks for all game server to have been resolved using the appropriate port in the right order
    // Comparing with the list of expected connected URLs:
    expectArrayToBeEqual(serverUrls,
      'wss://localhost:35555/',
      'wss://localhost:35556/',
      'wss://localhost:35557/',
      'wss://localhost:35558/',
      'wss://localhost:35559/',
      'wss://localhost:35560/'
    );

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
    // Stops it so update doesn't finish immediately and we can start a concurrent update which should fail
    statusProvider.stopped = true;
    // Starts a 1st update, params doesn't matter we just test if it is not possible to call it twice
    service.update(mockedConnectionFactory(new Array<string>(6), mockedConnections(6)));
    // Try a concurrent update while the other one is certainly still waiting for a server response
    expect(() => service.update(mockedConnectionFactory(new Array<string>(6), mockedConnections(6))))
      .toThrowError(ServersListBusy);
  });
});
