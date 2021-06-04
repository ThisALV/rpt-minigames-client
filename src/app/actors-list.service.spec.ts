import { TestBed } from '@angular/core/testing';
import { ActorsListService } from './actors-list.service';
import { RptlProtocolService } from 'rpt-webapp-client';
import { expectArrayToContainAllOff, MockedMessagingSubject, unexpected } from './testing-helpers';


describe('ActorsListService', () => {
  // Giving access to this injectable, we can mocks server behavior using the following mocked connection
  let rptlProtcol: RptlProtocolService;
  // Mocked connection to checks sent messages and control received messages
  let connection: MockedMessagingSubject;

  let service: ActorsListService;

  beforeEach(() => {
    rptlProtcol = new RptlProtocolService();
    connection = new MockedMessagingSubject();

    TestBed.configureTestingModule({ // Uses RPTL protocol with required mocked connection
      providers: [
        { provide: RptlProtocolService, useValue: rptlProtcol }
      ]
    });

    service = TestBed.inject(ActorsListService);
  });

  it('should listen for available updated actors list and never stop', () => {
    expect(service).toBeTruthy(); // Should be created

    let lastEmittedList: number[] = []; // Last UIDs list emitted by subject
    service.getList().subscribe({
      next: (updatedList: number[]) => lastEmittedList = updatedList,
      // It should never stop
      error: unexpected,
      complete: unexpected
    });

    rptlProtcol.beginSession(connection); // Connects client to server
    rptlProtcol.register(42, 'ThisALV'); // Registers new actor as [42] ThisALV
    connection.receive('REGISTRATION 44 Redox 33 Lait2Vache 42 ThisALV'); // Registration with already registered players
    expectArrayToContainAllOff(lastEmittedList, 44, 33, 42); // Should contains every actors at initialization

    // Emulates a new player just joined Lobby
    connection.receive('LOGGED_IN 5 Cobalt');
    expectArrayToContainAllOff(lastEmittedList, 44, 33, 42, 5);

    // Emulates two players just left Lobby
    connection.receive('LOGGED_OUT 44');
    connection.receive('LOGGED_OUT 5');
    expectArrayToContainAllOff(lastEmittedList, 33, 42);
  });

  it('should update actors list manually when updateList() is called', () => {
    rptlProtcol.beginSession(connection); // Connects client to server
    rptlProtcol.register(42, 'ThisALV'); // Registers new actor as [42] ThisALV
    connection.receive('REGISTRATION 44 Redox 33 Lait2Vache 42 ThisALV'); // Registration with already registered players

    let lastEmittedList: number[] | undefined; // Last UIDs list emitted by subject
    service.getList().subscribe({
      next: (updatedList: number[]) => lastEmittedList = updatedList,
      // It should never stop
      error: unexpected,
      complete: unexpected
    });

    expect(lastEmittedList).toBeUndefined(); // No value emitted as actors list modifications happened before getList() subscription

    service.updateList(); // Now value is emitted manually
    expect(lastEmittedList).toHaveSize(3);
    expectArrayToContainAllOff(lastEmittedList as number[], 42, 33, 44); // Should contains every actors at initialization
  });
});
