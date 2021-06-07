import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ServersListComponent } from './servers-list.component';
import { GameServer } from '../game-server';
import { Observable, Subject } from 'rxjs';
import { Availability, RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { ServersListService } from '../servers-list.service';
import { SHARED_CONNECTION_FACTORY } from '../game-server-connection';
import { MockedMessagingSubject, unexpected } from '../testing-helpers';
import { GameServerResolutionService } from '../game-server-resolution.service';


/// `MockedServersListProvided` initially provides this array with its `getListStatus()` mocked method
const SERVERS: GameServer[] = [
  new GameServer('Açores #1', 'a', new Availability(1, 2)),
  new GameServer('Açores #2', 'a', new Availability(1, 2)),
  new GameServer('Bermudes #1', 'b', new Availability(2, 2)),
  new GameServer('Bermudes #2', 'b'),
  new GameServer('Canaries #1', 'c', new Availability(0, 2)),
  new GameServer('Canaries #2', 'c'),
];


/// Mocks ServersListService to always provides a predetermined GameServer array into getListStatus() when update() is called
class MockedServersListProvider {
  /// Must be reset for each instance as its content could be modified for testing purposes
  readonly providedServers: GameServer[];

  private readonly serversList: Subject<GameServer[]>;

  /// Initializes `providesServers` with `SERVERS` default array
  constructor() {
    this.providedServers = SERVERS;
    this.serversList = new Subject<GameServer[]>();
  }

  /// Provides `providedServers` when `update()` is called
  getListStatus(): Observable<GameServer[]> {
    return this.serversList;
  }

  /// Provides `providedServers` to `getListStatus()`
  update(): void {
    this.serversList.next(this.providedServers);
  }
}


describe('ServersListComponent', () => {
  let mockedServersListService: MockedServersListProvider; // Used to control data provided to the component
  let rptlProtocol: RptlProtocolService; // Used to check for connection to have been done and for session to have begun successfully
  let component: ServersListComponent;
  let fixture: ComponentFixture<ServersListComponent>;

  let connection: MockedMessagingSubject; // Mocked connection returned by spied rptlConnectionFor()
  let latestConnectedUrl: string | undefined; // Last URL argument gave to spied rptlConnectionFor()


  beforeEach(async () => {
    mockedServersListService = new MockedServersListProvider();
    connection = new MockedMessagingSubject();

    // Mocks connection to keep trace of latest required game server URL, then return an accessible mocked connection
    spyOn(SHARED_CONNECTION_FACTORY, 'rptlConnectionFor').and.callFake((serverUrl: string): Subject<string> => {
      latestConnectedUrl = serverUrl;
      return connection;
    });

    // Initializes component decorator
    await TestBed.configureTestingModule({
      declarations: [ ServersListComponent ],
      providers: [
        { // Uses pre-determined servers status
          provide: ServersListService,
          useValue: mockedServersListService
        },
        {
          provide: GameServerResolutionService,
          useValue: {
            // Window not available for testing: emulates case where protocol is https and hostname is localhost
            resolve: (port: number): string => `wss://localhost:${port}/`
          }
        }
      ]
    }).compileComponents();

    // Gives access to current RPTL mode (unregistered/registered)
    rptlProtocol = TestBed.inject(RptlProtocolService);

    // Begins event/binding detection cycle and provides the component from unit test configuration
    fixture = TestBed.createComponent(ServersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with updated game servers list', waitForAsync(() => {
    expect(component).toBeTruthy();

    // When initialization updating is done, every listed server should be listed by component
    fixture.whenStable().then(() => expect(component.serversStatus).toEqual(SERVERS));
  }));

  describe('checkout()', () => {
    it('should update game servers list with new provided data', waitForAsync(() => {
      const newStatus: GameServer[] = SERVERS; // Modified list saved for further assertion
      // Initializes retrieved data replacement
      newStatus[1] = new GameServer('Hello world!', 'c');
      newStatus[5] = new GameServer('Açores #3', 'a', new Availability(2, 2));

      // Updates retrieved data
      mockedServersListService.providedServers[1] = newStatus[1];
      mockedServersListService.providedServers[5] = newStatus[5];

      component.checkout(); // Updates current list
      fixture.whenStable().then(() => expect(component.serversStatus).toEqual(newStatus)); // Expects for list to follow changes
    }));
  });

  describe('select()', () => {
    it('should connect to selected server and begin RPTL session with that connection', waitForAsync(() => {
      let latestState: RptlState | undefined;
      rptlProtocol.getState().subscribe({ // The first thing select() should do is to connect with RPTL protocol
        next: (state: RptlState) => latestState = state,
        complete: unexpected,
        error: unexpected
      });

      // Connects to the 3rd game server
      component.select('Bermudes #1');

      fixture.whenStable().then(() => {
        expect(latestState).toEqual(RptlState.UNREGISTERED); // RPTL session should have begun because we should be connected to server
        expect(latestConnectedUrl).toEqual('wss://localhost:35557/'); // Expected server we connect with to be the 3dr game server
      });
    }));
  });
});
