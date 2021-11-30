import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ServersListComponent } from './servers-list.component';
import { GameServer } from '../game-server';
import { Subject } from 'rxjs';
import { Availability, RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { SHARED_CONNECTION_FACTORY } from '../game-server-connection';
import { expectArrayToBeEqual, GenericMockedMessagingSubject, MockedMessagingSubject, unexpected } from '../testing-helpers';
import { GameServerResolutionService } from '../game-server-resolution.service';
import { MinigameService } from '../minigame.service';
import { MinigameType } from '../minigame-enums';
import { SHARED_HUB_CONNECTION_FACTORY } from '../hub-connection';


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
  let rptlProtocol: RptlProtocolService; // Used to check for connection to have been done and for session to have begun successfully
  let minigame: MinigameService; // Used to check for current RpT Minigame if it matches with selected game server
  let component: ServersListComponent;
  let fixture: ComponentFixture<ServersListComponent>;

  let connection: DeferredCompletionConnection; // Mocked connection returned by spied rptlConnectionFor()
  let secondConnection: DeferredCompletionConnection; // Mocked connection used if the first one has already been used and stopped
  let latestConnectedUrl: string | undefined; // Last URL argument gave to spied rptlConnectionFor()

  let hubConnectionStream: GenericMockedMessagingSubject<GameServer[]>; // Connection provided by mocked hubConnectionFor method

  beforeEach(async () => {
    connection = new DeferredCompletionConnection();
    secondConnection = new DeferredCompletionConnection();

    // Resets connection URL for each new unit test case
    latestConnectedUrl = undefined;

    // Resets connection used to mock hub behavior
    hubConnectionStream = new GenericMockedMessagingSubject<GameServer[]>();

    // Mocks connection to keep trace of latest required game server URL, then return an accessible mocked connection
    spyOn(SHARED_CONNECTION_FACTORY, 'rptlConnectionFor').and.callFake((serverUrl: string): Subject<string> => {
      latestConnectedUrl = serverUrl;

      if (connection.isStopped) { // If a first game server has already been connected...
        return secondConnection; // ...then we go for the second connection
      } else {
        return connection;
      }
    });

    // Mocks hub connection to emulates hub behavior by controlling which servers list is received from it
    spyOn(SHARED_HUB_CONNECTION_FACTORY, 'hubConnectionFor').and.callFake((): Subject<GameServer[]> => {
      return hubConnectionStream;
    });

    // Initializes component decorator
    await TestBed.configureTestingModule({
      declarations: [ ServersListComponent ],
      providers: [
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
    // Gives access to current RpT Minigame type
    minigame = TestBed.inject(MinigameService);
    // Gives access

    // Begins event/binding detection cycle and provides the component from unit test configuration
    fixture = TestBed.createComponent(ServersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component listening for new game server lists and without any selected server', waitForAsync(() => {
    expect(component).toBeTruthy();

    // No game server is selected at the beginning of the component lifecycle
    expect(component.selectedServerName).toBeUndefined();

    // Will be received from the hub connection
    const newServersList = [
      new GameServer('Un', 'a'),
      new GameServer('Deux', 'c', new Availability(2, 2)),
      new GameServer('Trois', 'b')
    ];
    // Simulates received data from hub
    hubConnectionStream.receive(newServersList);

    // When initialization updating is done, every server inside the list should be listed by component
    fixture.whenStable().then(() => expectArrayToBeEqual(component.serversStatus, ...newServersList));
  }));

  describe('checkout()', () => {
    it('should send a request message to ask hub for an updated servers list', waitForAsync(() => {
      hubConnectionStream.clear(); // Get rid of data sent during the initialization phase
      component.checkout();

      // Expecting an empty list to have been sent, which will be translated as "REQUEST" by the serializer
      expectArrayToBeEqual(hubConnectionStream.sentMessagesQueue, []);
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

    it('should configure MinigameService ', () => {
      // Connects to the 6th game server which is playing on Canaries minigame
      component.select('Canaries #2');
      expect(minigame.getMinigameType()).toEqual(MinigameType.CANARIES); // Should have emitted selected game server minigame type
    });
  });
});
