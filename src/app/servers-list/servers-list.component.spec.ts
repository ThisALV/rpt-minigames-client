import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ServersListComponent } from './servers-list.component';
import { GameServer } from '../game-server';
import { Subject } from 'rxjs';
import { Availability, RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { ServersListService } from '../servers-list.service';
import { SHARED_CONNECTION_FACTORY } from '../game-server-connection';
import { expectArrayToBeEqual, MockedMessagingSubject, MockedServersListProvider, DEFAULT_MOCKED_SERVERS, unexpected } from '../testing-helpers';
import { GameServerResolutionService } from '../game-server-resolution.service';


/// `MockedMessagingSubject` expect that `complete()` does nothing until and `actuallyComplete()` calls `super.complete()`.
class DeferredCompletionConnection extends MockedMessagingSubject {
  completeCalled: boolean;

  constructor() {
    super();
    this.completeCalled = false;
  }

  complete(): void {
    this.completeCalled = true;
  }

  actuallyComplete(): void {
    super.complete();
  }
}


describe('ServersListComponent', () => {
  let mockedServersListService: MockedServersListProvider; // Used to control data provided to the component
  let rptlProtocol: RptlProtocolService; // Used to check for connection to have been done and for session to have begun successfully
  let component: ServersListComponent;
  let fixture: ComponentFixture<ServersListComponent>;

  let connection: DeferredCompletionConnection; // Mocked connection returned by spied rptlConnectionFor()
  let secondConnection: DeferredCompletionConnection; // Mocked connection used if the first one has already been used and stopped
  let latestConnectedUrl: string | undefined; // Last URL argument gave to spied rptlConnectionFor()


  beforeEach(async () => {
    mockedServersListService = new MockedServersListProvider();
    connection = new DeferredCompletionConnection();
    secondConnection = new DeferredCompletionConnection();

    // Resets connection URL for each new unit test case
    latestConnectedUrl = undefined;

    // Mocks connection to keep trace of latest required game server URL, then return an accessible mocked connection
    spyOn(SHARED_CONNECTION_FACTORY, 'rptlConnectionFor').and.callFake((serverUrl: string): Subject<string> => {
      latestConnectedUrl = serverUrl;

      if (connection.isStopped) { // If a first game server has already been connected...
        return secondConnection; // ...then we go for the second connection
      } else {
        return connection;
      }
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

  it('should create component with updated game servers list and without any selected one', waitForAsync(() => {
    expect(component).toBeTruthy();

    // No game server is selected at the beginning of the component lifecycle
    expect(component.selectedServerName).toBeUndefined();
    // When initialization updating is done, every listed server should be listed by component
    fixture.whenStable().then(() => expect(component.serversStatus).toEqual(DEFAULT_MOCKED_SERVERS));
  }));

  describe('checkout()', () => {
    it('should update game servers list with new provided data', waitForAsync(() => {
      const newStatus: GameServer[] = DEFAULT_MOCKED_SERVERS; // Modified list saved for further assertion
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
    let stateLogging: RptlState[]; // Both unit test cases will require to check for the RptlState history

    beforeEach(() => {
      stateLogging = []; // Resets history for current test

      rptlProtocol.getState().subscribe({ // Provides current RPTL state for each unit test case
        next: (state: RptlState) =>  stateLogging.push(state),
        complete: unexpected,
        error: unexpected
      });
    });

    it('should connect to selected server and begin RPTL session with that connection', waitForAsync(() => {
      // Connects to the 3rd game server
      component.select('Bermudes #1');
      expect(component.selectedServerName).toEqual('Bermudes #1');

      expectArrayToBeEqual(stateLogging, RptlState.UNREGISTERED); // Client should have been connected with server
      expect(latestConnectedUrl).toEqual('wss://localhost:35557/'); // Expected server we connect with to be the 3dr game server
    }));

    it('should disconnect from previous connected game server if any, then begin a new session', waitForAsync(() => {
      // Connects to a first game server
      component.select('Bermudes #2');
      expect(component.selectedServerName).toEqual('Bermudes #2');

      // Connects to a second server which should disconnected us from the first
      component.select('Açores #1');
      expectArrayToBeEqual(stateLogging, RptlState.UNREGISTERED); // At this point, we should have been connected to the 1st server
      expect(connection.completeCalled).toBeTrue(); // compete() should have been called as session end should have been asked for

      connection.actuallyComplete(); // Now really closes the connection, so a new session should begin
      fixture.whenStable().then(() => {
        // Client should have been disconnected from the first server before and now it is finally connected to the second one
        expectArrayToBeEqual(stateLogging, RptlState.UNREGISTERED, RptlState.DISCONNECTED, RptlState.UNREGISTERED);
        expect(latestConnectedUrl).toEqual('wss://localhost:35555/'); // The last selected server is the first inside list
        expect(component.selectedServerName).toEqual('Açores #1');
      });
    }));
  });
});
